import { Readability } from "@mozilla/readability";
import { generateText, Output } from "ai";
import { load } from "cheerio";
import { and, desc, eq } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { parseStringPromise } from "xml2js";
import { z } from "zod";

import { env } from "@/env";
import { db } from "@/lib/db";
import { storePolicies, stores } from "@/lib/db/schema";

const POLICY_REGEX = /shipping|return|refund|policy|exchange/i;
const HOMEPAGE_LINK_REGEX =
  /shipping|return|refund|policy|exchange|support|help|happyreturns/i;
const BLOCKED_PATH_PREFIXES = ["/products/", "/collections/"];
const BLOCKED_FILE_EXTENSIONS = [
  ".js",
  ".css",
  ".mjs",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
];

const KNOWN_POLICY_PATHS = [
  "/policies/shipping-policy",
  "/policies/return-policy",
  "/policies/refund-policy",
  "/policies/exchange-policy",
];

const BROWSERISH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
};

const extractedPolicySchema = z.object({
  confidence: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  carriers: z.array(z.string()).nullable().optional(),
  domestic_duration: z.string().nullable().optional(),
  international_available: z.boolean().nullable().optional(),
  free_shipping_threshold: z.string().nullable().optional(),
  processing_time: z.string().nullable().optional(),
  return_window_days: z.number().int().nullable().optional(),
  return_window_desc: z.string().nullable().optional(),
  non_returnable_items: z.array(z.string()).nullable().optional(),
  exchanges_available: z.boolean().nullable().optional(),
  return_fee: z.string().nullable().optional(),
  exchange_fee: z.string().nullable().optional(),
  refund_methods: z.array(z.string()).nullable().optional(),
  condition_required: z.string().nullable().optional(),
});

const policyExtractionModelId =
  env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6";

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
});

export type StreamEventName =
  | "stage"
  | "progress"
  | "warning"
  | "error"
  | "complete";

export type StreamEventPayload = {
  step?: string;
  message: string;
  percent?: number;
  urls?: string[];
  warnings?: string[];
  result?: unknown;
};

export type StreamEmitter = (
  event: StreamEventName,
  payload: StreamEventPayload,
) => Promise<void>;

type ExtractedPolicy = z.infer<typeof extractedPolicySchema>;

/**
 * Builds homepage URL variants to improve fetch success across host configs.
 *
 * @param storeUrl - Canonical store URL.
 * @returns Candidate homepage URLs (e.g. apex and www variants).
 */
function getHomepageCandidates(storeUrl: string): string[] {
  const candidates = new Set<string>();
  const url = new URL(storeUrl);
  const bareHost = url.hostname.replace(/^www\./i, "");
  const hostVariants = [bareHost, `www.${bareHost}`];

  for (const host of hostVariants) {
    candidates.add(`${url.protocol}//${host}`);
  }

  return [...candidates];
}

/**
 * Determines whether a discovered URL should be kept as a policy candidate.
 *
 * Filters out product/collection pages and static assets to reduce false positives.
 *
 * @param urlString - Absolute URL to evaluate.
 * @returns True when URL is a relevant policy candidate.
 */
function shouldIncludePolicyUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const path = url.pathname.toLowerCase();

    if (BLOCKED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return false;
    }

    if (BLOCKED_FILE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches homepage HTML using resilient host and header fallbacks.
 *
 * @param storeUrl - Canonical store URL.
 * @returns Final resolved URL and its HTML, or nulls when unavailable.
 */
async function fetchHomepageHtml(storeUrl: string): Promise<{
  finalUrl: string | null;
  html: string | null;
}> {
  const candidates = getHomepageCandidates(storeUrl);
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(6000),
        headers: BROWSERISH_HEADERS,
      });
      if (!res.ok) {
        continue;
      }
      const html = await res.text();
      if (!html.trim()) {
        continue;
      }

      return { finalUrl: res.url || candidate, html };
    } catch {
      continue;
    }
  }

  return { finalUrl: null, html: null };
}

/**
 * Reads robots.txt and extracts sitemap and crawl-delay metadata.
 *
 * @param storeUrl - Canonical store URL.
 * @returns Parsed robots metadata with nullable fields when unavailable.
 */
