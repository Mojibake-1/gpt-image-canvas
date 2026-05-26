import { upgradeWebSocket } from "@hono/node-server";
import type { Hono } from "hono";
import { createAgentWebSocketEvents } from "../../domain/agent/websocket-session.js";
import { requireInternalUserEmail } from "../internal-auth.js";

export function registerAgentWebSocketRoutes(app: Hono): void {
  app.get(
    "/api/agent/ws",
    upgradeWebSocket(
      (c) => createAgentWebSocketEvents(c.req.query("connectionId"), c.req.query("runId"), requireInternalUserEmail(c), c.req.query("conversationId")),
      {
      onError(error) {
        console.error("Agent WebSocket error.", error);
      }
      }
    )
  );
}
