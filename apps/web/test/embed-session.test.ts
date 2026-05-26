import assert from "node:assert/strict";
import test from "node:test";
import { ensureEmbeddedStorageAccess, isMuxingEmbedded, withEmbeddedSessionToken } from "../src/features/canvas/embed-session.ts";

test("isMuxingEmbedded only returns true for muxing-embed=1", () => {
  assert.equal(isMuxingEmbedded("https://canvas.muxing.cfd/?muxing-embed=1"), true);
  assert.equal(isMuxingEmbedded("https://canvas.muxing.cfd/"), false);
});

test("ensureEmbeddedStorageAccess requests access for embedded pages when storage is not yet available", async () => {
  let requested = 0;
  await ensureEmbeddedStorageAccess({
    href: "https://canvas.muxing.cfd/?muxing-embed=1",
    hasStorageAccess: async () => false,
    requestStorageAccess: async () => {
      requested += 1;
    }
  });

  assert.equal(requested, 1);
});

test("ensureEmbeddedStorageAccess skips the request outside embedded mode", async () => {
  let requested = 0;
  await ensureEmbeddedStorageAccess({
    href: "https://canvas.muxing.cfd/",
    hasStorageAccess: async () => false,
    requestStorageAccess: async () => {
      requested += 1;
    }
  });

  assert.equal(requested, 0);
});

test("withEmbeddedSessionToken appends the token to api resource URLs", () => {
  assert.equal(
    withEmbeddedSessionToken("/api/assets/asset-1/preview?width=512", "token.123"),
    "/api/assets/asset-1/preview?width=512&muxing_session=token.123"
  );
});

test("withEmbeddedSessionToken leaves non-api URLs unchanged", () => {
  assert.equal(withEmbeddedSessionToken("/canvas", "token.123"), "/canvas");
  assert.equal(withEmbeddedSessionToken("https://example.com/file.png", "token.123"), "https://example.com/file.png");
});
