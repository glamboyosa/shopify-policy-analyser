"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StreamEvent } from "@/lib/policies/client-types";

type StreamTimelineProps = {
  events: StreamEvent[];
};

/**
 * Finds the latest stream percent to power the progress bar.
 *
 * @param events - Ordered stream event list.
 * @returns Progress number from 0 to 100.
 */
function getProgressPercent(events: StreamEvent[]): number {
  const withPercent = [...events]
    .reverse()
    .find((event) => typeof event.data.percent === "number");
  return withPercent?.data.percent ?? 0;
}

export function StreamTimeline({ events }: StreamTimelineProps) {
  const progressPercent = getProgressPercent(events);
  const streamError = events.find((event) => event.event === "error");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Analysis Stream</CardTitle>
        <CardDescription>
          Progress updates are streamed from SSE so users are never blocked on a blank screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 w-full rounded bg-muted">
          <div
            className="h-2 rounded bg-primary transition-all"
            style={{ width: `${Math.max(2, progressPercent)}%` }}
          />
        </div>

        <div className="max-h-56 space-y-2 overflow-auto rounded border p-3">
          {events.length === 0 ? (
            <p className="text-muted-foreground">No events yet. Start an analysis run.</p>
          ) : (
            events.map((event, index) => (
              <div
                key={`${event.event}-${index}`}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <p>{event.data.message ?? "Update received."}</p>
                <Badge variant="outline">{event.event}</Badge>
              </div>
            ))
          )}
        </div>

        {streamError ? (
          <p className="text-xs text-destructive">
            {streamError.data.message ?? "Analysis failed."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
