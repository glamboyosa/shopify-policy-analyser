/**
 * Shared types and helpers for regional policy extraction (shipping/returns by region).
 */

export type RegionOverride = {
  region: string;
  shipping_details?: string | null;
  return_window_days?: number | null;
  return_window_desc?: string | null;
  free_shipping_threshold?: string | null;
  exchanges_available?: boolean | null;
  notes?: string | null;
};

export type PolicyDigestInput = {
  default_region: string | null;
  region_overrides: unknown;
  return_window_days: number | null;
  return_window_desc: string | null;
  free_shipping_threshold: string | null;
  domestic_duration: string | null;
  international_available: boolean | null;
  exchanges_available: boolean | null;
  processing_time: string | null;
  carriers: string[] | null;
};

/**
 * Normalizes JSONB / API `region_overrides` into a list of typed rows.
 *
 * @param value - Raw JSON value from storage or transport.
 * @returns Parsed overrides, or null when absent or empty.
 */
export function parseRegionOverrides(value: unknown): RegionOverride[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const out: RegionOverride[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const region = typeof row.region === "string" ? row.region.trim() : "";
    if (!region) {
      continue;
    }

    out.push({
      region,
      shipping_details:
        typeof row.shipping_details === "string" ? row.shipping_details : null,
      return_window_days:
        typeof row.return_window_days === "number" &&
        Number.isFinite(row.return_window_days)
          ? row.return_window_days
          : null,
      return_window_desc:
        typeof row.return_window_desc === "string" ? row.return_window_desc : null,
      free_shipping_threshold:
        typeof row.free_shipping_threshold === "string"
          ? row.free_shipping_threshold
          : null,
      exchanges_available:
        typeof row.exchanges_available === "boolean" ? row.exchanges_available : null,
      notes: typeof row.notes === "string" ? row.notes : null,
    });
  }

  return out.length > 0 ? out : null;
}

/**
 * Builds a compact plaintext digest of structured fields for Q&A grounding.
 * When empty, callers should omit it from prompts.
 *
 * @param policy - Merged extraction fields from a policy row.
 * @returns Multiline digest, or empty string when nothing to add.
 */
export function buildPolicyStructuredDigest(policy: PolicyDigestInput): string {
  const lines: string[] = [];

  const general: string[] = [];
  if (policy.return_window_days != null) {
    general.push(`returns within ${policy.return_window_days} days`);
  }
  if (policy.return_window_desc?.trim()) {
    general.push(`returns: ${policy.return_window_desc.trim()}`);
  }
  if (policy.free_shipping_threshold?.trim()) {
    general.push(`free shipping threshold: ${policy.free_shipping_threshold.trim()}`);
  }
  if (policy.domestic_duration?.trim()) {
    general.push(`domestic delivery: ${policy.domestic_duration.trim()}`);
  }
  if (policy.processing_time?.trim()) {
    general.push(`processing: ${policy.processing_time.trim()}`);
  }
  if (policy.international_available != null) {
    general.push(
      `international shipping: ${policy.international_available ? "yes" : "no"}`,
    );
  }
  if (policy.exchanges_available != null) {
    general.push(`exchanges: ${policy.exchanges_available ? "yes" : "no"}`);
  }
  if (policy.carriers && policy.carriers.length > 0) {
    general.push(`carriers: ${policy.carriers.join(", ")}`);
  }

  const overrides = parseRegionOverrides(policy.region_overrides);

  const hasGeneral = general.length > 0;
  const hasDefault = Boolean(policy.default_region?.trim());
  const hasOverrides = Boolean(overrides?.length);

  if (!hasGeneral && !hasDefault && !hasOverrides) {
    return "";
  }

  lines.push(
    "Structured extraction digest (may be incomplete; if this disagrees with the policy text below, trust the text).",
    "",
  );

  if (hasDefault) {
    lines.push(`Default region: ${policy.default_region!.trim()}`);
  }

  if (hasGeneral) {
    lines.push(`General (merged): ${general.join("; ")}`);
  }

  if (hasOverrides && overrides) {
    lines.push("");
    lines.push("Per-region overrides:");
    for (const o of overrides) {
      const bits: string[] = [];
      if (o.shipping_details?.trim()) {
        bits.push(`shipping: ${o.shipping_details.trim()}`);
      }
      if (o.return_window_days != null) {
        bits.push(`return window: ${o.return_window_days} days`);
      }
      if (o.return_window_desc?.trim()) {
        bits.push(`returns: ${o.return_window_desc.trim()}`);
      }
      if (o.free_shipping_threshold?.trim()) {
        bits.push(`free shipping: ${o.free_shipping_threshold.trim()}`);
      }
      if (o.exchanges_available != null) {
        bits.push(`exchanges: ${o.exchanges_available ? "yes" : "no"}`);
      }
      if (o.notes?.trim()) {
        bits.push(`notes: ${o.notes.trim()}`);
      }
      lines.push(`- ${o.region}: ${bits.length > 0 ? bits.join("; ") : "see policy text"}`);
    }
  }

  return lines.join("\n").trim();
}
