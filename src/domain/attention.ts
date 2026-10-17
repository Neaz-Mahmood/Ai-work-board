import type { Ctx } from "./context.ts";
import type { Ticket } from "../shared/types.ts";
import { notFound, validation } from "../server/errors.ts";
import { touchActor } from "./actors.ts";
import { recordActivity } from "./activity.ts";
import { getTicket, parseTicketKey } from "./tickets.ts";

export function setNeedsAttention(
  ctx: Ctx,
  actor: string,
  ticketKey: string,
  reason: string
): Ticket {
  if (typeof reason !== "string") {
    throw validation("Attention reason must be a string");
  }

  const trimmed = reason.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    throw validation("Attention reason must be between 1 and 500 characters");
  }

  const { projectKey, ticketNumber } = parseTicketKey(ticketKey);

  let canonicalProjectKey = "";
  let canonicalTicketKey = "";

  ctx.db.tx(() => {
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

    canonicalProjectKey = project.key;
    canonicalTicketKey = `${project.key}-${ticket.number}`;

    touchActor(ctx, actor);

    const now = ctx.clock.now().toISOString();

    ctx.db.run(
      "UPDATE tickets SET attention_reason = ?, updated_at = ? WHERE id = ?",
      trimmed,
      now,
      ticket.id
    );

    recordActivity(ctx, ticket.id, actor, "attention_flagged", {
      reason: trimmed,
    });
  });

  ctx.events.emit({
    type: "ticket.updated",
    projectKey: canonicalProjectKey,
    ticketKey: canonicalTicketKey,
    actor,
    at: ctx.clock.now().toISOString(),
  });

  return getTicket(ctx, canonicalTicketKey);
}

export function clearNeedsAttention(
  ctx: Ctx,
  actor: string,
  ticketKey: string
): Ticket {
  const { projectKey, ticketNumber } = parseTicketKey(ticketKey);

  let canonicalProjectKey = "";
  let canonicalTicketKey = "";
  let cleared = false;

  ctx.db.tx(() => {
    const project = ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE UPPER(key) = UPPER(?)",
      projectKey
    );
    if (!project) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const ticket = ctx.db.get<{
      id: number;
      number: number;
      attention_reason: string | null;
    }>(
      "SELECT id, number, attention_reason FROM tickets WHERE project_id = ? AND number = ?",
      project.id,
      ticketNumber
    );
    if (!ticket) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    canonicalProjectKey = project.key;
    canonicalTicketKey = `${project.key}-${ticket.number}`;

    if (ticket.attention_reason === null || ticket.attention_reason === undefined) {
      return;
    }

    touchActor(ctx, actor);

    const now = ctx.clock.now().toISOString();

    ctx.db.run(
      "UPDATE tickets SET attention_reason = NULL, updated_at = ? WHERE id = ?",
      now,
      ticket.id
    );

    recordActivity(ctx, ticket.id, actor, "attention_cleared", {
      reason: ticket.attention_reason,
    });

    cleared = true;
  });

  if (cleared) {
    ctx.events.emit({
      type: "ticket.updated",
      projectKey: canonicalProjectKey,
      ticketKey: canonicalTicketKey,
      actor,
      at: ctx.clock.now().toISOString(),
    });
  }

  return getTicket(ctx, canonicalTicketKey);
}
