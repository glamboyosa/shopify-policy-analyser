"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  parseRegionOverrides,
  type RegionOverride,
} from "@/lib/policies/region-policy";

type RegionInsightsProps = {
  defaultRegion: string | null;
  regionOverridesRaw: unknown;
};

/**
 * Renders non-empty lines for a single regional override row.
 *
 * @param row - Parsed override from extraction.
 * @returns List items to show under the region heading.
 */
function regionOverrideItems(row: RegionOverride) {
  const items: { key: string; label: string; value: string }[] = [];
  if (row.shipping_details?.trim()) {
    items.push({
      key: "ship",
      label: "Shipping",
      value: row.shipping_details.trim(),
    });
  }
  if (row.return_window_days != null) {
    items.push({
      key: "rwd",
      label: "Return window",
      value: `${row.return_window_days} days`,
    });
  }
  if (row.return_window_desc?.trim()) {
    items.push({
      key: "rwdesc",
      label: "Returns",
      value: row.return_window_desc.trim(),
    });
  }
  if (row.free_shipping_threshold?.trim()) {
    items.push({
      key: "fst",
      label: "Free shipping",
      value: row.free_shipping_threshold.trim(),
    });
  }
  if (row.exchanges_available != null) {
    items.push({
      key: "ex",
      label: "Exchanges",
      value: row.exchanges_available ? "yes" : "no",
    });
  }
  if (row.notes?.trim()) {
    items.push({ key: "notes", label: "Notes", value: row.notes.trim() });
  }
  return items;
}

/**
 * Shows regional policy variation: accordion when overrides exist, otherwise a simple
 * default-region line when the model inferred one.
 *
 * @param props - Raw policy region fields from the API.
 * @returns Region card or null when there is nothing to show.
 */
export function RegionInsights({
  defaultRegion,
  regionOverridesRaw,
}: RegionInsightsProps) {
  const overrides = parseRegionOverrides(regionOverridesRaw);

  if (overrides?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Region-specific terms</CardTitle>
          <CardDescription>
            {defaultRegion?.trim()
              ? `Default region noted: ${defaultRegion.trim()}. Terms below differ by region.`
              : "Structured fields differ by region. Expand for highlights from extraction."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details className="group rounded-lg border border-border bg-muted/30 p-3">
            <summary className="cursor-pointer list-none text-sm font-medium outline-none [&::-webkit-details-marker]:hidden">
              <span className="underline-offset-4 group-open:underline">
                Varies by region — click to see details
              </span>
            </summary>
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {overrides.map((row) => {
                const items = regionOverrideItems(row);
                return (
                  <details
                    key={row.region}
                    className="rounded-md border border-border/80 bg-background p-2"
                  >
                    <summary className="cursor-pointer text-sm font-medium">
                      {row.region}
                    </summary>
                    {items.length === 0 ? (
                      <p className="text-muted-foreground mt-2 pl-1 text-xs">
                        No extra structured fields for this region; ask below or refer to
                        the full policy text.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 pl-3 text-xs text-muted-foreground">
                        {items.map((item) => (
                          <li key={item.key}>
                            <span className="text-foreground/90">{item.label}: </span>
                            {item.value}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                );
              })}
            </div>
          </details>
        </CardContent>
      </Card>
    );
  }

  if (defaultRegion?.trim()) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Region</CardTitle>
          <CardDescription>
            Default region inferred from policy text (when stated).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{defaultRegion.trim()}</p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
