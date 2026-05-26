import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProviderConfigPayload } from "../src/server/http/validation.js";

test("guest provider config payload is forced to local-only source order", () => {
  const result = parseProviderConfigPayload(
    {
      sourceOrder: ["env-openai", "local-openai", "codex"],
      localOpenAI: {
        apiKey: "sk-test",
        baseUrl: "https://example.com/v1",
        model: "gpt-image-2",
        timeoutMs: 1200000
      }
    },
    { localOnly: true }
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.value.sourceOrder, ["local-openai"]);
  assert.equal(result.value.localOpenAI?.apiKey, "sk-test");
});
