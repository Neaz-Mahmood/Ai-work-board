import { Hono } from "hono";
import type { Ctx } from "../../domain/context.ts";
import type { ColumnId, Priority } from "../../shared/types.ts";
import { validation } from "../errors.ts";
import { restActor, listActors } from "../../domain/actors.ts";
import {
  createTicket,
  getBoard,
  getTicket,
  listTickets,
  moveTicket,
  updateTicket,
  deleteTicket,
} from "../../domain/tickets.ts";
import { addComment } from "../../domain/comments.ts";
import { addBlocker, removeBlocker } from "../../domain/blockers.ts";
import { setNeedsAttention, clearNeedsAttention } from "../../domain/attention.ts";
import { claimNextTicket } from "../../domain/claim.ts";

export function createTicketsRoute(ctx: Ctx): Hono {
  const router = new Hono();

  router.post("/api/projects/:key/claim", async (c) => {
    const key = c.req.param("key");
    const actor = restActor(c.req.header("X-AWB-Actor"));

    let body: any = {};
    try {
      const text = await c.req.text();
      if (text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      throw validation("Invalid JSON body");
    }

    if (body && (typeof body !== "object" || Array.isArray(body))) {
      throw validation("Request body must be an object");
    }

    let featureId: number | undefined = undefined;
    if (body.featureId !== undefined && body.featureId !== null) {
      if (typeof body.featureId !== "number" || !Number.isInteger(body.featureId)) {
        throw validation("featureId must be an integer");
      }
      featureId = body.featureId;
    }

    const ticket = claimNextTicket(ctx, actor, key, { featureId });
    return c.json({ ticket }, 200);
  });

  router.post("/api/projects/:key/tickets", async (c) => {
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

    const ticket = createTicket(ctx, actor, key, {
      title: body.title,
      description: body.description,
      column: body.column as ColumnId | undefined,
      priority: body.priority as Priority | undefined,
      assignee: body.assignee,
      blockedBy: body.blockedBy,
      featureId: body.featureId,
    });

    return c.json(ticket, 201);
  });

  router.get("/api/projects/:key/tickets", (c) => {
    const key = c.req.param("key");
    const column = c.req.query("column") as ColumnId | undefined;
    const assignee = c.req.query("assignee");
    const q = c.req.query("q");
    const feature = c.req.query("feature");

    const cards = listTickets(ctx, key, {
      column: column || undefined,
      assignee: assignee || undefined,
      q: q || undefined,
      feature: feature || undefined,
    });

    return c.json(cards);
  });

  router.get("/api/projects/:key/board", (c) => {
    const key = c.req.param("key");
    const column = c.req.query("column") as ColumnId | undefined;
    const assignee = c.req.query("assignee");
    const q = c.req.query("q");
    const feature = c.req.query("feature");

    const board = getBoard(ctx, key, {
      column: column || undefined,
      assignee: assignee || undefined,
      q: q || undefined,
      feature: feature || undefined,
    });
    return c.json(board);
  });

  router.get("/api/tickets/:ticketKey", (c) => {
    const ticketKey = c.req.param("ticketKey");
    const ticket = getTicket(ctx, ticketKey);
    return c.json(ticket);
  });

  router.post("/api/tickets/:ticketKey/comments", async (c) => {
    const ticketKey = c.req.param("ticketKey");
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

    const comment = addComment(ctx, actor, ticketKey, body.body);
    return c.json(comment, 201);
  });

  router.patch("/api/tickets/:ticketKey", async (c) => {
    const ticketKey = c.req.param("ticketKey");
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

    const ticket = updateTicket(ctx, actor, ticketKey, body);
    return c.json(ticket);
  });

  router.post("/api/tickets/:ticketKey/move", async (c) => {
    const ticketKey = c.req.param("ticketKey");
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

    const ticket = moveTicket(ctx, actor, ticketKey, body);
    return c.json(ticket);
  });

  router.delete("/api/tickets/:ticketKey", (c) => {
    const ticketKey = c.req.param("ticketKey");
    const actor = restActor(c.req.header("X-AWB-Actor"));
    deleteTicket(ctx, actor, ticketKey);
    return c.body(null, 204);
  });

  router.post("/api/tickets/:ticketKey/blockers", async (c) => {
    const ticketKey = c.req.param("ticketKey");
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

    if (typeof body.blockerKey !== "string" || body.blockerKey.trim().length === 0) {
      throw validation("blockerKey is required");
    }

    const ticket = addBlocker(ctx, actor, ticketKey, body.blockerKey.trim());
    return c.json(ticket);
  });

  router.delete("/api/tickets/:ticketKey/blockers/:blockerKey", (c) => {
    const ticketKey = c.req.param("ticketKey");
    const blockerKey = c.req.param("blockerKey");
    const actor = restActor(c.req.header("X-AWB-Actor"));

    const ticket = removeBlocker(ctx, actor, ticketKey, blockerKey);
    return c.json(ticket);
  });

  router.put("/api/tickets/:ticketKey/attention", async (c) => {
    const ticketKey = c.req.param("ticketKey");
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

    const ticket = setNeedsAttention(ctx, actor, ticketKey, body.reason);
    return c.json(ticket);
  });

  router.delete("/api/tickets/:ticketKey/attention", (c) => {
    const ticketKey = c.req.param("ticketKey");
    const actor = restActor(c.req.header("X-AWB-Actor"));

    const ticket = clearNeedsAttention(ctx, actor, ticketKey);
    return c.json(ticket);
  });

  router.get("/api/actors", (c) => {
    const actors = listActors(ctx);
    return c.json(actors);
  });

  return router;
}
