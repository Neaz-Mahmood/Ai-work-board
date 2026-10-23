import fs from "node:fs";
import path from "node:path";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Clock } from "./clock.ts";
import { systemClock } from "./clock.ts";
import type { Db } from "./db.ts";
import { openPglite } from "./db-pglite.ts";
import { openPostgres } from "./db-postgres.ts";
import { migrate } from "./migrations.ts";
import type { Ctx } from "../domain/context.ts";
import { EventBus } from "../domain/events.ts";
import { createEventsRoute } from "./routes/events.ts";
import { createAuthRoute } from "./routes/auth.ts";
import { verifySessionCookie, tokenMatches } from "./auth.ts";
import { mountApiRoutes } from "./apiRoutes.ts";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "../mcp/server.ts";

export type AppOptions = {
  dataDir: string;
  clock?: Clock;
  staticDir?: string;
  sseHeartbeatMs?: number;
  database?: { kind: "pglite"; dir?: string } | { kind: "postgres"; url: string; schema?: string };
  auth?: {
    ownerPasswordHash: string;
    sessionSecret: string;
    apiTokens: string[];
    secureCookies: boolean;
  };
  allowedOrigins?: string[];
  trustProxy?: boolean;
};

export async function createApp(opts: AppOptions): Promise<{ app: Hono; ctx: Ctx; close(): Promise<void> }> {
  fs.mkdirSync(opts.dataDir, { recursive: true });

  const databaseConfig = opts.database ?? {
    kind: "pglite" as const,
    dir: path.join(opts.dataDir, "pgdata"),
  };

  let db: Db & { close(): Promise<void> };
  if (databaseConfig.kind === "postgres") {
    db = await openPostgres(databaseConfig.url, { schema: databaseConfig.schema });
  } else {
    db = await openPglite(databaseConfig.dir);
  }

  await migrate(db);

  const clock = opts.clock ?? systemClock;
  const events = new EventBus();
  const ctx: Ctx = { db, clock, events };

  const app = new Hono();

  const allowed = new Set(opts.allowedOrigins ?? []);
  const rawCors = cors({
    origin: (origin) => (allowed.has(origin) ? origin : null),
    credentials: true,
    allowHeaders: ["Content-Type", "X-AWB-Actor", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  const corsMw: MiddlewareHandler = async (c, next) => {
    const origin = c.req.header("origin");
    if (!origin || !allowed.has(origin)) {
      return next();
    }
    return rawCors(c, next);
  };

  app.use("/api/*", corsMw);
  app.use("/mcp", corsMw);
  app.use("/mcp/*", corsMw);

  if (opts.auth) {
    const authConfig = opts.auth;
    const authMiddleware: MiddlewareHandler = async (c, next) => {
      const path = c.req.path;
      if (
        path === "/api/health" ||
        path.startsWith("/api/health/") ||
        path === "/api/auth" ||
        path.startsWith("/api/auth/")
      ) {
        return next();
      }

      if (await verifySessionCookie(c, authConfig.sessionSecret, clock)) {
        c.set("principal", "owner");
        return next();
      }

      const authHeader = c.req.header("Authorization");
      if (authHeader) {
        const match = authHeader.match(/^bearer\s+(.+)$/i);
        if (match) {
          const token = match[1].trim();
          if (token && tokenMatches(token, authConfig.apiTokens)) {
            c.set("principal", "agent");
            return next();
          }
        }
      }

      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        401
      );
    };

    app.use("/api/*", authMiddleware);
    app.use("/api", authMiddleware);
    app.use("/mcp", authMiddleware);
    app.use("/mcp/*", authMiddleware);
  }

  const pkgPath = new URL("../../package.json", import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const version = pkg.version as string;

  app.get("/api/health", (c) => {
    return c.json({ ok: true, version });
  });

  app.route("/api/auth", createAuthRoute(ctx, opts.auth, { trustProxy: opts.trustProxy }));
  app.route("/api/events", createEventsRoute(ctx, opts.sseHeartbeatMs));
  mountApiRoutes(app, ctx);

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
      await db.close();
    },
  };
}
