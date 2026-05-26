import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { registerInternalAuthRoutes } from "../src/server/internal-auth.js";

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

  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /muxing_canvas_user=guest%2B[0-9a-f-]+%40muxing\.cfd/u);
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /Secure/u);
  assert.match(cookie, /SameSite=None/u);
});
