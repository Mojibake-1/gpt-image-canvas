import assert from "node:assert/strict";
import { test } from "node:test";
import { persistDataUrlAssetsInSnapshot } from "./snapshot-assets";

test("persistDataUrlAssetsInSnapshot uploads embedded image assets and rewrites snapshot references", async () => {
  const dataUrl = "data:image/png;base64,aGVsbG8=";
  const snapshot = {
    document: {
      store: {
        "asset:local-image": {
          typeName: "asset",
          type: "image",
          props: {
            src: dataUrl,
            name: "local-image.png",
            mimeType: "image/png",
            w: 640,
            h: 480
          },
          meta: {}
        }
      }
    }
  };
  const uploads: Array<{ dataUrl: string; fileName?: string }> = [];

  const compacted = await persistDataUrlAssetsInSnapshot(snapshot, async (input) => {
    uploads.push(input);
    return {
      id: "server-asset-id",
      url: "/api/assets/server-asset-id",
      fileName: "server-asset-id.png",
      mimeType: "image/png",
      width: 640,
      height: 480
    };
  });

  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0], {
    dataUrl,
    fileName: "local-image.png"
  });
  assert.notEqual(compacted, snapshot);

  const asset = compacted.document.store["asset:local-image"];
  assert.equal(asset.props.src, "/api/assets/server-asset-id");
  assert.equal(asset.props.name, "server-asset-id.png");
  assert.equal(asset.props.mimeType, "image/png");
  assert.equal(asset.props.w, 640);
  assert.equal(asset.props.h, 480);
  assert.deepEqual(asset.meta, {
    localAssetId: "server-asset-id"
  });
});

test("persistDataUrlAssetsInSnapshot leaves data URLs in place when upload fails", async () => {
  const dataUrl = "data:image/jpeg;base64,aGVsbG8=";
  const snapshot = {
    store: {
      "asset:offline-image": {
        typeName: "asset",
        type: "image",
        props: {
          src: dataUrl
        },
        meta: {
          label: "keep-me"
        }
      }
    }
  };

  const compacted = await persistDataUrlAssetsInSnapshot(snapshot, async () => undefined);

  assert.equal(compacted, snapshot);
  assert.equal(compacted.store["asset:offline-image"].props.src, dataUrl);
  assert.deepEqual(compacted.store["asset:offline-image"].meta, {
    label: "keep-me"
  });
});
