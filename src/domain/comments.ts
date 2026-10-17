import type { Ctx } from "./context.ts";
import type { Comment } from "../shared/types.ts";
import { notFound, validation } from "../server/errors.ts";
import { touchActor } from "./actors.ts";
import { recordActivity } from "./activity.ts";
import { parseTicketKey } from "./tickets.ts";

export function addComment(
  ctx: Ctx,
  actor: string,
  ticketKey: string,
  body: string
): Comment {
  if (typeof body !== "string") {
    throw validation("Comment body must be a string");
  }

  const trimmedBody = body.trim();
  if (trimmedBody.length === 0 || trimmedBody.length > 20000) {
    throw validation("Comment body must be between 1 and 20000 characters");
  }

  const { projectKey, ticketNumber } = parseTicketKey(ticketKey);

  const { comment, canonicalProjectKey, canonicalTicketKey } = ctx.db.tx(() => {
    const project = ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE UPPER(key) = UPPER(?)",
      projectKey
    );
    if (!project) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const ticket = ctx.db.get<{ id: number; number: number }>(
      "SELECT id, number FROM tickets WHERE project_id = ? AND number = ?",
      project.id,
      ticketNumber
    );
    if (!ticket) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    touchActor(ctx, actor);

    const now = ctx.clock.now().toISOString();

    const insertResult = ctx.db.run(
      "INSERT INTO comments (ticket_id, actor, body, created_at) VALUES (?, ?, ?, ?)",
      ticket.id,
      actor,
      trimmedBody,
      now
    );
    const commentId = insertResult.lastInsertRowid;

    ctx.db.run(
      "UPDATE tickets SET updated_at = ? WHERE id = ?",
      now,
      ticket.id
    );

    recordActivity(ctx, ticket.id, actor, "commented", { commentId });

    const comment: Comment = {
      id: commentId,
      actor,
      body: trimmedBody,
      createdAt: now,
    };

    return {
      comment,
      canonicalProjectKey: project.key,
      canonicalTicketKey: `${project.key}-${ticket.number}`,
    };
  });

  ctx.events.emit({
    type: "ticket.commented",
    projectKey: canonicalProjectKey,
    ticketKey: canonicalTicketKey,
    actor,
    at: ctx.clock.now().toISOString(),
  });

  return comment;
}

export function listComments(ctx: Ctx, ticketId: number): Comment[] {
  const rows = ctx.db.all<{
    id: number;
    actor: string;
    body: string;
    created_at: string;
  }>(
    "SELECT id, actor, body, created_at FROM comments WHERE ticket_id = ? ORDER BY id ASC",
    ticketId
  );

  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    body: r.body,
    createdAt: r.created_at,
  }));
}
