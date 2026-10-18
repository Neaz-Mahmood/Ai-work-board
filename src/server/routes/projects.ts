import { Hono } from "hono";
import type { Ctx } from "../../domain/context.ts";
import { validation } from "../errors.ts";
import { restActor } from "../../domain/actors.ts";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  resolveProject,
} from "../../domain/projects.ts";

export function createProjectsRoute(ctx: Ctx): Hono {
  const router = new Hono();

  router.get("/", async (c) => {
    const list = await listProjects(ctx);
    return c.json(list);
  });

  router.post("/", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      throw validation("Invalid JSON body");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw validation("Request body must be an object");
    }

    if (typeof body.path !== "string") {
      throw validation("Path is required and must be a string");
    }

    if (body.name !== undefined && typeof body.name !== "string") {
      throw validation("Name must be a string");
    }

    if (body.key !== undefined && typeof body.key !== "string") {
      throw validation("Key must be a string");
    }

    const actor = restActor(c.req.header("X-AWB-Actor"));
    const project = await createProject(
      ctx,
      {
        path: body.path,
        name: body.name,
        key: body.key,
      },
      actor
    );

    return c.json(project, 201);
  });

  router.get("/resolve", async (c) => {
    const cwd = c.req.query("cwd");
    const key = c.req.query("key");
    const project = await resolveProject(ctx, { cwd, key });
    return c.json(project);
  });

  router.get("/:key", async (c) => {
    const key = c.req.param("key");
    const project = await getProject(ctx, key);
    return c.json(project);
  });

  router.patch("/:key", async (c) => {
    const key = c.req.param("key");
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      throw validation("Invalid JSON body");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw validation("Request body must be an object");
    }

    if (typeof body.name !== "string") {
      throw validation("Name is required and must be a string");
    }

    const actor = restActor(c.req.header("X-AWB-Actor"));
    const project = await renameProject(ctx, key, body.name, actor);
    return c.json(project);
  });

  router.delete("/:key", async (c) => {
    const key = c.req.param("key");
    const actor = restActor(c.req.header("X-AWB-Actor"));
    await deleteProject(ctx, key, actor);
    return c.body(null, 204);
  });

  return router;
}
