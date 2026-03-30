import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { handle } from "hono/vercel";
import { z } from "zod";

import {
  analyzeStorePolicies,
  askPolicyQuestion,
  createStore,
  getLatestPolicy,
} from "@/lib/policies/analyzer";

const app = new Hono().basePath("/api");
const MAX_TRIES_PER_IP = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ipAttempts = new Map<string, number[]>();

const createStoreSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
});

/**
 * Resolves request IP from common proxy headers with fallback.
 *
 * @param c - Hono context for current request.
 * @returns Best-effort IP identifier used for rate limiting.
 */
function getRequestIp(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return c.req.header("x-real-ip") ?? c.req.header("cf-connecting-ip") ?? "unknown";
}

/**
 * Applies lazy in-memory IP rate limiting for store analysis attempts.
 *
 * @param ip - Caller IP string.
 * @returns Remaining attempts and whether request is allowed.
 */
function consumeIpAttempt(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const attempts = ipAttempts.get(ip) ?? [];
  const withinWindow = attempts.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (withinWindow.length >= MAX_TRIES_PER_IP) {
    ipAttempts.set(ip, withinWindow);
    return { allowed: false, remaining: 0 };
  }

  withinWindow.push(now);
  ipAttempts.set(ip, withinWindow);
  return { allowed: true, remaining: MAX_TRIES_PER_IP - withinWindow.length };
}

app.get("/health", (c) => {
  return c.json({ ok: true, service: "pango-policy-api" });
});

app.post("/stores", async (c) => {
  const ip = getRequestIp(c);
  const rateLimit = consumeIpAttempt(ip);
  if (!rateLimit.allowed) {
    return c.json(
      {
        error: "Try limit reached for your IP. Please retry tomorrow.",
        remaining: rateLimit.remaining,
      },
      429,
    );
  }

  const rawInput = await c.req.json().catch(() => null);
  const parsedInput = createStoreSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return c.json(
      {
        error: "Invalid request payload",
        details: parsedInput.error.flatten(),
      },
      400,
    );
  }

  const created = await createStore(parsedInput.data);
  return c.json(
    {
      store_id: created.storeId,
      status: created.status,
      reused: created.reused,
    },
    created.reused ? 200 : 201,
  );
});

app.get("/stores/:storeId/policies", async (c) => {
  const storeId = c.req.param("storeId");
  const policy = await getLatestPolicy(storeId);
  if (!policy) {
    return c.json({ error: "No policy analysis found for this store." }, 404);
  }
  return c.json(policy);
});

app.get("/stores/:storeId/policies/ask", async (c) => {
  const storeId = c.req.param("storeId");
  const question = c.req.query("q")?.trim();

  if (!question) {
    return c.json({ error: "Missing required query parameter: q" }, 400);
  }

  try {
    const result = await askPolicyQuestion({
      storeId,
      question,
    });
    return c.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Policy question failed.";
    const status = /No policy analysis found/i.test(message) ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.get("/stores/:storeId/policies/stream", async (c) => {
  const storeId = c.req.param("storeId");

  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({
        event: "stage",
        data: JSON.stringify({
          step: "start",
          message: "Starting store policy analysis",
          percent: 5,
        }),
      });

      await analyzeStorePolicies(storeId, async (event, payload) => {
        await stream.writeSSE({
          event,
          data: JSON.stringify(payload),
        });
      });
    } catch (error) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          step: "failed",
          message:
            error instanceof Error ? error.message : "Policy analysis failed.",
        }),
      });
    }
  });
});

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
export const HEAD = handle(app);
