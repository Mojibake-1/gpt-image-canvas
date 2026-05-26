import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedSessionError, createApiError } from "../src/features/canvas/api-errors.ts";

test("createApiError upgrades unauthorized responses into session errors", async () => {
  const response = new Response(JSON.stringify({
    error: {
      code: "unauthorized",
      message: "请先登录 @muxing.cfd 邮箱。"
    }
  }), {
    status: 401,
    headers: {
      "content-type": "application/json"
    }
  });

  const error = await createApiError(response, "zh-CN", (_key, params) => `请求失败（HTTP ${params.status}）`);

  assert.ok(error instanceof UnauthorizedSessionError);
  assert.equal(error.message, "请先登录 @muxing.cfd 邮箱。（HTTP 401）");
});

test("createApiError keeps non-auth failures as ordinary errors", async () => {
  const response = new Response(JSON.stringify({
    error: {
      code: "service_unavailable",
      message: "服务暂时不可用。"
    }
  }), {
    status: 503,
    headers: {
      "content-type": "application/json"
    }
  });

  const error = await createApiError(response, "zh-CN", (_key, params) => `请求失败（HTTP ${params.status}）`);

  assert.equal(error instanceof UnauthorizedSessionError, false);
  assert.equal(error.message, "服务暂时不可用。（HTTP 503）");
});
