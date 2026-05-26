import type { Hono } from "hono";
import type { AuthStatusResponse } from "../../domain/contracts.js";
import { getAuthStatus, logoutCodex, pollCodexDeviceLogin, startCodexDeviceLogin } from "../../domain/providers/codex-auth.js";
import { getProviderConfig, guestProviderConfigId } from "../../domain/providers/provider-config.js";
import { ProviderError } from "../../infrastructure/providers/image-provider.js";
import { providerErrorJson } from "../http/errors.js";
import { readJson } from "../http/json.js";
import { forbiddenForGuest, isGuestRequest, isGuestUserEmail, requireInternalUserEmail } from "../internal-auth.js";
import { parseCodexPollPayload } from "../http/validation.js";

export function registerAuthRoutes(app: Hono): void {
  app.get("/api/auth/status", (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    if (!isGuestUserEmail(ownerEmail)) {
      return c.json(getAuthStatus());
    }

    const providerConfig = getProviderConfig({ id: guestProviderConfigId(ownerEmail), localOnly: true });
    const authStatus: AuthStatusResponse = {
      provider: providerConfig.activeSource?.provider ?? "none",
      openaiConfigured: Boolean(providerConfig.activeSource),
      codex: { available: false },
      activeSource: providerConfig.activeSource
    };
    return c.json(authStatus);
  });

  app.post("/api/auth/codex/device/start", async (c) => {
    if (isGuestRequest(c)) {
      return forbiddenForGuest(c);
    }
    try {
      return c.json(await startCodexDeviceLogin(c.req.raw.signal));
    } catch (error) {
      if (error instanceof ProviderError) {
        return providerErrorJson(c, error);
      }
      throw error;
    }
  });

  app.post("/api/auth/codex/device/poll", async (c) => {
    if (isGuestRequest(c)) {
      return forbiddenForGuest(c);
    }
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }
    const parsed = parseCodexPollPayload(payload.value);
    if (!parsed.ok) {
      return c.json(parsed.error, 400);
    }
    try {
      return c.json(await pollCodexDeviceLogin(parsed.value, c.req.raw.signal));
    } catch (error) {
      if (error instanceof ProviderError) {
        return providerErrorJson(c, error);
      }
      throw error;
    }
  });

  app.post("/api/auth/codex/logout", (c) => {
    if (isGuestRequest(c)) {
      return forbiddenForGuest(c);
    }
    return c.json(logoutCodex());
  });
}
