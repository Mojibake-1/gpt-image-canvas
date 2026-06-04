import type { Hono } from "hono";
import type {
  CreatePromptFavoriteGroupRequest,
  CreatePromptFavoriteRequest,
  UpdatePromptFavoriteGroupRequest,
  UpdatePromptFavoriteRequest
} from "../../domain/contracts.js";
import {
  createPromptFavorite,
  createPromptFavoriteGroup,
  deletePromptFavorite,
  deletePromptFavoriteGroup,
  listPromptFavorites,
  markPromptFavoriteUsed,
  PromptFavoriteError,
  updatePromptFavorite,
  updatePromptFavoriteGroup
} from "../../domain/prompt-favorites/prompt-favorites.js";
import { errorResponse } from "../http/errors.js";
import { readJson } from "../http/json.js";
import { requireInternalUserEmail } from "../internal-auth.js";

export function registerPromptFavoriteRoutes(app: Hono): void {
  app.get("/api/prompt-favorites", (c) => c.json(listPromptFavorites(requireInternalUserEmail(c))));

  app.post("/api/prompt-favorites", async (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    try {
      return c.json({ favorite: await createPromptFavorite(ownerEmail, payload.value as CreatePromptFavoriteRequest) }, 201);
    } catch (error) {
      return promptFavoriteErrorJson(error);
    }
  });

  app.patch("/api/prompt-favorites/:id", async (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    try {
      return c.json({ favorite: updatePromptFavorite(ownerEmail, c.req.param("id"), payload.value as UpdatePromptFavoriteRequest) });
    } catch (error) {
      return promptFavoriteErrorJson(error);
    }
  });

  app.delete("/api/prompt-favorites/:id", (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    try {
      deletePromptFavorite(ownerEmail, c.req.param("id"));
      return c.json({ ok: true });
    } catch (error) {
      return promptFavoriteErrorJson(error);
    }
  });

  app.post("/api/prompt-favorites/:id/use", (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    try {
      return c.json({ favorite: markPromptFavoriteUsed(ownerEmail, c.req.param("id")) });
    } catch (error) {
      return promptFavoriteErrorJson(error);
    }
  });

  app.post("/api/prompt-favorite-groups", async (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    try {
      return c.json({ group: createPromptFavoriteGroup(ownerEmail, payload.value as CreatePromptFavoriteGroupRequest) }, 201);
    } catch (error) {
      return promptFavoriteErrorJson(error);
    }
  });

  app.patch("/api/prompt-favorite-groups/:id", async (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    try {
      return c.json({ group: updatePromptFavoriteGroup(ownerEmail, c.req.param("id"), payload.value as UpdatePromptFavoriteGroupRequest) });
    } catch (error) {
      return promptFavoriteErrorJson(error);
    }
  });

  app.delete("/api/prompt-favorite-groups/:id", (c) => {
    const ownerEmail = requireInternalUserEmail(c);
    try {
      deletePromptFavoriteGroup(ownerEmail, c.req.param("id"));
      return c.json({ ok: true });
    } catch (error) {
      return promptFavoriteErrorJson(error);
    }
  });
}

function promptFavoriteErrorJson(error: unknown): Response {
  if (error instanceof PromptFavoriteError) {
    return new Response(JSON.stringify(errorResponse(error.code, error.message)), {
      status: error.status,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  return new Response(JSON.stringify(errorResponse("prompt_favorite_error", "Prompt favorite request failed.")), {
    status: 500,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
