import type { Hono } from "hono";
import type { Ctx } from "../domain/context.ts";
import { DomainError } from "./errors.ts";
import { createProjectsRoute } from "./routes/projects.ts";
import { createTicketsRoute } from "./routes/tickets.ts";
import { createFeaturesRoute } from "./routes/features.ts";
import "./requestActor.ts";

// Board REST routes with no Node-only dependencies, so the in-browser demo can mount them too.
export function mountApiRoutes(app: Hono, ctx: Ctx): void {
  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: err.message || "Internal server error" } }, 500);
  });

  app.route("/api/projects", createProjectsRoute(ctx));
  app.route("/", createFeaturesRoute(ctx));
  app.route("/", createTicketsRoute(ctx));
}
