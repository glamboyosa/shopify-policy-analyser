import type {
  AskPolicyResponse,
  CreateStoreResponse,
  PolicyResponse,
} from "@/lib/policies/client-types";

/**
 * Creates a new store record and starts analysis workflow state.
 *
 * @param input - Store URL and merchant-facing name.
 * @returns Store creation payload with identifier and status.
 */
export async function createStoreRequest(input: {
  url: string;
  name: string;
}): Promise<CreateStoreResponse> {
  const response = await fetch("/api/stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to create store.");
  }

  return (await response.json()) as CreateStoreResponse;
}

/**
 * Fetches the latest policy analysis object for a store.
 *
 * @param storeId - Store identifier.
 * @returns Structured policy payload used by summary and warning cards.
 */
export async function fetchStorePolicy(storeId: string): Promise<PolicyResponse> {
  const response = await fetch(`/api/stores/${storeId}/policies`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load policy results.");
  }

  return (await response.json()) as PolicyResponse;
}

/**
 * Sends a grounded freeform question against persisted policy text.
 *
 * @param input - Store id and user question.
 * @returns Answer payload from policy Q&A endpoint.
 */
export async function askStorePolicyQuestion(input: {
  storeId: string;
  question: string;
}): Promise<AskPolicyResponse> {
  const params = new URLSearchParams({ q: input.question });
  const response = await fetch(
    `/api/stores/${input.storeId}/policies/ask?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Could not answer that question.");
  }

  return (await response.json()) as AskPolicyResponse;
}
