import type { Context, Hono, Next } from "hono";
import { ensureProjectForOwner } from "../domain/project/project-store.js";
import { errorResponse } from "./http/errors.js";
import { readJson } from "./http/json.js";

const INTERNAL_AUTH_COOKIE = "muxing_canvas_user";
const INTERNAL_EMAIL_PATTERN = /^[^@\s]+@muxing\.cfd$/u;
const INTERNAL_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function registerInternalAuthRoutes(app: Hono): void {
  app.get("/api/internal-session", (c) => {
    const email = getInternalUserEmail(c);
    return c.json(email ? { authenticated: true, email } : { authenticated: false });
  });

  app.post("/api/internal-login", async (c) => {
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    const email = parseInternalLoginEmail(payload.value);
    if (!email) {
      return c.json(errorResponse("forbidden_email", "请使用 @muxing.cfd 邮箱登录。"), 403);
    }

    ensureProjectForOwner(email);
    c.header("Set-Cookie", createInternalAuthCookie(c, email));
    return c.json({ authenticated: true, email });
  });

  app.post("/api/internal-logout", (c) => {
    c.header("Set-Cookie", clearInternalAuthCookie(c));
    return c.json({ authenticated: false });
  });
}

export function registerInternalAuthMiddleware(app: Hono): void {
  app.use("/api/*", async (c, next) => requireInternalSession(c, next));
}

export function requireInternalUserEmail(c: Context): string {
  const email = getInternalUserEmail(c);
  if (!email) {
    throw new Error("Internal user session missing after auth middleware.");
  }

  return email;
}

function requireInternalSession(c: Context, next: Next): Response | Promise<Response | void> {
  if (!getInternalUserEmail(c)) {
    return c.json(errorResponse("unauthorized", "请先使用 @muxing.cfd 邮箱登录。"), 401);
  }

  return next();
}

function parseInternalLoginEmail(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  return normalizeInternalEmail(input.email);
}

function getInternalUserEmail(c: Context): string | undefined {
  return normalizeInternalEmail(getCookieValue(c.req.header("cookie"), INTERNAL_AUTH_COOKIE));
}

function normalizeInternalEmail(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const email = value.trim().toLowerCase();
  return INTERNAL_EMAIL_PATTERN.test(email) ? email : undefined;
}

function getCookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }

  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const cookie = part.trim();
    if (!cookie.startsWith(prefix)) {
      continue;
    }

    try {
      return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function createInternalAuthCookie(c: Context, email: string): string {
  return serializeInternalAuthCookie(c, encodeURIComponent(email), INTERNAL_SESSION_MAX_AGE_SECONDS);
}

function clearInternalAuthCookie(c: Context): string {
  return serializeInternalAuthCookie(c, "", 0);
}

function serializeInternalAuthCookie(c: Context, value: string, maxAge: number): string {
  const secure = isHttpsRequest(c) ? "; Secure" : "";
  return `${INTERNAL_AUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function isHttpsRequest(c: Context): boolean {
  return (
    c.req.header("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase() === "https" ||
    new URL(c.req.url).protocol === "https:"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
