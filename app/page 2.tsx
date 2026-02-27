"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  experimental_streamedQuery as streamedQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type StreamPayload = {
  step?: string;
  message?: string;
  percent?: number;
  warnings?: string[];
  result?: {
    summaryCard?: string[];
    warnings?: string[];
  };
};

type StreamEvent = {
  event: string;
  data: StreamPayload;
};

type PolicyResponse = {
  summaryCard: string[];
  warnings: string[];
  policy: {
    analyzed_at: string | null;
    confidence: string | null;
  };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const queryClient = new QueryClient();

/**
 * Parses a raw SSE event block into event/data structure.
 *
 * @param block - Raw SSE event text separated by double newlines.
 * @returns Parsed event with JSON data payload, or null if invalid.
 */
function parseSseBlock(block: string): StreamEvent | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.replace(/^event:\s*/, "").trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.replace(/^data:\s*/, ""));
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")) as StreamPayload,
    };
  } catch {
    return null;
  }
}

/**
 * Streams SSE events from the policy analysis endpoint.
 *
 * @param storeId - Store identifier used for stream URL.
 * @param signal - Abort signal from query lifecycle.
 * @returns Async iterable that yields parsed stream events.
 */
async function* streamPolicyAnalysis(
  storeId: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`/api/stores/${storeId}/policies/stream`, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    cache: "no-store",
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error("Could not connect to the analysis stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const parsed = parseSseBlock(chunk.trim());
      if (parsed) {
        yield parsed;
      }
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseBlock(buffer.trim());
    if (parsed) {
      yield parsed;
    }
  }
}

/**
 * Builds a storage key for chat history namespaced by store id.
 *
 * @param storeId - Current store identifier.
 * @returns Stable localStorage key for that store.
 */
function getChatStorageKey(storeId: string): string {
  return `pango-policy-chat:${storeId}`;
}

/**
 * Returns a unique ID used for rendering message lists.
 *
 * @returns Time-based random-ish ID string.
 */
