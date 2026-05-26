import type { Hono } from "hono";
import { LOCAL_ONLY_PROVIDER_SOURCE_ORDER, guestProviderConfigId } from "../../domain/providers/provider-config.js";
import {
  cancelGenerationTask,
  readGenerationTaskRecord,
  startReferenceImageGenerationTask,
  startTextToImageGenerationTask
} from "../../domain/generation/generation-tasks.js";
import { ProviderError } from "../../infrastructure/providers/image-provider.js";
import { errorResponse, providerErrorJson } from "../http/errors.js";
import { isGuestUserEmail, requireInternalUserEmail } from "../internal-auth.js";
import { readJson } from "../http/json.js";
import { parseEditPayload, parseGeneratePayload } from "../http/validation.js";

const GUEST_ONLY_PROVIDER_MESSAGE = "Guest ?????????? API ????????????? API Key?";

export function registerImageRoutes(app: Hono): void {
  app.post("/api/images/generate", async (c) => {
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    const ownerEmail = requireInternalUserEmail(c);
    const parsed = parseGeneratePayload(payload.value);
    if (!parsed.ok) {
      return c.json(parsed.error, 400);
    }

    const guestOptions = isGuestUserEmail(ownerEmail)
      ? {
          disableCloudStorage: true,
          localConfigId: guestProviderConfigId(ownerEmail),
          missingProviderMessage: GUEST_ONLY_PROVIDER_MESSAGE,
          sourceOrder: LOCAL_ONLY_PROVIDER_SOURCE_ORDER
        }
      : undefined;

    try {
      return c.json({ record: startTextToImageGenerationTask(parsed.value, ownerEmail, guestOptions) });
    } catch (error) {
      if (error instanceof ProviderError) {
        return providerErrorJson(c, error);
      }
      throw error;
    }
  });

  app.post("/api/images/edit", async (c) => {
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    const ownerEmail = requireInternalUserEmail(c);
    const parsed = parseEditPayload(payload.value, ownerEmail);
    if (!parsed.ok) {
      return c.json(parsed.error, 400);
    }

    const guestOptions = isGuestUserEmail(ownerEmail)
      ? {
          disableCloudStorage: true,
          localConfigId: guestProviderConfigId(ownerEmail),
          missingProviderMessage: GUEST_ONLY_PROVIDER_MESSAGE,
          sourceOrder: LOCAL_ONLY_PROVIDER_SOURCE_ORDER
        }
      : undefined;

    try {
      return c.json({ record: await startReferenceImageGenerationTask(parsed.value, ownerEmail, guestOptions) });
    } catch (error) {
      if (error instanceof ProviderError) {
        return providerErrorJson(c, error);
      }
      throw error;
    }
  });

  app.get("/api/generations/:id", (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    const generationId = c.req.param("id").trim();
    const record = generationId ? readGenerationTaskRecord(generationId, ownerEmail) : undefined;
    if (!record) {
      return c.json(errorResponse("not_found", "Generation record not found."), 404);
    }

    return c.json({ record });
  });

  app.post("/api/generations/:id/cancel", (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    const generationId = c.req.param("id").trim();
    const record = generationId ? cancelGenerationTask(generationId, ownerEmail) : undefined;
    if (!record) {
      return c.json(errorResponse("not_found", "Generation record not found."), 404);
    }

    return c.json({ record });
  });
}
