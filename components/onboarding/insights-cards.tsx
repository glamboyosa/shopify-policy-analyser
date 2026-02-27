"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type InsightsCardsProps = {
  summaryCard: string[];
  warnings: string[];
};

export function InsightsCards({ summaryCard, warnings }: InsightsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Summary Card</CardTitle>
          <CardDescription>
            Deterministic merchant-facing bullets generated from extracted policy fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {summaryCard.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Complete analysis to render summary bullets.
            </p>
          ) : (
            summaryCard.map((item) => (
              <p key={item} className="text-xs">
                ✓ {item}
              </p>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policy Gap Warnings</CardTitle>
          <CardDescription>
            Conversion-risk flags surfaced from structured policy output.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {warnings.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No warnings yet, or analysis not complete.
            </p>
          ) : (
            warnings.map((warning) => (
              <p key={warning} className="text-xs">
                ⚠ {warning}
              </p>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
