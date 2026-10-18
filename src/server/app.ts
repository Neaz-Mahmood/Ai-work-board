import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Clock } from "./clock.ts";
import { systemClock } from "./clock.ts";
import { openSqlite } from "./db.ts";
import { migrate } from "./migrations.ts";
import { DomainError } from "./errors.ts";
import type { Ctx } from "../domain/context.ts";
import { EventBus } from "../domain/events.ts";
import { createProjectsRoute } from "./routes/projects.ts";
import { createTicketsRoute } from "./routes/tickets.ts";
import { createFeaturesRoute } from "./routes/features.ts";
import { createEventsRoute } from "./routes/events.ts";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "../mcp/server.ts";

export type AppOptions = {
  dataDir: string;
  clock?: Clock;
  staticDir?: string;
  sseHeartbeatMs?: number;
};

export async function createApp(opts: AppOptions): Promise<{ app: Hono; ctx: Ctx; close(): Promise<void> }> {
  fs.mkdirSync(opts.dataDir, { recursive: true });
  const dbFile = path.join(opts.dataDir, "board.db");
  const { db, adb, close: closeDb } = openSqlite(dbFile);
  migrate(db);

  const clock = opts.clock ?? systemClock;
  const events = new EventBus();
  const ctx: Ctx = { db, adb, clock, events };

  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: err.message || "Internal server error" } }, 500);
  });

  const pkgPath = new URL("../../package.json", import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const version = pkg.version as string;

  app.get("/api/health", (c) => {
    return c.json({ ok: true, version });
  });

  app.route("/api/events", createEventsRoute(ctx, opts.sseHeartbeatMs));
  app.route("/api/projects", createProjectsRoute(ctx));
  app.route("/", createFeaturesRoute(ctx));
  app.route("/", createTicketsRoute(ctx));

  // Mount MCP endpoint over Streamable HTTP in stateless mode.
  // We use the SDK's WebStandardStreamableHTTPServerTransport directly with Hono's
  // web-standard Request and Response objects (stateless mode with sessionIdGenerator: undefined).
  app.all("/mcp", async (c) => {
    const urlActor = c.req.query("actor");
    const server = buildMcpServer(ctx, urlActor);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    const staticDir = opts.staticDir;
    app.use("*", async (c, next) => {
      if (c.req.path.startsWith("/api") || c.req.path.startsWith("/mcp")) {
        return next();
      }
      return serveStatic({ root: staticDir })(c, next);
    });

    app.get("*", async (c, next) => {
      if (c.req.path.startsWith("/api") || c.req.path.startsWith("/mcp")) {
        return next();
      }
      return serveStatic({ root: staticDir, path: "index.html" })(c, next);
    });
  }

  return {
    app,
    ctx,
    async close(): Promise<void> {
      closeDb();
    },
  };
}
