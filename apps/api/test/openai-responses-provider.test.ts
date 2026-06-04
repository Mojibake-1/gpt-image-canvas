import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOpenAIImageProvider,
  type ImageProviderInput,
  type OpenAIImageProviderConfig
} from "../src/infrastructure/providers/image-provider.js";

const input: ImageProviderInput = {
  originalPrompt: "draw a small red square",
  clientRequestId: "test-request",
  presetId: "custom",
  prompt: "draw a small red square",
  size: "1024x1024",
  sizeApiValue: "1024x1024",
  quality: "auto",
  outputFormat: "png",
  count: 1
};

test("OpenAI provider can use Responses image_generation mode", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
    const bodyText = typeof init?.body === "string" ? init.body : request instanceof Request ? await request.text() : "{}";
    calls.push({ url, body: JSON.parse(bodyText) as Record<string, unknown> });
    return new Response(
      JSON.stringify({
        output: [
          {
            type: "image_generation_call",
            result: "data:image/png;base64,abc123"
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  const provider = createOpenAIImageProvider({
    apiKey: "sk-test",
    baseURL: "https://example.test/v1",
    model: "gpt-5.5",
    timeoutMs: 1000,
    apiMode: "responses"
  } as OpenAIImageProviderConfig & { apiMode: "responses" });

  const result = await provider.generate(input);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://example.test/v1/responses");
  assert.deepEqual(result, {
    model: "gpt-5.5",
    size: "1024x1024",
    images: [
      {
        b64Json: "abc123"
      }
    ]
  });
});
