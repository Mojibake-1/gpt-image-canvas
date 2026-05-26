import assert from "node:assert/strict";
import test from "node:test";
import { loginEmailForSession, resetLoginEmail } from "../src/features/canvas/login-email-state.ts";

test("loginEmailForSession keeps internal user emails available for the login form", () => {
  assert.equal(
    loginEmailForSession({
      authenticated: true,
      email: "artist@muxing.cfd",
      isGuest: false
    }),
    "artist@muxing.cfd"
  );
});

test("loginEmailForSession does not expose guest session emails in the login form", () => {
  assert.equal(
    loginEmailForSession({
      authenticated: true,
      email: "guest+12345678-1234-1234-1234-123456789abc@muxing.cfd",
      isGuest: true
    }),
    ""
  );
});

test("resetLoginEmail clears stale values after a forced return to the login screen", () => {
  assert.equal(resetLoginEmail("guest+stale@muxing.cfd"), "");
  assert.equal(resetLoginEmail("artist@muxing.cfd"), "");
});
