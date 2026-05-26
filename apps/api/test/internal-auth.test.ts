import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { registerInternalAuthMiddleware, registerInternalAuthRoutes } from "../src/server/internal-auth.js";

test("internal login cookie can be used by the workbench iframe", async () => {
  const app = new Hono();
  registerInternalAuthRoutes(app);

  const response = await app.request("/api/internal-login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https"
    },
    body: JSON.stringify({ email: "mojibake@muxing.cfd" })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.email, "mojibake@muxing.cfd");
  assert.equal(body.isGuest, false);
  assert.equal(typeof body.sessionToken, "string");
  assert.ok(body.sessionToken.length > 0);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /muxing_canvas_user=mojibake%40muxing\.cfd/u);
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /Secure/u);
  assert.match(cookie, /SameSite=None/u);
});

test("guest login returns a guest session cookie and guest flag", async () => {
  const app = new Hono();
  registerInternalAuthRoutes(app);

  const response = await app.request("/api/guest-login", {
    method: "POST",
    headers: {
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.isGuest, true);
  assert.match(body.email, /^guest\+[0-9a-f-]+@muxing\.cfd$/u);
  assert.equal(typeof body.sessionToken, "string");
  assert.ok(body.sessionToken.length > 0);

  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /muxing_canvas_user=guest%2B[0-9a-f-]+%40muxing\.cfd/u);
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /Secure/u);
  assert.match(cookie, /SameSite=None/u);
});

test("internal login rejects non-muxing emails with a clear message", async () => {
  const app = new Hono();
  registerInternalAuthRoutes(app);

  const response = await app.request("/api/internal-login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https"
    },
    body: JSON.stringify({ email: "outsider@example.com" })
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "forbidden_email",
      message: "请输入 @muxing.cfd 邮箱地址。"
    }
  });
});

test("protected api without a session returns a clear login-required message", async () => {
  const app = new Hono();
  registerInternalAuthMiddleware(app);
  app.get("/api/protected", (c) => c.json({ ok: true }));

  const response = await app.request("/api/protected");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: {
      code: "unauthorized",
      message: "请先登录 @muxing.cfd 邮箱。"
    }
  });
});

test("protected api accepts the embedded bearer session token when cookies are unavailable", async () => {
  const app = new Hono();
  registerInternalAuthRoutes(app);
  registerInternalAuthMiddleware(app);
  app.get("/api/protected", (c) => c.json({ ok: true }));

  const login = await app.request("/api/internal-login", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ email: "mojibake@muxing.cfd" })
  });
  const session = await login.json();

  const response = await app.request("/api/protected", {
    headers: {
      authorization: `Bearer ${session.sessionToken}`
    }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("protected api accepts the embedded query session token for browser resource URLs", async () => {
  const app = new Hono();
  registerInternalAuthRoutes(app);
  registerInternalAuthMiddleware(app);
  app.get("/api/protected", (c) => c.json({ ok: true }));

  const login = await app.request("/api/internal-login", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ email: "mojibake@muxing.cfd" })
  });
  const session = await login.json();

  const response = await app.request(`/api/protected?muxing_session=${encodeURIComponent(session.sessionToken)}`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
