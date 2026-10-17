import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Ctx } from "../../domain/context.ts";
import type { BoardEvent } from "../../domain/events.ts";

export function createEventsRoute(ctx: Ctx, sseHeartbeatMs?: number): Hono {
  const router = new Hono();
  const heartbeatMs = sseHeartbeatMs ?? 25000;

  router.get("/", (c) => {
    const project = c.req.query("project");

    return streamSSE(c, async (stream) => {
      let timer: NodeJS.Timeout | undefined;
      let unsubscribe: (() => void) | undefined;

      const cleanup = () => {
        if (timer) {
          clearInterval(timer);
          timer = undefined;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = undefined;
        }
      };

      stream.onAbort(() => {
        cleanup();
      });

      if (stream.aborted) {
        return;
      }

      unsubscribe = ctx.events.subscribe(async (e: BoardEvent) => {
        if (project && e.projectKey.toUpperCase() !== project.toUpperCase()) {
          return;
        }
        try {
          await stream.writeSSE({
            event: e.type,
            data: JSON.stringify(e),
          });
        } catch {
          cleanup();
        }
      });

      timer = setInterval(async () => {
        try {
          await stream.write(": ping\n\n");
        } catch {
          cleanup();
        }
      }, heartbeatMs);
      timer.unref?.();

      // Keep connection open until stream is aborted
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          cleanup();
          resolve();
        });
        c.req.raw.signal?.addEventListener("abort", () => {
          cleanup();
          resolve();
        });
      });
    });
  });

  return router;
}