function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function OnboardingPage() {
  const [storeUrl, setStoreUrl] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [streamRun, setStreamRun] = useState(0);
  const [question, setQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const createStoreMutation = useMutation({
    mutationFn: async (input: { url: string; name: string }) => {
      const response = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error("Failed to create store.");
      }
      return (await response.json()) as { store_id: string; status: string };
    },
  });

  const streamQuery = useQuery({
    queryKey: ["policy-stream", storeId, streamRun],
    enabled: Boolean(storeId && streamRun > 0),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
    queryFn: streamedQuery<StreamEvent, StreamEvent[]>({
      streamFn: async ({ signal }) => {
        if (!storeId) {
          throw new Error("Missing store id for analysis.");
        }
        return streamPolicyAnalysis(storeId, signal);
      },
      initialValue: [],
      reducer: (accumulator, chunk) => [...accumulator, chunk],
    }),
  });

  const streamEvents: StreamEvent[] = streamQuery.data ?? [];
  const completeEvent = streamEvents.find((event) => event.event === "complete");
  const streamError = streamEvents.find((event) => event.event === "error");
  const analysisCompleted = Boolean(completeEvent);

  const policyQuery = useQuery({
    queryKey: ["store-policy", storeId],
    enabled: Boolean(storeId && analysisCompleted),
    queryFn: async () => {
      const response = await fetch(`/api/stores/${storeId}/policies`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load policy results.");
      }
      return (await response.json()) as PolicyResponse;
    },
  });

  const askMutation = useMutation({
    mutationFn: async (input: { storeId: string; q: string }) => {
      const params = new URLSearchParams({ q: input.q });
      const response = await fetch(
        `/api/stores/${input.storeId}/policies/ask?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not answer that question.");
      }
      return (await response.json()) as { answer: string };
    },
  });

  useEffect(() => {
    if (!storeId) {
      setChatMessages([]);
      return;
    }
    const stored = localStorage.getItem(getChatStorageKey(storeId));
    if (!stored) {
      setChatMessages([]);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as ChatMessage[];
      setChatMessages(parsed);
    } catch {
      setChatMessages([]);
    }
  }, [storeId]);

  useEffect(() => {
    if (!storeId) {
      return;
    }
    localStorage.setItem(getChatStorageKey(storeId), JSON.stringify(chatMessages));
  }, [chatMessages, storeId]);

  /**
   * Starts a new analysis run by creating store and opening stream query.
   *
   * @param event - Form submission event.
   */
  async function handleAnalyze(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedUrl = storeUrl.trim();
    if (!normalizedUrl) {
      return;
    }

    const created = await createStoreMutation.mutateAsync({
      url: normalizedUrl,
      name: storeName.trim() || "Untitled Store",
    });
    setStoreId(created.store_id);
    setChatMessages([]);
    setQuestion("");
    setStreamRun((count) => count + 1);
    queryClient.removeQueries({ queryKey: ["store-policy"] });
  }

  /**
   * Sends a freeform question to the policy ask endpoint.
   *
   * @param event - Form submission event.
   */
  async function handleAsk(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!storeId || !question.trim()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      text: question.trim(),
    };
    setChatMessages((messages) => [...messages, userMessage]);
    const currentQuestion = question.trim();
    setQuestion("");

    try {
      const response = await askMutation.mutateAsync({
        storeId,
        q: currentQuestion,
      });
      setChatMessages((messages) => [
        ...messages,
        { id: createMessageId(), role: "assistant", text: response.answer },
      ]);
    } catch (error) {
      setChatMessages((messages) => [
        ...messages,
        {
          id: createMessageId(),
          role: "assistant",
          text: error instanceof Error ? error.message : "Could not answer that.",
        },
      ]);
    }
  }

  const withPercent = [...streamEvents]
    .reverse()
    .find((event) => typeof event.data.percent === "number");
  const progressPercent = withPercent?.data.percent ?? 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Store Policy Analyzer</CardTitle>
          <CardDescription>
            Enter a Shopify store URL to run discovery, extraction, and onboarding insights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={handleAnalyze}>
            <Input
              value={storeUrl}
              onChange={(event) => setStoreUrl(event.target.value)}
              placeholder="https://example.com"
              className="md:col-span-2"
              required
            />
            <Input
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              placeholder="Store name (optional)"
            />
            <div className="md:col-span-3 flex items-center gap-2">
              <Button
                type="submit"
                disabled={createStoreMutation.isPending || streamQuery.isFetching}
              >
                {streamQuery.isFetching ? "Analyzing..." : "Analyze Store"}
              </Button>
              {storeId ? <Badge variant="outline">Store ID: {storeId}</Badge> : null}
            </div>
          </form>
        </CardContent>
      </Card>

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
            {streamEvents.length === 0 ? (
              <p className="text-muted-foreground">No events yet. Start an analysis run.</p>
            ) : (
              streamEvents.map((event, index) => (
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding Summary Card</CardTitle>
            <CardDescription>
              Deterministic merchant-facing bullets generated from extracted policy fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(policyQuery.data?.summaryCard ?? []).length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Complete analysis to render summary bullets.
              </p>
            ) : (
              (policyQuery.data?.summaryCard ?? []).map((item) => (
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
            {(policyQuery.data?.warnings ?? []).length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No warnings yet, or analysis not complete.
              </p>
            ) : (
              (policyQuery.data?.warnings ?? []).map((warning) => (
                <p key={warning} className="text-xs">
                  ⚠ {warning}
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tiny Policy Q&A</CardTitle>
          <CardDescription>
            Ask freeform questions grounded in persisted `policy_text`. Messages stay local.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={handleAsk}>
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Can customers exchange sale items?"
              disabled={!storeId || askMutation.isPending}
            />
            <Button type="submit" disabled={!storeId || !question.trim()}>
              Ask
            </Button>
          </form>

          <div className="max-h-64 space-y-2 overflow-auto rounded border p-3">
            {chatMessages.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Ask a policy question after analysis completes.
              </p>
            ) : (
              chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded px-2 py-1 text-xs ${
                    message.role === "user"
                      ? "bg-primary/10 text-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <strong className="mr-1">
                    {message.role === "user" ? "You:" : "Assistant:"}
                  </strong>
                  {message.text}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default function Page() {
  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingPage />
    </QueryClientProvider>
  );
}