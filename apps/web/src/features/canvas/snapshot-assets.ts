import type { GeneratedAsset } from "@gpt-image-canvas/shared";

export interface CanvasDataUrlAssetUploadInput {
  dataUrl: string;
  fileName?: string;
}

export type CanvasDataUrlAssetUpload = (input: CanvasDataUrlAssetUploadInput) => Promise<GeneratedAsset | undefined>;

type SnapshotStoreLocation =
  | {
      kind: "document";
      document: Record<string, unknown>;
      store: Record<string, unknown>;
    }
  | {
      kind: "root";
      store: Record<string, unknown>;
    };

export async function uploadCanvasDataUrlAsset(input: CanvasDataUrlAssetUploadInput): Promise<GeneratedAsset | undefined> {
  const response = await fetch("/api/assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    return undefined;
  }

  const body = (await response.json()) as unknown;
  return isGeneratedAsset(body) ? body : undefined;
}

export async function persistDataUrlAssetsInSnapshot<TSnapshot>(
  snapshot: TSnapshot,
  upload: CanvasDataUrlAssetUpload
): Promise<TSnapshot> {
  const location = snapshotStoreLocation(snapshot);
  if (!location) {
    return snapshot;
  }

  const uploadedByDataUrl = new Map<string, GeneratedAsset | undefined>();
  const nextStore: Record<string, unknown> = {};
  let changed = false;

  for (const [id, record] of Object.entries(location.store)) {
    const embedded = embeddedImageAsset(record);
    if (!embedded) {
      nextStore[id] = record;
      continue;
    }

    let uploaded = uploadedByDataUrl.get(embedded.dataUrl);
    if (!uploadedByDataUrl.has(embedded.dataUrl)) {
      uploaded = await upload({
        dataUrl: embedded.dataUrl,
        fileName: embedded.fileName ?? fallbackAssetFileName(id, embedded.dataUrl)
      });
      uploadedByDataUrl.set(embedded.dataUrl, uploaded);
    }

    if (!uploaded) {
      nextStore[id] = record;
      continue;
    }

    nextStore[id] = rewriteImageAssetRecord(record, uploaded);
    changed = true;
  }

  if (!changed) {
    return snapshot;
  }

  if (location.kind === "document") {
    return {
      ...(snapshot as Record<string, unknown>),
      document: {
        ...location.document,
        store: nextStore
      }
    } as TSnapshot;
  }

  return {
    ...(snapshot as Record<string, unknown>),
    store: nextStore
  } as TSnapshot;
}

function snapshotStoreLocation(snapshot: unknown): SnapshotStoreLocation | undefined {
  if (!isRecord(snapshot)) {
    return undefined;
  }

  if (isRecord(snapshot.document) && isRecord(snapshot.document.store)) {
    return {
      kind: "document",
      document: snapshot.document,
      store: snapshot.document.store
    };
  }

  if (isRecord(snapshot.store)) {
    return {
      kind: "root",
      store: snapshot.store
    };
  }

  return undefined;
}

function embeddedImageAsset(record: unknown): { dataUrl: string; fileName?: string } | undefined {
  if (!isRecord(record) || record.typeName !== "asset" || record.type !== "image" || !isRecord(record.props)) {
    return undefined;
  }

  const src = record.props.src;
  if (typeof src !== "string" || !src.startsWith("data:image/")) {
    return undefined;
  }

  const name = record.props.name;
  return {
    dataUrl: src,
    fileName: typeof name === "string" && name.trim() ? name.trim() : undefined
  };
}

function rewriteImageAssetRecord(record: unknown, asset: GeneratedAsset): unknown {
  if (!isRecord(record) || !isRecord(record.props)) {
    return record;
  }

  return {
    ...record,
    props: {
      ...record.props,
      src: asset.url,
      name: asset.fileName,
      mimeType: asset.mimeType,
      w: asset.width,
      h: asset.height
    },
    meta: {
      ...(isRecord(record.meta) ? record.meta : {}),
      localAssetId: asset.id
    }
  };
}

function fallbackAssetFileName(id: string, dataUrl: string): string {
  const extension = extensionForDataUrl(dataUrl);
  return `${id.replace(/^asset:/u, "").replace(/[^a-zA-Z0-9._-]/gu, "_")}.${extension}`;
}

function extensionForDataUrl(dataUrl: string): string {
  const mimeType = /^data:([^;,]+)/iu.exec(dataUrl)?.[1]?.toLowerCase();
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
}

function isGeneratedAsset(value: unknown): value is GeneratedAsset {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.url === "string" &&
    typeof value.fileName === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
