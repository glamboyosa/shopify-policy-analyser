import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { handle } from "hono/vercel";
import { z } from "zod";

import {
  analyzeStorePolicies,
  askPolicyQuestion,
  createStore,
  getLatestPolicy,
} from "@/lib/policies/analyzer";

const app = new Hono().basePath("/api");

const createStoreSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
});

app.get("/health", (c) => {
  return c.json({ ok: true, service: "pango-policy-api" });
});

app.post("/stores", async (c) => {
  const rawInput = await c.req.json().catch(() => null);
  const parsedInput = createStoreSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return c.json(
      {
        error: "Invalid request payload",
        details: parsedInput.error.flatten(),
      },
      400,
    );
  }

  const created = await createStore(parsedInput.data);
  return c.json(
    {
      store_id: created.storeId,
      status: created.status,
    },
    201,
  );
});

app.get("/stores/:storeId/policies", async (c) => {
  const storeId = c.req.param("storeId");
  const policy = await getLatestPolicy(storeId);
  if (!policy) {
    return c.json({ error: "No policy analysis found for this store." }, 404);
  }
  return c.json(policy);
});

app.get("/stores/:storeId/policies/ask", async (c) => {
  const storeId = c.req.param("storeId");
  const question = c.req.query("q")?.trim();

  if (!question) {
    return c.json({ error: "Missing required query parameter: q" }, 400);
  }

  try {
    const result = await askPolicyQuestion({
      storeId,
      question,
    });
    return c.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Policy question failed.";
    const status = /No policy analysis found/i.test(message) ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.get("/stores/:storeId/policies/stream", async (c) => {
  const storeId = c.req.param("storeId");

  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({
        event: "stage",
        data: JSON.stringify({
          step: "start",
          message: "Starting store policy analysis",
          percent: 5,
        }),
      });

      await analyzeStorePolicies(storeId, async (event, payload) => {
        await stream.writeSSE({
          event,
          data: JSON.stringify(payload),
        });
      });
    } catch (error) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          step: "failed",
          message:
            error instanceof Error ? error.message : "Policy analysis failed.",
        }),
      });
    }
  });
});

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
export const HEAD = handle(app);
