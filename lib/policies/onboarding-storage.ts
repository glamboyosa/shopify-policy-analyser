import type {
  ChatMessage,
  OnboardingSnapshot,
} from "@/lib/policies/client-types";

const ONBOARDING_STATE_KEY = "pango-policy:onboarding-state";

/**
 * Returns chat storage key scoped to a single store id.
 *
 * @param storeId - Store identifier.
 * @returns Stable localStorage key for policy chat messages.
 */
function getChatStorageKey(storeId: string): string {
  return `pango-policy-chat:${storeId}`;
}

/**
 * Loads the last onboarding snapshot from localStorage.
 *
 * @returns Snapshot object when valid, otherwise null.
 */
export function loadOnboardingSnapshot(): OnboardingSnapshot | null {
  const raw = localStorage.getItem(ONBOARDING_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as OnboardingSnapshot;
  } catch {
    return null;
  }
}

/**
 * Persists onboarding snapshot so UI can recover on refresh.
 *
 * @param snapshot - Serializable onboarding state payload.
 */
export function saveOnboardingSnapshot(snapshot: OnboardingSnapshot): void {
  localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(snapshot));
}

/**
 * Loads locally persisted chat history for a store.
 *
 * @param storeId - Store identifier.
 * @returns Parsed chat messages array, or an empty array when absent.
 */
export function loadChatMessages(storeId: string): ChatMessage[] {
  const raw = localStorage.getItem(getChatStorageKey(storeId));
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

/**
 * Saves chat messages for a single store.
 *
 * @param storeId - Store identifier.
 * @param messages - Message list to persist.
 */
export function saveChatMessages(
  storeId: string,
  messages: ChatMessage[],
): void {
  localStorage.setItem(getChatStorageKey(storeId), JSON.stringify(messages));
}
