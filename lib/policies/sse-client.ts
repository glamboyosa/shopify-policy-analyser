import type { StreamEvent, StreamPayload } from "@/lib/policies/client-types";

/**
 * Parses one SSE message block into event and JSON payload.
 *
 * @param block - Raw SSE block separated by a blank line.
 * @returns Parsed stream event, or null if parsing fails.
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
 * Streams policy analysis SSE events as an async iterator for streamedQuery.
 *
 * @param storeId - Store identifier used for SSE route.
 * @param signal - Abort signal from TanStack Query.
 * @returns Async stream of parsed policy analysis events.
 */
export async function* streamPolicyAnalysis(
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
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const parsed = parseSseBlock(block.trim());
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
