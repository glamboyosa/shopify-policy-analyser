export type StreamPayload = {
  step?: string;
  message?: string;
  percent?: number;
  warnings?: string[];
  result?: {
    summaryCard?: string[];
    warnings?: string[];
  };
};

export type StreamEvent = {
  event: string;
  data: StreamPayload;
};

export type PolicyResponse = {
  summaryCard: string[];
  warnings: string[];
  policy: {
    analyzed_at: string | null;
    confidence: string | null;
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type CreateStoreResponse = {
  store_id: string;
  status: string;
};

export type AskPolicyResponse = {
  answer: string;
};

export type OnboardingSnapshot = {
  storeId: string;
  storeUrl: string;
  storeName: string;
  analysisCompleted: boolean;
};
