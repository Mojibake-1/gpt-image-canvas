import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { getPromptPool } from "../src/domain/prompt-pool/prompt-pool.js";

const RAW_IMAGE = "https://raw.githubusercontent.com/mrslimslim/awesome-prompt/main/images/demo-1/0.webp";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("prompt pool reports unavailable when the data directory is missing", async () => {
  const dir = makeTempDir("prompt-pool-missing-");
  const response = await getPromptPool(dir);
  assert.equal(response.available, false);
  assert.equal(response.errorCode, "prompt_pool_missing");
  assert.deepEqual(response.items, []);
  assert.equal(response.summary.promptCount, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("prompt pool reports invalid when prompts-all.json is not an array", async () => {
  const dir = makeTempDir("prompt-pool-invalid-");
  writeFileSync(resolve(dir, "prompts-all.json"), JSON.stringify({ not: "an array" }), "utf8");
  const response = await getPromptPool(dir);
  assert.equal(response.available, false);
  assert.equal(response.errorCode, "prompt_pool_invalid");
  rmSync(dir, { recursive: true, force: true });
});

test("prompt pool loads and normalizes items from a populated directory", async () => {
  const dir = makeTempDir("prompt-pool-ok-");
  const item = {
    id: "demo-1",
    prompt: "A premium editorial product photo with soft directional light.",
    title: "Demo title",
    mediaType: "image",
    model: "GPT Image",
    promptReady: true,
    rawImage: RAW_IMAGE,
    imageWidth: 1200,
    imageHeight: 800,
    author: { name: "Tester", username: "tester", verified: false, profileUrl: "https://x.com/tester" },
    stats: { likes: 3, views: 10, retweets: 1 }
  };
  writeFileSync(resolve(dir, "prompts-all.json"), JSON.stringify([item]), "utf8");
  writeFileSync(
    resolve(dir, "summary.json"),
    JSON.stringify({ promptCount: 1, imagePromptCount: 1, videoPromptCount: 0, assetCount: 1 }),
    "utf8"
  );

  const response = await getPromptPool(dir);
  assert.equal(response.available, true);
  assert.equal(response.items.length, 1);
  const loaded = response.items[0];
  assert.ok(loaded);
  assert.equal(loaded.id, "demo-1");
  assert.equal(loaded.prompt, item.prompt);
  assert.equal(loaded.mediaType, "image");
  assert.equal(loaded.assetUrl, RAW_IMAGE);
  assert.equal(loaded.author?.name, "Tester");
  assert.equal(response.summary.promptCount, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("prompt pool resolves a nested data/ layout", async () => {
  const dir = makeTempDir("prompt-pool-nested-");
  const nested = resolve(dir, "data");
  mkdirSync(nested, { recursive: true });
  writeFileSync(
    resolve(nested, "prompts-all.json"),
    JSON.stringify([{ id: "n1", prompt: "nested prompt", rawImage: RAW_IMAGE }]),
    "utf8"
  );

  const response = await getPromptPool(dir);
  assert.equal(response.available, true);
  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.id, "n1");
  rmSync(dir, { recursive: true, force: true });
});
