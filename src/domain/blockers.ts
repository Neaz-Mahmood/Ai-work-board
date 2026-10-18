import type { Ctx } from "./context.ts";
import type { Ticket } from "../shared/types.ts";
import { notFound, validation } from "../server/errors.ts";
import { touchActor } from "./actors.ts";
import { recordActivity } from "./activity.ts";
import { getTicket, parseTicketKey } from "./tickets.ts";

export async function checkBlockerCycle(
  ctx: Ctx,
  blockerTicketId: number,
  blockedTicketId: number
): Promise<void> {
  const visited = new Set<number>();
  const queue: number[] = [blockerTicketId];

  while (queue.length > 0) {
    const currId = queue.shift()!;
    const rows = await ctx.db.all<{ blocker_id: number }>(
      "SELECT blocker_id FROM ticket_blockers WHERE ticket_id = ?",
      currId
    );

    for (const row of rows) {
      if (row.blocker_id === blockedTicketId) {
        throw validation("That would create a blocker cycle");
      }
      if (!visited.has(row.blocker_id)) {
        visited.add(row.blocker_id);
        queue.push(row.blocker_id);
      }
    }
  }
}

export async function addBlocker(
  ctx: Ctx,
  actor: string,
  ticketKey: string,
  blockerKey: string
): Promise<Ticket> {
  if (typeof blockerKey !== "string" || blockerKey.trim().length === 0) {
    throw validation("blockerKey is required");
  }

  const { projectKey: tProjKey, ticketNumber: tNum } = parseTicketKey(ticketKey);
  const { projectKey: bProjKey, ticketNumber: bNum } = parseTicketKey(blockerKey);

  let canonicalProjectKey = "";
  let canonicalTicketKey = "";
  let canonicalBlockerKey = "";
  let linkAlreadyExisted = false;

  await ctx.db.tx(async () => {
    const tProj = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      tProjKey
    );
    if (!tProj) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const ticketRow = await ctx.db.get<{ id: number; number: number; project_id: number }>(
      "SELECT id, number, project_id FROM tickets WHERE project_id = ? AND number = ?",
      tProj.id,
      tNum
    );
    if (!ticketRow) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const bProj = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      bProjKey
    );
    if (!bProj) {
      throw notFound(`Ticket ${blockerKey} not found`);
    }

    const blockerRow = await ctx.db.get<{ id: number; number: number; project_id: number }>(
      "SELECT id, number, project_id FROM tickets WHERE project_id = ? AND number = ?",
      bProj.id,
      bNum
    );
    if (!blockerRow) {
      throw notFound(`Ticket ${blockerKey} not found`);
    }

    canonicalProjectKey = tProj.key;
    canonicalTicketKey = `${tProj.key}-${ticketRow.number}`;
    canonicalBlockerKey = `${bProj.key}-${blockerRow.number}`;

    if (ticketRow.project_id !== blockerRow.project_id) {
      throw validation("Blockers must be in the same project");
    }

    if (ticketRow.id === blockerRow.id) {
      throw validation("A ticket cannot block itself");
    }

    const existing = await ctx.db.get<{ ticket_id: number }>(
      "SELECT ticket_id FROM ticket_blockers WHERE ticket_id = ? AND blocker_id = ?",
      ticketRow.id,
      blockerRow.id
    );

    if (existing) {
      linkAlreadyExisted = true;
      return;
    }

    await checkBlockerCycle(ctx, blockerRow.id, ticketRow.id);

    await touchActor(ctx, actor);

    await ctx.db.run(
      "INSERT INTO ticket_blockers (ticket_id, blocker_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
      ticketRow.id,
      blockerRow.id
    );

    const now = ctx.clock.now().toISOString();
    await ctx.db.run("UPDATE tickets SET updated_at = ? WHERE id = ?", now, ticketRow.id);

    await recordActivity(ctx, ticketRow.id, actor, "blocker_added", {
      blockerKey: canonicalBlockerKey,
    });
  });

  if (!linkAlreadyExisted) {
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

export async function removeBlocker(
  ctx: Ctx,
  actor: string,
  ticketKey: string,
  blockerKey: string
): Promise<Ticket> {
  if (typeof blockerKey !== "string" || blockerKey.trim().length === 0) {
    throw validation("blockerKey is required");
  }

  const { projectKey: tProjKey, ticketNumber: tNum } = parseTicketKey(ticketKey);

  let canonicalProjectKey = "";
  let canonicalTicketKey = "";
  let canonicalBlockerKey = "";
  let removed = false;

  await ctx.db.tx(async () => {
    const tProj = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      tProjKey
    );
    if (!tProj) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const ticketRow = await ctx.db.get<{ id: number; number: number }>(
      "SELECT id, number FROM tickets WHERE project_id = ? AND number = ?",
      tProj.id,
      tNum
    );
    if (!ticketRow) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    canonicalProjectKey = tProj.key;
    canonicalTicketKey = `${tProj.key}-${ticketRow.number}`;

    let blockerRow: { id: number; number: number; key: string } | undefined;
    try {
      const { projectKey: bProjKey, ticketNumber: bNum } = parseTicketKey(blockerKey);
      const bProj = await ctx.db.get<{ id: number; key: string }>(
        "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
        bProjKey
      );
      if (bProj) {
        const bTicket = await ctx.db.get<{ id: number; number: number }>(
          "SELECT id, number FROM tickets WHERE project_id = ? AND number = ?",
          bProj.id,
          bNum
        );
        if (bTicket) {
          blockerRow = {
            id: bTicket.id,
            number: bTicket.number,
            key: `${bProj.key}-${bTicket.number}`,
          };
        }
      }
    } catch {
      // invalid key format means link is definitely missing
    }

    if (!blockerRow) {
      // Blocker ticket doesn't exist -> missing link is a no-op
      return;
    }

    canonicalBlockerKey = blockerRow.key;

    const existing = await ctx.db.get<{ ticket_id: number }>(
      "SELECT ticket_id FROM ticket_blockers WHERE ticket_id = ? AND blocker_id = ?",
      ticketRow.id,
      blockerRow.id
    );

    if (!existing) {
      // Link doesn't exist -> no-op
      return;
    }

    await touchActor(ctx, actor);

    await ctx.db.run(
      "DELETE FROM ticket_blockers WHERE ticket_id = ? AND blocker_id = ?",
      ticketRow.id,
      blockerRow.id
    );

    const now = ctx.clock.now().toISOString();
    await ctx.db.run("UPDATE tickets SET updated_at = ? WHERE id = ?", now, ticketRow.id);

    await recordActivity(ctx, ticketRow.id, actor, "blocker_removed", {
      blockerKey: canonicalBlockerKey,
    });
    removed = true;
  });

  if (removed) {
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

export async function attachBlockersOnCreate(
  ctx: Ctx,
  actor: string,
  ticketId: number,
  projectId: number,
  projectKey: string,
  ticketNumber: number,
  blockedBy: string[]
): Promise<void> {
  const addedBlockerIds = new Set<number>();

  for (const bKey of blockedBy) {
    if (typeof bKey !== "string" || bKey.trim().length === 0) {
      throw validation("blockedBy must contain valid ticket keys");
    }

    const { projectKey: bProjKey, ticketNumber: bNum } = parseTicketKey(bKey);
    const bProj = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      bProjKey
    );
    if (!bProj) {
      throw notFound(`Ticket ${bKey} not found`);
    }

    const bTicket = await ctx.db.get<{ id: number; number: number; project_id: number }>(
      "SELECT id, number, project_id FROM tickets WHERE project_id = ? AND number = ?",
      bProj.id,
      bNum
    );
    if (!bTicket) {
      throw notFound(`Ticket ${bKey} not found`);
    }

    if (bTicket.project_id !== projectId) {
      throw validation("Blockers must be in the same project");
    }

    if (
      bTicket.id === ticketId ||
      (bProj.key.toLowerCase() === projectKey.toLowerCase() && bTicket.number === ticketNumber)
    ) {
      throw validation("A ticket cannot block itself");
    }

    if (addedBlockerIds.has(bTicket.id)) {
      // Duplicate in input -> no-op
      continue;
    }

    await checkBlockerCycle(ctx, bTicket.id, ticketId);

    addedBlockerIds.add(bTicket.id);

    await ctx.db.run(
      "INSERT INTO ticket_blockers (ticket_id, blocker_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
      ticketId,
      bTicket.id
    );

    await recordActivity(ctx, ticketId, actor, "blocker_added", {
      blockerKey: `${bProj.key}-${bTicket.number}`,
    });
  }
}
