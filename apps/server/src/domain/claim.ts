import type { Ctx } from "./context.ts";
import type { ColumnId, Ticket } from "@awb/shared/types.ts";
import { notFound, validation } from "../server/errors.ts";
import { ACTOR_NAME, touchActor } from "./actors.ts";
import { recordActivity } from "./activity.ts";
import {
  compactColumnRanks,
  getTicket,
  insertTicketAtRank,
} from "./tickets.ts";

export type ClaimNextTicketOptions = {
  featureId?: number | null;
};

export async function claimNextTicket(
  ctx: Ctx,
  actor: string,
  projectKey: string,
  opts?: ClaimNextTicketOptions
): Promise<Ticket | null> {
  if (typeof actor !== "string") {
    throw validation("Actor name must be a string");
  }
  const trimmedActor = actor.trim();
  if (!ACTOR_NAME.test(trimmedActor)) {
    throw validation(
      `Invalid actor name "${actor}". Actor names must be 1 to 40 characters matching ${ACTOR_NAME}.`
    );
  }

  if (typeof projectKey !== "string" || projectKey.trim().length === 0) {
    throw validation("Project key is required");
  }

  if (opts !== undefined && opts !== null) {
    if (typeof opts !== "object" || Array.isArray(opts)) {
      throw validation("Options must be an object");
    }
    if (opts.featureId !== undefined && opts.featureId !== null) {
      if (typeof opts.featureId !== "number" || !Number.isInteger(opts.featureId)) {
        throw validation("featureId must be an integer");
      }
    }
  }

  const claimedTicket = await ctx.db.tx(async () => {
    const project = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      projectKey.trim()
    );
    if (!project) {
      throw notFound(`Project ${projectKey} not found`);
    }

    if (opts?.featureId !== undefined && opts?.featureId !== null) {
      const feat = await ctx.db.get<{ id: number }>(
        "SELECT id FROM features WHERE id = ? AND project_id = ?",
        opts.featureId,
        project.id
      );
      if (!feat) {
        throw validation("Feature must belong to the same project");
      }
    }

    let sql = `
      SELECT id, project_id, number, title, column_id, rank
      FROM tickets t
      WHERE t.project_id = ?
        AND t.column_id = 'todo'
        AND t.assignee IS NULL
        AND t.attention_reason IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM ticket_blockers tb
          JOIN tickets b ON tb.blocker_id = b.id
          WHERE tb.ticket_id = t.id AND b.column_id <> 'done'
        )
    `;
    const params: (string | number)[] = [project.id];

    if (opts?.featureId !== undefined && opts?.featureId !== null) {
      sql += " AND t.feature_id = ?";
      params.push(opts.featureId);
    }

    sql += " ORDER BY t.rank ASC, t.id ASC LIMIT 1";

    const ticketRow = await ctx.db.get<{
      id: number;
      project_id: number;
      number: number;
      title: string;
      column_id: ColumnId;
      rank: number;
    }>(sql, ...params);

    if (!ticketRow) {
      return null;
    }

    await touchActor(ctx, trimmedActor);
    const now = ctx.clock.now().toISOString();

    await ctx.db.run(
      "UPDATE tickets SET assignee = ? WHERE id = ?",
      trimmedActor,
      ticketRow.id
    );

    await compactColumnRanks(ctx, project.id, "todo", ticketRow.id);
    await insertTicketAtRank(ctx, ticketRow.id, project.id, "in_progress", null, now);

    await recordActivity(ctx, ticketRow.id, trimmedActor, "claimed", {
      from: "todo",
      to: "in_progress",
    });

    return await getTicket(ctx, `${project.key}-${ticketRow.number}`);
  });

  if (claimedTicket) {
    ctx.events.emit({
      type: "ticket.moved",
      projectKey: claimedTicket.projectKey,
      ticketKey: claimedTicket.key,
      actor: trimmedActor,
      at: ctx.clock.now().toISOString(),
    });
  }

  return claimedTicket;
}