async function getRobotsInfo(storeUrl: string): Promise<{
  sitemapUrl: string | null;
  crawlDelay: number | null;
}> {
  try {
    const res = await fetch(`${storeUrl}/robots.txt`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return { sitemapUrl: null, crawlDelay: null };
    }

    const text = await res.text();
    const lines = text.split("\n").map((line) => line.trim());

    const sitemapLine = lines.find((line) =>
      line.toLowerCase().startsWith("sitemap:"),
    );
    const rawSitemapUrl = sitemapLine
      ? sitemapLine.replace(/^sitemap:\s*/i, "").trim()
      : null;
    const sitemapUrl = rawSitemapUrl
      ? (() => {
          try {
            return new URL(rawSitemapUrl).toString();
          } catch {
            return null;
          }
        })()
      : null;

    const crawlDelayLine = lines.find((line) =>
      line.toLowerCase().startsWith("crawl-delay:"),
    );
    const crawlDelayRaw = crawlDelayLine
      ? parseInt(crawlDelayLine.replace(/^crawl-delay:\s*/i, ""), 10)
      : NaN;
    const crawlDelay = Number.isNaN(crawlDelayRaw) ? null : crawlDelayRaw;

    return { sitemapUrl, crawlDelay };
  } catch {
    return { sitemapUrl: null, crawlDelay: null };
  }
}

/**
 * Resolves the pages sub-sitemap from a sitemap index URL.
 *
 * @param sitemapIndexUrl - Sitemap index URL, usually from robots.txt.
 * @returns Pages sitemap URL when present, otherwise null.
 */
async function getPagesSubSitemapUrl(
  sitemapIndexUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(sitemapIndexUrl, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return null;
    }

    const xml = await res.text();
    const parsed = await parseStringPromise(xml);

    const subSitemaps =
      parsed.sitemapindex?.sitemap?.map((s: { loc?: string[] }) => s.loc?.[0]) ??
      [];

    const pagesSitemap =
      subSitemaps.find((loc: string | undefined) =>
        (loc ?? "").includes("sitemap_pages"),
      ) ?? null;
    return pagesSitemap;
  } catch {
    return null;
  }
}

/**
 * Extracts policy-like URLs from a pages sitemap document.
 *
 * @param pagesSitemapUrl - URL of the pages sitemap.
 * @returns Policy candidate URLs from the sitemap.
 */
async function getPolicyUrlsFromPagesSitemap(
  pagesSitemapUrl: string,
): Promise<string[]> {
  try {
    const res = await fetch(pagesSitemapUrl, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return [];
    }

    const xml = await res.text();
    const parsed = await parseStringPromise(xml);
    const allUrls: string[] =
      parsed.urlset?.url?.map((u: { loc: string[] }) => u.loc[0]) ?? [];

    return allUrls.filter(
      (url) => POLICY_REGEX.test(url) && shouldIncludePolicyUrl(url),
    );
  } catch {
    return [];
  }
}

/**
 * Checks known policy path patterns directly on the store domain.
 *
 * @param storeUrl - Canonical store URL.
 * @returns Known-path URLs that exist and pass filtering.
 */
