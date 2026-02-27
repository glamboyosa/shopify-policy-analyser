"use client";

import { useEffect, useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  experimental_streamedQuery as streamedQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query";

import { AnalysisForm } from "@/components/onboarding/analysis-form";
import { InsightsCards } from "@/components/onboarding/insights-cards";
import { PolicyChat } from "@/components/onboarding/policy-chat";
import { StreamTimeline } from "@/components/onboarding/stream-timeline";
import {
  askStorePolicyQuestion,
  createStoreRequest,
  fetchStorePolicy,
} from "@/lib/policies/api-client";
import type { ChatMessage, StreamEvent } from "@/lib/policies/client-types";
import {
  loadChatMessages,
  loadOnboardingSnapshot,
  saveChatMessages,
  saveOnboardingSnapshot,
} from "@/lib/policies/onboarding-storage";
import { streamPolicyAnalysis } from "@/lib/policies/sse-client";

const queryClient = new QueryClient();

/**
 * Returns a unique message id for local chat rendering.
 *
 * @returns Stable-enough id based on time and random suffix.
 */
function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function OnboardingContent() {
  const [storeUrl, setStoreUrl] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [streamRun, setStreamRun] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);

  const createStoreMutation = useMutation({
    mutationFn: createStoreRequest,
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

  const policyQuery = useQuery({
    queryKey: ["store-policy", storeId],
    enabled: Boolean(storeId && analysisCompleted),
    queryFn: async () => {
      if (!storeId) {
        throw new Error("Missing store id for policy fetch.");
      }
      return fetchStorePolicy(storeId);
    },
  });

  const askMutation = useMutation({
    mutationFn: askStorePolicyQuestion,
  });

  useEffect(() => {
    const snapshot = loadOnboardingSnapshot();
    if (!snapshot) {
      return;
    }
    setStoreId(snapshot.storeId);
    setStoreUrl(snapshot.storeUrl);
    setStoreName(snapshot.storeName);
    setAnalysisCompleted(snapshot.analysisCompleted);
  }, []);

  useEffect(() => {
    if (!storeId) {
      setChatMessages([]);
      return;
    }
    setChatMessages(loadChatMessages(storeId));
  }, [storeId]);

  useEffect(() => {
    if (!storeId) {
      return;
    }
    saveChatMessages(storeId, chatMessages);
  }, [storeId, chatMessages]);

  useEffect(() => {
    if (!storeId) {
      return;
    }
    saveOnboardingSnapshot({
      storeId,
      storeUrl,
      storeName,
      analysisCompleted,
    });
  }, [storeId, storeUrl, storeName, analysisCompleted]);

  useEffect(() => {
    if (completeEvent) {
      setAnalysisCompleted(true);
    }
  }, [completeEvent]);

  const isSubmitting = createStoreMutation.isPending || streamQuery.isFetching;

  const summaryCard = policyQuery.data?.summaryCard ?? [];
  const warnings = policyQuery.data?.warnings ?? [];

  const streamStatusLine = useMemo(() => {
    if (streamQuery.isFetching) {
      return "Live analysis in progress...";
    }
    if (analysisCompleted) {
      return "Showing persisted onboarding results.";
    }
    return "Start an analysis run to populate onboarding cards.";
  }, [analysisCompleted, streamQuery.isFetching]);

  /**
   * Starts a new analysis run for the submitted store.
   *
   * @param event - Form submit event from analysis form.
   */
  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
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
    setAnalysisCompleted(false);
    setChatMessages([]);
    setStreamRun((count) => count + 1);
    queryClient.removeQueries({ queryKey: ["store-policy"] });
  }

  /**
   * Sends a question to the freeform policy endpoint and appends messages.
   *
   * @param question - User-entered policy question text.
   */
  async function handleAsk(question: string) {
    if (!storeId) {
      return;
    }

    setChatMessages((messages) => [
      ...messages,
      { id: createMessageId(), role: "user", text: question },
    ]);

    try {
      const response = await askMutation.mutateAsync({ storeId, question });
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4 md:p-8">
      <AnalysisForm
        storeUrl={storeUrl}
        storeName={storeName}
        storeId={storeId}
        isSubmitting={isSubmitting}
        onStoreUrlChange={setStoreUrl}
        onStoreNameChange={setStoreName}
        onSubmit={handleAnalyze}
      />

      <p className="text-muted-foreground px-1 text-xs">{streamStatusLine}</p>

      <StreamTimeline events={streamEvents} />
      <InsightsCards summaryCard={summaryCard} warnings={warnings} />
      <PolicyChat
        storeId={storeId}
        isAsking={askMutation.isPending}
        messages={chatMessages}
        onAsk={handleAsk}
      />
    </main>
  );
}

export function OnboardingClient() {
  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingContent />
    </QueryClientProvider>
  );
}
