import { randomUUID } from "node:crypto";
import type { Context, Hono, Next } from "hono";
import { ensureProjectForOwner } from "../domain/project/project-store.js";
import { errorResponse } from "./http/errors.js";
import { readJson } from "./http/json.js";

const INTERNAL_AUTH_COOKIE = "muxing_canvas_user";
const INTERNAL_AUTH_QUERY = "muxing_session";
const INTERNAL_EMAIL_PATTERN = /^[^@\s]+@muxing\.cfd$/u;
const INTERNAL_GUEST_EMAIL_PATTERN = /^guest\+[0-9a-f-]+@muxing\.cfd$/u;
const INTERNAL_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const GUEST_ONLY_PROVIDER_MESSAGE = "Guest 访客模式不能访问这个 API。";

export function registerInternalAuthRoutes(app: Hono): void {
  app.get("/api/internal-session", (c) => {
    const email = getInternalUserEmail(c);
    return c.json(email ? createInternalSessionResponse(email) : { authenticated: false });
  });

  app.post("/api/internal-login", async (c) => {
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }

    const email = parseInternalLoginEmail(payload.value);
    if (!email || isGuestUserEmail(email)) {
      return c.json(errorResponse("forbidden_email", "请输入 @muxing.cfd 邮箱地址。"), 403);
    }

    ensureProjectForOwner(email);
    c.header("Set-Cookie", createInternalAuthCookie(c, email));
    return c.json(createInternalSessionResponse(email));
  });

  app.post("/api/guest-login", (c) => {
    const email = createGuestUserEmail();
    ensureProjectForOwner(email);
    c.header("Set-Cookie", createInternalAuthCookie(c, email));
    return c.json(createInternalSessionResponse(email));
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

export function getInternalUserEmail(c: Context): string | undefined {
  return (
    normalizeInternalEmail(getCookieValue(c.req.header("cookie"), INTERNAL_AUTH_COOKIE)) ??
    emailFromSessionToken(readBearerToken(c.req.header("authorization"))) ??
    emailFromSessionToken(c.req.query(INTERNAL_AUTH_QUERY))
  );
}

export function isGuestUserEmail(email: string): boolean {
  return INTERNAL_GUEST_EMAIL_PATTERN.test(email);
}

export function isGuestRequest(c: Context): boolean {
  const email = getInternalUserEmail(c);
  return Boolean(email && isGuestUserEmail(email));
}

export function forbiddenForGuest(c: Context): Response {
  return c.json(errorResponse("forbidden_guest", GUEST_ONLY_PROVIDER_MESSAGE), 403);
}

function requireInternalSession(c: Context, next: Next): Response | Promise<Response | void> {
  if (!getInternalUserEmail(c)) {
    return c.json(errorResponse("unauthorized", "请先登录 @muxing.cfd 邮箱。"), 401);
  }

  return next();
}

function parseInternalLoginEmail(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  return normalizeInternalEmail(input.email);
}

function normalizeInternalEmail(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const email = value.trim().toLowerCase();
  return INTERNAL_EMAIL_PATTERN.test(email) || INTERNAL_GUEST_EMAIL_PATTERN.test(email) ? email : undefined;
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

function createInternalSessionResponse(email: string): { authenticated: true; email: string; isGuest: boolean; sessionToken: string } {
  return {
    authenticated: true,
    email,
    isGuest: isGuestUserEmail(email),
    sessionToken: createInternalSessionToken(email)
  };
}

function createInternalSessionToken(email: string): string {
  return Buffer.from(email, "utf8").toString("base64url");
}

function emailFromSessionToken(token: string | undefined): string | undefined {
  if (!token) {
    return undefined;
  }

  try {
    return normalizeInternalEmail(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/iu.exec(header.trim());
  return match?.[1]?.trim();
}

function clearInternalAuthCookie(c: Context): string {
  return serializeInternalAuthCookie(c, "", 0);
}

function serializeInternalAuthCookie(c: Context, value: string, maxAge: number): string {
  const secure = isHttpsRequest(c) ? "; Secure" : "";
  const sameSite = isHttpsRequest(c) ? "None" : "Lax";
  return `${INTERNAL_AUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
}

function isHttpsRequest(c: Context): boolean {
  return (
    c.req.header("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase() === "https" ||
    new URL(c.req.url).protocol === "https:"
  );
}

function createGuestUserEmail(): string {
  return `guest+${randomUUID()}@muxing.cfd`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
