import assert from "node:assert/strict";
import test from "node:test";
import { validateImageSize } from "../src/validation.ts";

test("accepts a 2000 by 2000 image size", () => {
  assert.equal(validateImageSize({ width: 2000, height: 2000 }).ok, true);
});


test("rejects a size that is not a multiple of 16", () => {
  const result = validateImageSize({ width: 2001, height: 2000 });
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.reason, "not_multiple");
});
