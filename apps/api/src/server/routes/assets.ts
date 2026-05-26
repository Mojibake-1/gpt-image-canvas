import type { Hono } from "hono";
import { parsePreviewWidth, readStoredAssetPreview } from "../../domain/assets/preview.js";
import { readStoredAsset, readStoredAssetMetadata, saveImageDataUrlAsset } from "../../domain/generation/image-generation.js";
import { ProviderError } from "../../infrastructure/providers/image-provider.js";
import { requireInternalUserEmail } from "../internal-auth.js";
import { downloadFileName, errorResponse, providerErrorJson } from "../http/errors.js";
import { readJson } from "../http/json.js";

export function registerAssetRoutes(app: Hono): void {
  app.post("/api/assets", async (c) => {
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    if (!isRecord(payload.value) || typeof payload.value.dataUrl !== "string") {
      return c.json(errorResponse("invalid_request", "Asset upload requires a dataUrl string."), 400);
    }

    const fileName = typeof payload.value.fileName === "string" && payload.value.fileName.trim() ? payload.value.fileName.trim() : undefined;

    try {
      return c.json(
        await saveImageDataUrlAsset(
          {
            dataUrl: payload.value.dataUrl,
            fileName
          },
          requireInternalUserEmail(c)
        )
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        return providerErrorJson(c, error);
      }

      throw error;
    }
  });

  app.get("/api/assets/:id/preview", async (c) => {
    const parsedWidth = parsePreviewWidth(c.req.query("width"));
    if (!parsedWidth.ok) {
      return c.json(errorResponse(parsedWidth.code, parsedWidth.message), 400);
    }

    const preview = await readStoredAssetPreview(c.req.param("id"), parsedWidth.width, requireInternalUserEmail(c));
    if (!preview) {
      return c.json(errorResponse("not_found", "Asset not found."), 404);
    }

    return new Response(new Uint8Array(preview.bytes), {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${downloadFileName(c.req.param("id"))}-${preview.width}.webp"`,
        "Content-Type": "image/webp"
      }
    });
  });

  app.get("/api/assets/:id/metadata", async (c) => {
    const metadata = await readStoredAssetMetadata(c.req.param("id"), requireInternalUserEmail(c));
    if (!metadata) {
      return c.json(errorResponse("not_found", "Asset not found."), 404);
    }

    return c.json(metadata);
  });

  app.get("/api/assets/:id/download", async (c) => {
    const asset = await readStoredAsset(c.req.param("id"), requireInternalUserEmail(c));
    if (!asset) {
      return c.json(errorResponse("not_found", "找不到请求的图像资源。"), 404);
    }

    return new Response(new Uint8Array(asset.bytes), {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `attachment; filename="${downloadFileName(asset.file.fileName)}"`,
        "Content-Type": asset.file.mimeType
      }
    });
  });

  app.get("/api/assets/:id", async (c) => {
    const asset = await readStoredAsset(c.req.param("id"), requireInternalUserEmail(c));
    if (!asset) {
      return c.json(errorResponse("not_found", "找不到请求的图像资源。"), 404);
    }

    return new Response(new Uint8Array(asset.bytes), {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${asset.file.fileName}"`,
        "Content-Type": asset.file.mimeType
      }
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
