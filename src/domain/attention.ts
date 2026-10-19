import type { Ctx } from "./context.ts";
import type { Ticket } from "@awb/shared/types.ts";
import { notFound, validation } from "../server/errors.ts";
import { touchActor } from "./actors.ts";
import { recordActivity } from "./activity.ts";
import { getTicket, parseTicketKey } from "./tickets.ts";

export async function setNeedsAttention(
  ctx: Ctx,
  actor: string,
  ticketKey: string,
  reason: string
): Promise<Ticket> {
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

  await ctx.db.tx(async () => {
    const project = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      projectKey
    );
    if (!project) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const ticket = await ctx.db.get<{ id: number; number: number }>(
      "SELECT id, number FROM tickets WHERE project_id = ? AND number = ?",
      project.id,
      ticketNumber
    );
    if (!ticket) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    canonicalProjectKey = project.key;
    canonicalTicketKey = `${project.key}-${ticket.number}`;

    await touchActor(ctx, actor);

    const now = ctx.clock.now().toISOString();

    await ctx.db.run(
      "UPDATE tickets SET attention_reason = ?, updated_at = ? WHERE id = ?",
      trimmed,
      now,
      ticket.id
    );

    await recordActivity(ctx, ticket.id, actor, "attention_flagged", {
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

  return await getTicket(ctx, canonicalTicketKey);
}

export async function clearNeedsAttention(
  ctx: Ctx,
  actor: string,
  ticketKey: string
): Promise<Ticket> {
  const { projectKey, ticketNumber } = parseTicketKey(ticketKey);

  let canonicalProjectKey = "";
  let canonicalTicketKey = "";
  let cleared = false;

  await ctx.db.tx(async () => {
    const project = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      projectKey
    );
    if (!project) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const ticket = await ctx.db.get<{
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

    await touchActor(ctx, actor);

    const now = ctx.clock.now().toISOString();

    await ctx.db.run(
      "UPDATE tickets SET attention_reason = NULL, updated_at = ? WHERE id = ?",
      now,
      ticket.id
    );

    await recordActivity(ctx, ticket.id, actor, "attention_cleared", {
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

  return await getTicket(ctx, canonicalTicketKey);
}
