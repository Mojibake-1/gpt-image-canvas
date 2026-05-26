import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("generation task manager is initialized only after the API server is listening", () => {
  const imageRoutes = source("apps/api/src/server/routes/images.ts");
  const index = source("apps/api/src/index.ts");

  assert.equal(
    imageRoutes.includes("initializeGenerationTaskManager();"),
    false,
    "route registration must not mark running tasks interrupted before the server owns the port"
  );
  assert.match(
    index,
    /initializeGenerationTaskManager\(\);[\s\S]*API listening at/,
    "startup should initialize interrupted-task recovery in the successful listen callback"
  );
});