async function probeKnownPolicyPaths(storeUrl: string): Promise<string[]> {
  const results = await Promise.allSettled(
    KNOWN_POLICY_PATHS.map(async (path) => {
      const res = await fetch(`${storeUrl}${path}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
      });
      const candidate = `${storeUrl}${path}`;
      return res.ok && shouldIncludePolicyUrl(candidate) ? candidate : null;
    }),
  );

  return results
    .filter(
      (result): result is PromiseFulfilledResult<string> =>
        result.status === "fulfilled" && result.value !== null,
    )
    .map((result) => result.value);
}

/**
 * Extracts policy-like links from homepage HTML via DOM parsing.
 *
 * @param storeUrl - Canonical store URL.
 * @returns Filtered, deduplicated policy candidate links.
 */
async function getPolicyUrlsFromHomepage(storeUrl: string): Promise<string[]> {
  const { finalUrl, html } = await fetchHomepageHtml(storeUrl);
  if (!html || !finalUrl) {
    return [];
  }

  try {
    const links = new Set<string>();
    const $ = load(html);
    const hrefValues = $("a[href], link[href]")
      .map((_, element) => $(element).attr("href"))
      .get();

    for (const hrefValue of hrefValues) {
      const href = hrefValue?.trim();
      if (!href) {
        continue;
      }

      try {
        const absolute = new URL(href, finalUrl).toString();
        if (!/^https?:\/\//i.test(absolute)) {
          continue;
        }
        if (
          HOMEPAGE_LINK_REGEX.test(absolute) &&
          shouldIncludePolicyUrl(absolute)
        ) {
          links.add(absolute);
        }
      } catch {
        continue;
      }
    }

    return [...links];
  } catch {
    return [];
  }
}

/**
 * Discovers policy-related URLs using sitemap, known paths, and homepage links.
 *
 * @param storeUrl - Store URL to inspect.
 * @returns Deduplicated URLs plus metadata about source channels and crawl-delay.
 */
export async function findPolicyUrls(storeUrl: string): Promise<{
  urls: string[];
  source: Array<"sitemap" | "known-paths" | "homepage">;
  crawlDelay: number | null;
}> {
  const normalizedUrl = storeUrl.replace(/\/$/, "");

  const [robotsInfo, knownPathUrls, homepageUrls] = await Promise.all([
    getRobotsInfo(normalizedUrl),
    probeKnownPolicyPaths(normalizedUrl),
    getPolicyUrlsFromHomepage(normalizedUrl),
  ]);

  const sitemapUrl = robotsInfo.sitemapUrl ?? `${normalizedUrl}/sitemap.xml`;
  const pagesSitemapUrl = await getPagesSubSitemapUrl(sitemapUrl);
  const sitemapPolicyUrls = pagesSitemapUrl
    ? await getPolicyUrlsFromPagesSitemap(pagesSitemapUrl)
    : [];

  const allUrls = [
    ...new Set([...sitemapPolicyUrls, ...knownPathUrls, ...homepageUrls]),
  ];

  const source: Array<"sitemap" | "known-paths" | "homepage"> = [];
  if (sitemapPolicyUrls.length > 0) source.push("sitemap");
  if (knownPathUrls.length > 0) source.push("known-paths");
  if (homepageUrls.length > 0) source.push("homepage");

  return {
    urls: allUrls,
    source,
    crawlDelay: robotsInfo.crawlDelay,
  };
}

/**
 * Converts HTML to reader-friendly text with Mozilla Readability.
 *
 * @param html - Raw page HTML.
 * @param url - Source page URL.
 * @returns Extracted readable text, or null if extraction fails.
 */
function extractReadableText(html: string, url: string): string | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article?.textContent?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Scrapes policy pages and extracts plain text blocks for analysis.
 *
 * @param urls - Policy URLs to fetch.
 * @param emit - Stream event emitter used for progress updates.
 * @returns Aggregated policy text and the URLs that successfully yielded text.
 */
async function scrapePolicyPages(
  urls: string[],
  emit: StreamEmitter,
): Promise<{ policyText: string; successfulUrls: string[] }> {
  const chunks: string[] = [];
  const successfulUrls: string[] = [];

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    await emit("progress", {
      step: "scrape",
      message: `Reading policy page ${index + 1}/${urls.length}`,
      percent: Math.round(30 + (index / Math.max(urls.length, 1)) * 30),
      urls: [url],
    });

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(9000),
        headers: BROWSERISH_HEADERS,
      });
      if (!res.ok) {
        continue;
      }
      const html = await res.text();
      const text = extractReadableText(html, url);
      if (!text || text.length < 120) {
        continue;
      }

      successfulUrls.push(url);
      chunks.push(`Source: ${url}\n${text}`);
    } catch {
      continue;
    }
  }

  return { policyText: chunks.join("\n\n---\n\n"), successfulUrls };
}

/**
 * Extracts structured policy fields from combined policy text with AI SDK.
 *
 * @param policyText - Combined textual policy content.
 * @returns Structured policy object aligned with database fields.
 */
async function extractPolicyData(policyText: string): Promise<ExtractedPolicy> {
  const result = await generateText({
    model: openrouter.chat(policyExtractionModelId),
    output: Output.object({
      schema: extractedPolicySchema,
      name: "StorePolicyExtraction",
      description: "Structured shipping and returns policy fields for onboarding",
    }),
    temperature: 0,
    prompt: [
      "You are extracting ecommerce shipping and returns policy data.",
      "Return only facts grounded in the provided text.",
      "If unknown, return null values.",
      "Set confidence to one of: low, medium, high.",
      "",
      "Policy text:",
      policyText.slice(0, 25000),
    ].join("\n"),
  });

  return result.output;
}

/**
 * Creates concise onboarding bullets from extracted policy fields.
 *
 * @param policy - Persisted policy record fields.
 * @returns User-facing summary and warning bullet arrays.
 */
export function buildOnboardingInsights(policy: {
  return_window_days: number | null;
  return_window_desc: string | null;
  free_shipping_threshold: string | null;
  non_returnable_items: string[] | null;
  exchanges_available: boolean | null;
  refund_methods: string[] | null;
  return_fee: string | null;
}): { summaryCard: string[]; warnings: string[] } {
  const summaryCard: string[] = [];
  const warnings: string[] = [];

  if (policy.return_window_days) {
    summaryCard.push(
      `Returns accepted within ${policy.return_window_days} days of delivery`,
    );
    if (policy.return_window_days < 30) {
      warnings.push(
        `Return window (${policy.return_window_days} days) is below industry average (30 days)`,
      );
    }
  } else if (policy.return_window_desc) {
    summaryCard.push(`Returns policy: ${policy.return_window_desc}`);
  }

  if (policy.free_shipping_threshold) {
    summaryCard.push(`Free shipping: ${policy.free_shipping_threshold}`);
  }

  if ((policy.non_returnable_items?.length ?? 0) > 0) {
    summaryCard.push(
      `Non-returnable items: ${policy.non_returnable_items?.join(", ")}`,
    );
  }

  if (policy.exchanges_available === false) {
    summaryCard.push("No exchanges available");
    if ((policy.refund_methods?.length ?? 0) > 0) {
      summaryCard.push(`Refund methods: ${policy.refund_methods?.join(", ")}`);
    }
  } else if (policy.exchanges_available === null) {
    warnings.push("Exchange policy is unclear");
  }

  if (policy.return_fee && !/free|no fee|included/i.test(policy.return_fee)) {
    warnings.push(`Return shipping fee noted: ${policy.return_fee}`);
  }

  return { summaryCard, warnings };
}

/**
 * Creates a store row and returns its identifier.
 *
 * @param input - Minimal store identity payload.
 * @returns Created store id with initial status.
 */
export async function createStore(input: {
  url: string;
  name: string;
}): Promise<{ storeId: string; status: "analyzing" }> {
  const normalizedUrl = input.url.trim().replace(/\/$/, "");
  const [created] = await db
    .insert(stores)
    .values({
      url: normalizedUrl,
      name: input.name.trim(),
    })
    .returning({ id: stores.id });

  return { storeId: created.id, status: "analyzing" };
}

/**
 * Runs end-to-end policy analysis and streams human-readable progress events.
 *
 * @param storeId - Store identifier to analyze.
 * @param emit - SSE event emitter.
 * @returns Persisted policy record plus onboarding insight bullets.
 */
export async function analyzeStorePolicies(
  storeId: string,
  emit: StreamEmitter,
): Promise<{
  policy: typeof storePolicies.$inferSelect;
  summaryCard: string[];
  warnings: string[];
}> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for policy analysis.");
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });
  if (!store) {
    throw new Error("Store not found.");
  }

  await emit("stage", {
    step: "discover",
    message: "Discovering policy URLs across sitemap, known paths, and homepage links",
    percent: 15,
  });

  const discovery = await findPolicyUrls(store.url);
  if (discovery.urls.length === 0) {
    throw new Error("No policy URLs were discovered for this store.");
  }

  await emit("progress", {
    step: "discover",
    message: `Found ${discovery.urls.length} candidate policy pages`,
    percent: 25,
    urls: discovery.urls,
  });

  await emit("stage", {
    step: "scrape",
    message: "Extracting readable policy text from discovered pages",
    percent: 30,
  });
  const { policyText, successfulUrls } = await scrapePolicyPages(
    discovery.urls,
    emit,
  );

  if (!policyText.trim()) {
    throw new Error("Could not extract readable policy text from discovered pages.");
  }

  await emit("stage", {
    step: "extract",
    message: "Using AI structured output to extract shipping and returns fields",
    percent: 70,
  });
  const extracted = await extractPolicyData(policyText);

  await emit("stage", {
    step: "persist",
    message: "Saving structured policy output to your database",
    percent: 90,
  });

  const [createdPolicy] = await db
    .insert(storePolicies)
    .values({
      store_id: store.id,
      sources_found: discovery.source,
      confidence: extracted.confidence ?? null,
      notes: extracted.notes ?? null,
      carriers: extracted.carriers ?? null,
      domestic_duration: extracted.domestic_duration ?? null,
      international_available: extracted.international_available ?? null,
      free_shipping_threshold: extracted.free_shipping_threshold ?? null,
      processing_time: extracted.processing_time ?? null,
      return_window_days: extracted.return_window_days ?? null,
      return_window_desc: extracted.return_window_desc ?? null,
      non_returnable_items: extracted.non_returnable_items ?? null,
      exchanges_available: extracted.exchanges_available ?? null,
      return_fee: extracted.return_fee ?? null,
      exchange_fee: extracted.exchange_fee ?? null,
      refund_methods: extracted.refund_methods ?? null,
      condition_required: extracted.condition_required ?? null,
      raw_json: extracted,
      policy_text: policyText,
    })
    .returning();

  const insights = buildOnboardingInsights(createdPolicy);

  await emit("complete", {
    step: "complete",
    message: "Analysis complete. Your onboarding summary is ready.",
    percent: 100,
    urls: successfulUrls,
    warnings: insights.warnings,
    result: {
      store_id: store.id,
      policy_id: createdPolicy.id,
      summaryCard: insights.summaryCard,
      warnings: insights.warnings,
    },
  });

  return {
    policy: createdPolicy,
    summaryCard: insights.summaryCard,
    warnings: insights.warnings,
  };
}

/**
 * Fetches the latest policy analysis for a store with onboarding insights.
 *
 * @param storeId - Store identifier.
 * @returns Latest persisted policy payload or null when absent.
 */
export async function getLatestPolicy(storeId: string): Promise<{
  policy: typeof storePolicies.$inferSelect;
  summaryCard: string[];
  warnings: string[];
} | null> {
  const latestPolicy = await db.query.storePolicies.findFirst({
    where: eq(storePolicies.store_id, storeId),
    orderBy: [desc(storePolicies.analyzed_at), desc(storePolicies.id)],
  });

  if (!latestPolicy) {
    return null;
  }

  const insights = buildOnboardingInsights(latestPolicy);
  return {
    policy: latestPolicy,
    summaryCard: insights.summaryCard,
    warnings: insights.warnings,
  };
}

/**
 * Answers a freeform question using the latest stored policy text for a store.
 *
 * @param input - Store/question payload used for grounded Q&A.
 * @returns Answer text with policy metadata for the response surface.
 */
export async function askPolicyQuestion(input: {
  storeId: string;
  question: string;
}): Promise<{
  answer: string;
  policyId: string;
  analyzedAt: Date | null;
}> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for policy Q&A.");
  }

  const latestPolicy = await db.query.storePolicies.findFirst({
    where: eq(storePolicies.store_id, input.storeId),
    orderBy: [desc(storePolicies.analyzed_at), desc(storePolicies.id)],
    columns: {
      id: true,
      analyzed_at: true,
      policy_text: true,
    },
  });

  if (!latestPolicy) {
    throw new Error("No policy analysis found for this store.");
  }

  const policyText = latestPolicy.policy_text?.trim();
  if (!policyText) {
    throw new Error("Policy text is empty for this store.");
  }

  const result = await generateText({
    model: openrouter.chat(policyExtractionModelId),
    temperature: 0.2,
    system: [
      "You answer merchant onboarding questions strictly using the supplied policy text.",
      "If the answer is not clearly present, say you are unsure and what is missing.",
      "Be concise and practical.",
    ].join(" "),
    prompt: [
      `Question: ${input.question.trim()}`,
      "",
      "Policy text:",
      policyText.slice(0, 30000),
    ].join("\n"),
  });

  return {
    answer: result.text.trim(),
    policyId: latestPolicy.id,
    analyzedAt: latestPolicy.analyzed_at ?? null,
  };
}

/**
 * Checks whether a policy row already exists for a store.
 *
 * @param storeId - Store identifier.
 * @returns True if a policy record already exists.
 */
export async function hasPolicyForStore(storeId: string): Promise<boolean> {
  const existing = await db.query.storePolicies.findFirst({
    where: and(eq(storePolicies.store_id, storeId)),
    columns: { id: true },
  });
  return Boolean(existing);
}
