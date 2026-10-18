import { Hono } from "hono";
import type { Ctx } from "../../domain/context.ts";
import { notFound, validation } from "../errors.ts";
import { restActor } from "../../domain/actors.ts";
import {
  createFeature,
  deleteFeature,
  getFeature,
  listFeatures,
  updateFeature,
} from "../../domain/features.ts";

export function createFeaturesRoute(ctx: Ctx): Hono {
  const router = new Hono();

  router.get("/api/projects/:key/features", async (c) => {
    const key = c.req.param("key");
    const features = await listFeatures(ctx, key);
    return c.json(features);
  });

  router.post("/api/projects/:key/features", async (c) => {
    const key = c.req.param("key");
    const actor = restActor(c.req.header("X-AWB-Actor"));

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      throw validation("Invalid JSON body");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw validation("Request body must be an object");
    }

    const result = await createFeature(ctx, actor, key, {
      name: body.name,
      description: body.description,
      color: body.color,
      tickets: body.tickets,
    });

    return c.json(result, 201);
  });

  router.get("/api/features/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (Number.isNaN(id)) {
      throw notFound("Feature not found");
    }
    const feature = await getFeature(ctx, id);
    return c.json(feature);
  });

  router.patch("/api/features/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (Number.isNaN(id)) {
      throw notFound("Feature not found");
    }
    const actor = restActor(c.req.header("X-AWB-Actor"));

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      throw validation("Invalid JSON body");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw validation("Request body must be an object");
    }

    const feature = await updateFeature(ctx, actor, id, body);
    return c.json(feature);
  });

  router.delete("/api/features/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (Number.isNaN(id)) {
      throw notFound("Feature not found");
    }
    const actor = restActor(c.req.header("X-AWB-Actor"));
    await deleteFeature(ctx, actor, id);
    return c.body(null, 204);
  });

  return router;
}
