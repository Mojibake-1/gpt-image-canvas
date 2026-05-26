import type { Hono } from "hono";
import { getProviderConfig, guestProviderConfigId, saveProviderConfig } from "../../domain/providers/provider-config.js";
import { errorResponse, errorToMessage } from "../http/errors.js";
import { readJson } from "../http/json.js";
import { isGuestUserEmail, requireInternalUserEmail } from "../internal-auth.js";
import { parseProviderConfigPayload } from "../http/validation.js";

export function registerProviderConfigRoutes(app: Hono): void {
  app.get("/api/provider-config", (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    return c.json(
      isGuestUserEmail(ownerEmail)
        ? getProviderConfig({ id: guestProviderConfigId(ownerEmail), localOnly: true })
        : getProviderConfig()
    );
  });

  app.put("/api/provider-config", async (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    const isGuest = isGuestUserEmail(ownerEmail);
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }
    const parsed = parseProviderConfigPayload(payload.value, { localOnly: isGuest });
    if (!parsed.ok) {
      return c.json(parsed.error, 400);
    }
    try {
      return c.json(saveProviderConfig(parsed.value, isGuest ? { id: guestProviderConfigId(ownerEmail), localOnly: true } : undefined));
    } catch (error) {
      return c.json(errorResponse("provider_config_error", errorToMessage(error)), 400);
    }
  });
}
