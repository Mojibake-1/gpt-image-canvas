import assert from "node:assert/strict";
import test from "node:test";
import { SIZE_PRESETS } from "../src/image.ts";

test("includes Amazon image size presets", () => {
  assert.deepEqual(
    SIZE_PRESETS.find((preset) => preset.id === "amazon-a-plus"),
    {
      id: "amazon-a-plus",
      label: "Amazon A+",
      width: 2928,
      height: 1200,
      description: "Amazon A+ content module image"
    }
  );
  assert.deepEqual(
    SIZE_PRESETS.find((preset) => preset.id === "amazon-main-image"),
    {
      id: "amazon-main-image",
      label: "Amazon main image",
      width: 2000,
      height: 2000,
      description: "Amazon product main image"
    }
  );
  assert.deepEqual(
    SIZE_PRESETS.find((preset) => preset.id === "amazon-portrait-image"),
    {
      id: "amazon-portrait-image",
      label: "Amazon portrait image",
      width: 1600,
      height: 2000,
      description: "Amazon product portrait image"
    }
  );
});
