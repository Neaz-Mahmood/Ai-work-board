import { Hono } from "hono";
import type { BoardEvent } from "@awb/shared/events.ts";
import { openPglite } from "../../../server/src/server/db-pglite.ts";
import { migrate } from "../../../server/src/server/migrations.ts";
import { mountApiRoutes } from "../../../server/src/server/apiRoutes.ts";
import { systemClock } from "../../../server/src/server/clock.ts";
import { EventBus } from "../../../server/src/domain/events.ts";
import type { Ctx } from "../../../server/src/domain/context.ts";
import { seedDemo } from "./seed.ts";

const ORIGIN = "http://demo.local";

type Backend = { app: Hono; ctx: Ctx };

let backendPromise: Promise<Backend> | undefined;

async function openBackend(): Promise<Backend> {
  const db = await openPglite("idb://awb-demo");
  await migrate(db);
  const ctx: Ctx = { db, clock: systemClock, events: new EventBus() };
  await seedDemo(ctx);

  const app = new Hono();
  app.get("/api/auth/session", (c) => c.json({ authEnabled: false, signedIn: true }));
  mountApiRoutes(app, ctx);
  return { app, ctx };
}

function backend(): Promise<Backend> {
  // Drop a failed start so the next request retries instead of failing forever.
  backendPromise ??= openBackend().catch((err) => {
    backendPromise = undefined;
    throw err;
  });
  return backendPromise;
}

let queue: Promise<unknown> = Promise.resolve();

// Runs backend work one job at a time (see asyncLocalStorageShim.ts).
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.catch(() => undefined);
  return result;
}

// Same contract as fetch, but served by the in-browser API.
export function demoFetch(url: string, init?: RequestInit): Promise<Response> {
  return serialized(async () => {
    const { app } = await backend();
    return app.fetch(new Request(new URL(url, ORIGIN), init));
  });
}

export function subscribeDemoEvents(fn: (e: BoardEvent) => void): () => void {
  let unsubscribe: (() => void) | undefined;
  let cancelled = false;
  void backend().then(({ ctx }) => {
    if (!cancelled) unsubscribe = ctx.events.subscribe(fn);
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

// Bookkeeping tables that survive a reset; everything else is board data.
const KEPT_TABLES = ["schema_version", "app_meta"];

// Wipes the board and puts the sample project back.
export async function resetDemo(): Promise<void> {
  await serialized(async () => {
    const { ctx } = await backend();
    const tables = await ctx.db.all<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename NOT IN (${KEPT_TABLES.map(() => "?").join(", ")})`,
      ...KEPT_TABLES
    );
    const names = tables.map((t) => `"${t.tablename}"`).join(", ");
    await ctx.db.exec(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
    await seedDemo(ctx);
  });
  window.location.assign(import.meta.env.BASE_URL);
}
