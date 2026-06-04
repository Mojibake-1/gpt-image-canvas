import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { before, test } from "node:test";

// The prompt-favorites domain imports the database module, which opens the SQLite file
// at DATA_DIR on first import. Point DATA_DIR + PROMPT_POOL_DIR at throwaway temp dirs
// BEFORE importing the domain so the test runs against an isolated database and a tiny
// seeded prompt pool.
const POOL_ITEM_ID = "pool-item-1";
const OWNER_A = "owner-a@muxing.cfd";
const OWNER_B = "owner-b@muxing.cfd";

let favorites: typeof import("../src/domain/prompt-favorites/prompt-favorites.js");

before(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "pf-data-"));
  const poolDir = mkdtempSync(join(tmpdir(), "pf-pool-"));
  writeFileSync(
    resolve(poolDir, "prompts-all.json"),
    JSON.stringify([
      {
        id: POOL_ITEM_ID,
        prompt: "Owner-scoped favorite prompt.",
        title: "Pooled",
        mediaType: "image",
        model: "GPT Image",
        promptReady: true,
        rawImage: "https://raw.githubusercontent.com/mrslimslim/awesome-prompt/main/images/pool-item-1/0.webp",
        imageWidth: 1024,
        imageHeight: 1024
      }
    ]),
    "utf8"
  );
  process.env.DATA_DIR = dataDir;
  process.env.PROMPT_POOL_DIR = poolDir;
  favorites = await import("../src/domain/prompt-favorites/prompt-favorites.js");
});

test("each owner gets an isolated default group", () => {
  const a = favorites.listPromptFavorites(OWNER_A);
  const b = favorites.listPromptFavorites(OWNER_B);
  assert.equal(a.groups.length, 1);
  assert.equal(b.groups.length, 1);
  assert.equal(a.groups[0]?.isDefault, true);
  assert.equal(b.groups[0]?.isDefault, true);
  assert.notEqual(a.groups[0]?.id, b.groups[0]?.id);
  assert.equal(a.favorites.length, 0);
});

test("favorites created by one owner are invisible to another owner", async () => {
  const created = await favorites.createPromptFavorite(OWNER_A, { promptPoolItemId: POOL_ITEM_ID });
  assert.equal(created.sourceId, POOL_ITEM_ID);

  const a = favorites.listPromptFavorites(OWNER_A);
  const b = favorites.listPromptFavorites(OWNER_B);
  assert.equal(a.favorites.length, 1);
  assert.equal(b.favorites.length, 0);
});

test("one owner cannot read, mark-used, or delete another owner's favorite", async () => {
  const created = await favorites.createPromptFavorite(OWNER_A, { promptPoolItemId: POOL_ITEM_ID });

  assert.throws(() => favorites.markPromptFavoriteUsed(OWNER_B, created.id), /was not found/iu);
  assert.throws(() => favorites.deletePromptFavorite(OWNER_B, created.id), /was not found/iu);

  const used = favorites.markPromptFavoriteUsed(OWNER_A, created.id);
  assert.ok(used.useCount >= 1);
});

test("favorite groups are owner-scoped against rename and delete", () => {
  const groupA = favorites.createPromptFavoriteGroup(OWNER_A, { name: "Campaign" });

  assert.throws(() => favorites.updatePromptFavoriteGroup(OWNER_B, groupA.id, { name: "Hijacked" }), /was not found/iu);
  assert.throws(() => favorites.deletePromptFavoriteGroup(OWNER_B, groupA.id), /was not found/iu);

  const aGroups = favorites.listPromptFavorites(OWNER_A).groups;
  assert.ok(aGroups.some((group) => group.id === groupA.id && group.name === "Campaign"));
  const bGroups = favorites.listPromptFavorites(OWNER_B).groups;
  assert.ok(!bGroups.some((group) => group.id === groupA.id));
});

test("the per-owner default group cannot be deleted", () => {
  const a = favorites.listPromptFavorites(OWNER_A);
  const defaultGroup = a.groups.find((group) => group.isDefault);
  assert.ok(defaultGroup);
  assert.throws(() => favorites.deletePromptFavoriteGroup(OWNER_A, defaultGroup.id), /cannot be deleted/iu);
});
