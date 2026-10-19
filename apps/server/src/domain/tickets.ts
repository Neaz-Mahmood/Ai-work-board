import type { Ctx } from "./context.ts";
import type {
  Board,
  Card,
  ColumnId,
  Priority,
  Ticket,
  TicketLink,
} from "@awb/shared/types.ts";
import { COLUMNS } from "@awb/shared/columns.ts";
import { notFound, validation } from "../server/errors.ts";
import { ACTOR_NAME, listActors, touchActor } from "./actors.ts";
import { listActivity, recordActivity } from "./activity.ts";
import { listComments } from "./comments.ts";
import { getProject } from "./projects.ts";
import { attachBlockersOnCreate } from "./blockers.ts";
import { listFeatures } from "./features.ts";

const VALID_PRIORITIES: Priority[] = [
  "highest",
  "high",
  "medium",
  "low",
  "lowest",
];

export type CreateTicketInput = {
  title: string;
  description?: string;
  column?: ColumnId;
  priority?: Priority;
  assignee?: string | null;
  blockedBy?: string[];
  featureId?: number | null;
};

export type ListTicketsFilters = {
  column?: ColumnId;
  assignee?: string | string[];
  q?: string;
  feature?: number | string | (number | string)[];
  featureId?: number;
};

export async function createTicketTx(
  ctx: Ctx,
  actor: string,
  projectKey: string,
  input: CreateTicketInput
): Promise<Ticket> {
  if (!input || typeof input !== "object") {
    throw validation("Input must be an object");
  }

  if (typeof input.title !== "string") {
    throw validation("Title must be a string");
  }
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length === 0 || trimmedTitle.length > 200) {
    throw validation("Title must be between 1 and 200 characters");
  }

  let description = "";
  if (input.description !== undefined) {
    if (typeof input.description !== "string") {
      throw validation("Description must be a string");
    }
    if (input.description.length > 50000) {
      throw validation("Description must not exceed 50,000 characters");
    }
    description = input.description;
  }

  let column: ColumnId = "backlog";
  if (input.column !== undefined) {
    if (!COLUMNS.some((c) => c.id === input.column)) {
      throw validation(`Invalid column: ${input.column}`);
    }
    column = input.column;
  }

  let priority: Priority = "medium";
  if (input.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(input.priority)) {
      throw validation(`Invalid priority: ${input.priority}`);
    }
    priority = input.priority;
  }

  let assignee: string | null = null;
  if (input.assignee !== undefined && input.assignee !== null) {
    if (typeof input.assignee !== "string") {
      throw validation("Assignee must be a string");
    }
    const trimmedAssignee = input.assignee.trim();
    if (trimmedAssignee.length > 0) {
      if (!ACTOR_NAME.test(trimmedAssignee)) {
        throw validation(
          `Invalid actor name "${trimmedAssignee}". Actor names must be 1 to 40 characters matching ${ACTOR_NAME}.`
        );
      }
      assignee = trimmedAssignee;
    }
  }

  if (input.blockedBy !== undefined) {
    if (!Array.isArray(input.blockedBy)) {
      throw validation("blockedBy must be an array of ticket keys");
    }
    for (const bKey of input.blockedBy) {
      if (typeof bKey !== "string" || bKey.trim().length === 0) {
        throw validation("blockedBy must contain valid ticket keys");
      }
    }
  }

  let featureId: number | null = null;
  if (input.featureId !== undefined && input.featureId !== null) {
    if (typeof input.featureId !== "number" || !Number.isInteger(input.featureId)) {
      throw validation("featureId must be an integer");
    }
    featureId = input.featureId;
  }

  const project = await ctx.db.get<{
    id: number;
    key: string;
    next_ticket_number: number;
  }>(
    "SELECT id, key, next_ticket_number FROM projects WHERE lower(key) = lower(?)",
    projectKey
  );
  if (!project) {
    throw notFound(`Project ${projectKey} not found`);
  }

  if (featureId !== null) {
    const feat = await ctx.db.get<{ id: number }>(
      "SELECT id FROM features WHERE id = ? AND project_id = ?",
      featureId,
      project.id
    );
    if (!feat) {
      throw validation("Feature must belong to the same project");
    }
  }

  const number = project.next_ticket_number;
  const now = ctx.clock.now().toISOString();

  await ctx.db.run(
    "UPDATE projects SET next_ticket_number = next_ticket_number + 1, updated_at = ? WHERE id = ?",
    now,
    project.id
  );

  const countRow = await ctx.db.get<{ count: number | string }>(
    "SELECT COUNT(*)::int as count FROM tickets WHERE project_id = ? AND column_id = ?",
    project.id,
    column
  );
  const rank = countRow ? Number(countRow.count) : 0;

  await touchActor(ctx, actor);
  if (assignee) {
    await touchActor(ctx, assignee);
  }

  const insertResult = await ctx.db.get<{ id: number }>(
    `INSERT INTO tickets (
      project_id, number, title, description, column_id, rank, priority, assignee, attention_reason, feature_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?) RETURNING id`,
    project.id,
    number,
    trimmedTitle,
    description,
    column,
    rank,
    priority,
    assignee,
    featureId,
    now,
    now
  );
  const ticketId = Number(insertResult!.id);

  await recordActivity(
    ctx,
    ticketId,
    actor,
    "created",
    { column }
  );

  const ticketKey = `${project.key}-${number}`;

  if (input.blockedBy && input.blockedBy.length > 0) {
    await attachBlockersOnCreate(
      ctx,
      actor,
      ticketId,
      project.id,
      project.key,
      number,
      input.blockedBy
    );
  }

  return await getTicket(ctx, ticketKey);
}

export async function createTicket(
  ctx: Ctx,
  actor: string,
  projectKey: string,
  input: CreateTicketInput
): Promise<Ticket> {
  const ticket = await ctx.db.tx(async () => {
    return await createTicketTx(ctx, actor, projectKey, input);
  });

  ctx.events.emit({
    type: "ticket.created",
    projectKey: ticket.projectKey,
    ticketKey: ticket.key,
    actor,
    at: ctx.clock.now().toISOString(),
  });

  return ticket;
}

export function parseTicketKey(ticketKey: string): { projectKey: string; ticketNumber: number } {
  if (typeof ticketKey !== "string") {
    throw notFound(`Ticket ${ticketKey} not found`);
  }
  const match = ticketKey.trim().match(/^([A-Za-z0-9]+)-(\d+)$/);
  if (!match) {
    throw notFound(`Ticket ${ticketKey} not found`);
  }
  return {
    projectKey: match[1],
    ticketNumber: parseInt(match[2], 10),
  };
}

export async function getTicket(ctx: Ctx, ticketKey: string): Promise<Ticket> {
  const { projectKey, ticketNumber } = parseTicketKey(ticketKey);

  const project = await ctx.db.get<{ id: number; key: string }>(
    "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
    projectKey
  );
  if (!project) {
    throw notFound(`Ticket ${ticketKey} not found`);
  }

  const row = await ctx.db.get<{
    id: number;
    project_id: number;
    number: number;
    title: string;
    description: string;
    column_id: ColumnId;
    rank: number;
    priority: Priority;
    assignee: string | null;
    attention_reason: string | null;
    feature_id_val: number | null;
    feature_name: string | null;
    feature_color: string | null;
    created_at: string;
    updated_at: string;
    blocked: number | boolean;
  }>(
    `SELECT
      t.*,
      f.id AS feature_id_val,
      f.name AS feature_name,
      f.color AS feature_color,
      EXISTS (
        SELECT 1
        FROM ticket_blockers tb
        JOIN tickets b ON tb.blocker_id = b.id
        WHERE tb.ticket_id = t.id AND b.column_id <> 'done'
      ) AS blocked
    FROM tickets t
    LEFT JOIN features f ON t.feature_id = f.id
    WHERE t.project_id = ? AND t.number = ?`,
    project.id,
    ticketNumber
  );

  if (!row) {
    throw notFound(`Ticket ${ticketKey} not found`);
  }

  const blockers = await ctx.db.all<TicketLink>(
    `SELECT
      p.key || '-' || b.number::text AS key,
      b.title,
      b.column_id AS column
    FROM ticket_blockers tb
    JOIN tickets b ON tb.blocker_id = b.id
    JOIN projects p ON b.project_id = p.id
    WHERE tb.ticket_id = ?
    ORDER BY b.number ASC`,
    row.id
  );

  const blocks = await ctx.db.all<TicketLink>(
    `SELECT
      p.key || '-' || t.number::text AS key,
      t.title,
      t.column_id AS column
    FROM ticket_blockers tb
    JOIN tickets t ON tb.ticket_id = t.id
    JOIN projects p ON t.project_id = p.id
    WHERE tb.blocker_id = ?
    ORDER BY t.number ASC`,
    row.id
  );

  const activity = await listActivity(ctx, row.id);
  const comments = await listComments(ctx, row.id);

  return {
    key: `${project.key}-${row.number}`,
    title: row.title,
    column: row.column_id,
    rank: row.rank,
    priority: row.priority,
    feature:
      row.feature_id_val != null
        ? {
            id: row.feature_id_val,
            name: row.feature_name!,
            color: row.feature_color!,
          }
        : null,
    assignee: row.assignee ?? null,
    blocked: row.blocked === true || row.blocked === 1,
    needsAttention: row.attention_reason ?? null,
    projectKey: project.key,
    number: row.number,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    blockers,
    blocks,
    comments,
    activity,
  };
}

export type UpdateTicketPatch = {
  title?: string;
  description?: string;
  priority?: Priority;
  assignee?: string | null;
  featureId?: number | null;
  [key: string]: unknown;
};

export async function updateTicket(
  ctx: Ctx,
  actor: string,
  ticketKey: string,
  patch: UpdateTicketPatch
): Promise<Ticket> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw validation("Input must be an object");
  }

  const ALLOWED_PATCH_FIELDS = new Set([
    "title",
    "description",
    "priority",
    "assignee",
    "featureId",
  ]);
  for (const key of Object.keys(patch)) {
    if (!ALLOWED_PATCH_FIELDS.has(key)) {
      throw validation(`Unknown field: ${key}`);
    }
  }

  let trimmedTitle: string | undefined = undefined;
  if (patch.title !== undefined) {
    if (typeof patch.title !== "string") {
      throw validation("Title must be a string");
    }
    trimmedTitle = patch.title.trim();
    if (trimmedTitle.length === 0 || trimmedTitle.length > 200) {
      throw validation("Title must be between 1 and 200 characters");
    }
  }

  if (patch.description !== undefined) {
    if (typeof patch.description !== "string") {
      throw validation("Description must be a string");
    }
    if (patch.description.length > 50000) {
      throw validation("Description must not exceed 50,000 characters");
    }
  }

  if (patch.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(patch.priority)) {
      throw validation(`Invalid priority: ${patch.priority}`);
    }
  }

  let newAssignee: string | null | undefined = undefined;
  if (patch.assignee !== undefined) {
    if (patch.assignee === null) {
      newAssignee = null;
    } else {
      if (typeof patch.assignee !== "string") {
        throw validation("Assignee must be a string or null");
      }
      const trimmedAssignee = patch.assignee.trim();
      if (trimmedAssignee.length === 0) {
        newAssignee = null;
      } else {
        if (!ACTOR_NAME.test(trimmedAssignee)) {
          throw validation(
            `Invalid actor name "${trimmedAssignee}". Actor names must be 1 to 40 characters matching ${ACTOR_NAME}.`
          );
        }
        newAssignee = trimmedAssignee;
      }
    }
  }

  let newFeatureId: number | null | undefined = undefined;
  if (patch.featureId !== undefined) {
    if (patch.featureId === null) {
      newFeatureId = null;
    } else {
      if (typeof patch.featureId !== "number" || !Number.isInteger(patch.featureId)) {
        throw validation("featureId must be an integer or null");
      }
      newFeatureId = patch.featureId;
    }
  }

  let changed = false;

  const ticket = await ctx.db.tx(async () => {
    const { projectKey, ticketNumber } = parseTicketKey(ticketKey);

    const project = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      projectKey
    );
    if (!project) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const row = await ctx.db.get<{
      id: number;
      project_id: number;
      number: number;
      title: string;
      description: string;
      column_id: ColumnId;
      rank: number;
      priority: Priority;
      assignee: string | null;
      attention_reason: string | null;
      feature_id: number | null;
      created_at: string;
      updated_at: string;
    }>(
      "SELECT * FROM tickets WHERE project_id = ? AND number = ?",
      project.id,
      ticketNumber
    );

    if (!row) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    if (newFeatureId !== undefined && newFeatureId !== null) {
      const feat = await ctx.db.get<{ id: number; name: string }>(
        "SELECT id, name FROM features WHERE id = ? AND project_id = ?",
        newFeatureId,
        project.id
      );
      if (!feat) {
        throw validation("Feature must belong to the same project");
      }
    }

    await touchActor(ctx, actor);

    if (trimmedTitle !== undefined && trimmedTitle !== row.title) {
      changed = true;
      await recordActivity(ctx, row.id, actor, "updated", {
        field: "title",
        from: row.title,
        to: trimmedTitle,
      });
    }

    if (patch.description !== undefined && patch.description !== row.description) {
      changed = true;
      await recordActivity(ctx, row.id, actor, "updated", {
        field: "description",
        from: row.description,
        to: patch.description,
      });
    }

    if (patch.priority !== undefined && patch.priority !== row.priority) {
      changed = true;
      await recordActivity(ctx, row.id, actor, "updated", {
        field: "priority",
        from: row.priority,
        to: patch.priority,
      });
    }

    const currentAssignee = row.assignee ?? null;
    if (newAssignee !== undefined && newAssignee !== currentAssignee) {
      changed = true;
      if (newAssignee !== null) {
        await touchActor(ctx, newAssignee);
      }
      await recordActivity(ctx, row.id, actor, "assigned", {
        from: currentAssignee,
        to: newAssignee,
      });
    }

    const currentFeatureId = row.feature_id ?? null;
    if (newFeatureId !== undefined && newFeatureId !== currentFeatureId) {
      changed = true;
      let currentFeatureName: string | null = null;
      if (currentFeatureId !== null) {
        const currentFeat = await ctx.db.get<{ name: string }>(
          "SELECT name FROM features WHERE id = ?",
          currentFeatureId
        );
        currentFeatureName = currentFeat?.name ?? null;
      }
      let newFeatureName: string | null = null;
      if (newFeatureId !== null) {
        const feat = await ctx.db.get<{ name: string }>(
          "SELECT name FROM features WHERE id = ?",
          newFeatureId
        );
        newFeatureName = feat?.name ?? null;
      }
      await recordActivity(ctx, row.id, actor, "updated", {
        field: "feature",
        from: currentFeatureName,
        to: newFeatureName,
      });
    }

    if (changed) {
      const now = ctx.clock.now().toISOString();
      const finalTitle = trimmedTitle !== undefined ? trimmedTitle : row.title;
      const finalDescription =
        patch.description !== undefined ? patch.description : row.description;
      const finalPriority =
        patch.priority !== undefined ? patch.priority : row.priority;
      const finalAssignee =
        newAssignee !== undefined ? newAssignee : row.assignee;
      const finalFeatureId =
        newFeatureId !== undefined ? newFeatureId : row.feature_id;

      await ctx.db.run(
        `UPDATE tickets SET
          title = ?,
          description = ?,
          priority = ?,
          assignee = ?,
          feature_id = ?,
          updated_at = ?
        WHERE id = ?`,
        finalTitle,
        finalDescription,
        finalPriority,
        finalAssignee,
        finalFeatureId,
        now,
        row.id
      );
    }

    return await getTicket(ctx, `${project.key}-${row.number}`);
  });

  if (changed) {
    ctx.events.emit({
      type: "ticket.updated",
      projectKey: ticket.projectKey,
      ticketKey: ticket.key,
      actor,
      at: ctx.clock.now().toISOString(),
    });
  }

  return ticket;
}

export async function compactColumnRanks(
  ctx: Ctx,
  projectId: number,
  columnId: ColumnId,
  excludeTicketId?: number
): Promise<void> {
  const sql =
    excludeTicketId !== undefined
      ? "SELECT id, rank FROM tickets WHERE project_id = ? AND column_id = ? AND id != ? ORDER BY rank ASC, id ASC"
      : "SELECT id, rank FROM tickets WHERE project_id = ? AND column_id = ? ORDER BY rank ASC, id ASC";
  const params =
    excludeTicketId !== undefined
      ? [projectId, columnId, excludeTicketId]
      : [projectId, columnId];
  const tickets = await ctx.db.all<{ id: number; rank: number }>(sql, ...params);
  for (let i = 0; i < tickets.length; i++) {
    if (tickets[i].rank !== i) {
      await ctx.db.run("UPDATE tickets SET rank = ? WHERE id = ?", i, tickets[i].id);
    }
  }
}

export async function insertTicketAtRank(
  ctx: Ctx,
  ticketId: number,
  projectId: number,
  targetColumn: ColumnId,
  position?: number | null,
  now?: string
): Promise<number> {
  const targetColTickets = await ctx.db.all<{ id: number; rank: number }>(
    "SELECT id, rank FROM tickets WHERE project_id = ? AND column_id = ? AND id != ? ORDER BY rank ASC, id ASC",
    projectId,
    targetColumn,
    ticketId
  );
  const count = targetColTickets.length;
  let targetPos: number;
  if (position === undefined || position === null) {
    targetPos = count; // missing -> bottom
  } else {
    targetPos = Math.max(0, Math.min(count, position));
  }

  const newTargetOrder = [
    ...targetColTickets.slice(0, targetPos),
    { id: ticketId, rank: -1 },
    ...targetColTickets.slice(targetPos),
  ];

  const updateTime = now ?? ctx.clock.now().toISOString();

  for (let i = 0; i < newTargetOrder.length; i++) {
    const t = newTargetOrder[i];
    if (t.id === ticketId) {
      await ctx.db.run(
        "UPDATE tickets SET column_id = ?, rank = ?, updated_at = ? WHERE id = ?",
        targetColumn,
        i,
        updateTime,
        t.id
      );
    } else if (t.rank !== i) {
      await ctx.db.run("UPDATE tickets SET rank = ? WHERE id = ?", i, t.id);
    }
  }

  return targetPos;
}

export type MoveTicketInput = {
  column: ColumnId;
  position?: number | null;
  [key: string]: unknown;
};

export async function moveTicket(
  ctx: Ctx,
  actor: string,
  ticketKey: string,
  input: MoveTicketInput
): Promise<Ticket> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validation("Input must be an object");
  }

  const ALLOWED_MOVE_FIELDS = new Set(["column", "position"]);
  for (const key of Object.keys(input)) {
    if (!ALLOWED_MOVE_FIELDS.has(key)) {
      throw validation(`Unknown field: ${key}`);
    }
  }

  if (!input.column) {
    throw validation("Column is required");
  }

  if (!COLUMNS.some((c) => c.id === input.column)) {
    throw validation(`Invalid column: ${input.column}`);
  }
  const targetColumn = input.column as ColumnId;

  if (input.position !== undefined && input.position !== null) {
    if (typeof input.position !== "number" || !Number.isInteger(input.position)) {
      throw validation("Position must be an integer");
    }
  }

  let changed = false;
  let blockedDependents: { project_key: string; number: number }[] = [];
  let oldColumnId: ColumnId | undefined;

  const ticket = await ctx.db.tx(async () => {
    const { projectKey, ticketNumber } = parseTicketKey(ticketKey);

    const project = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      projectKey
    );
    if (!project) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const row = await ctx.db.get<{
      id: number;
      project_id: number;
      number: number;
      title: string;
      description: string;
      column_id: ColumnId;
      rank: number;
      priority: Priority;
      assignee: string | null;
      attention_reason: string | null;
      created_at: string;
      updated_at: string;
    }>(
      "SELECT * FROM tickets WHERE project_id = ? AND number = ?",
      project.id,
      ticketNumber
    );

    if (!row) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    oldColumnId = row.column_id;
    blockedDependents = await ctx.db.all<{ project_key: string; number: number }>(
      `SELECT p.key as project_key, t.number
       FROM ticket_blockers tb
       JOIN tickets t ON tb.ticket_id = t.id
       JOIN projects p ON t.project_id = p.id
       WHERE tb.blocker_id = ?`,
      row.id
    );

    await touchActor(ctx, actor);

    const oldColumn = row.column_id;
    const oldRank = row.rank;

    if (oldColumn === targetColumn) {
      // Reorder within the same column
      const otherTickets = await ctx.db.all<{ id: number; rank: number }>(
        "SELECT id, rank FROM tickets WHERE project_id = ? AND column_id = ? AND id != ? ORDER BY rank ASC, id ASC",
        project.id,
        oldColumn,
        row.id
      );

      const count = otherTickets.length;
      let targetPos: number;
      if (input.position === undefined || input.position === null) {
        targetPos = count; // missing -> bottom
      } else {
        targetPos = Math.max(0, Math.min(count, input.position));
      }

      if (targetPos !== oldRank) {
        changed = true;
        const now = ctx.clock.now().toISOString();
        const newOrder = [
          ...otherTickets.slice(0, targetPos),
          { id: row.id, rank: oldRank },
          ...otherTickets.slice(targetPos),
        ];

        for (let i = 0; i < newOrder.length; i++) {
          const t = newOrder[i];
          if (t.id === row.id) {
            await ctx.db.run(
              "UPDATE tickets SET rank = ?, updated_at = ? WHERE id = ?",
              i,
              now,
              t.id
            );
          } else if (t.rank !== i) {
            await ctx.db.run("UPDATE tickets SET rank = ? WHERE id = ?", i, t.id);
          }
        }

        await recordActivity(ctx, row.id, actor, "reranked", {
          from: oldRank,
          to: targetPos,
        });
      } else {
        // No change -> no entry, no updated_at bump
        const newOrder = [
          ...otherTickets.slice(0, targetPos),
          { id: row.id, rank: oldRank },
          ...otherTickets.slice(targetPos),
        ];
        for (let i = 0; i < newOrder.length; i++) {
          const t = newOrder[i];
          if (t.id !== row.id && t.rank !== i) {
            await ctx.db.run("UPDATE tickets SET rank = ? WHERE id = ?", i, t.id);
          } else if (t.id === row.id && t.rank !== i) {
            await ctx.db.run("UPDATE tickets SET rank = ? WHERE id = ?", i, t.id);
          }
        }
      }
    } else {
      // Move to a different column
      changed = true;
      const now = ctx.clock.now().toISOString();

      await compactColumnRanks(ctx, project.id, oldColumn, row.id);
      await insertTicketAtRank(ctx, row.id, project.id, targetColumn, input.position, now);

      await recordActivity(ctx, row.id, actor, "moved", {
        from: oldColumn,
        to: targetColumn,
      });
    }

    return await getTicket(ctx, `${project.key}-${row.number}`);
  });

  if (changed) {
    ctx.events.emit({
      type: "ticket.moved",
      projectKey: ticket.projectKey,
      ticketKey: ticket.key,
      actor,
      at: ctx.clock.now().toISOString(),
    });

    if (oldColumnId !== targetColumn && (oldColumnId === "done" || targetColumn === "done")) {
      for (const dep of blockedDependents) {
        ctx.events.emit({
          type: "ticket.updated",
          projectKey: dep.project_key,
          ticketKey: `${dep.project_key}-${dep.number}`,
          actor,
          at: ctx.clock.now().toISOString(),
        });
      }
    }
  }

  return ticket;
}

export async function listTickets(
  ctx: Ctx,
  projectKey: string,
  filters: ListTicketsFilters = {}
): Promise<Card[]> {
  const project = await ctx.db.get<{ id: number; key: string }>(
    "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
    projectKey
  );
  if (!project) {
    throw notFound(`Project ${projectKey} not found`);
  }

  let sql = `
    SELECT
      t.id, t.number, t.title, t.column_id, t.rank, t.priority, t.assignee, t.attention_reason,
      f.id AS feature_id_val,
      f.name AS feature_name,
      f.color AS feature_color,
      EXISTS (
        SELECT 1
        FROM ticket_blockers tb
        JOIN tickets b ON tb.blocker_id = b.id
        WHERE tb.ticket_id = t.id AND b.column_id <> 'done'
      ) AS blocked
    FROM tickets t
    LEFT JOIN features f ON t.feature_id = f.id
    WHERE t.project_id = ?
  `;
  const params: (string | number)[] = [project.id];

  if (filters.column) {
    if (!COLUMNS.some((c) => c.id === filters.column)) {
      throw validation(`Invalid column: ${filters.column}`);
    }
    sql += " AND t.column_id = ?";
    params.push(filters.column);
  }

  if (filters.assignee !== undefined && filters.assignee !== null) {
    let assigneeParts: string[] = [];
    if (typeof filters.assignee === "string") {
      assigneeParts = filters.assignee
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (Array.isArray(filters.assignee)) {
      assigneeParts = filters.assignee
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0);
    }

    if (assigneeParts.length > 0) {
      const names: string[] = [];
      let hasNone = false;
      for (const part of assigneeParts) {
        if (part.toLowerCase() === "none") {
          hasNone = true;
        } else {
          names.push(part);
        }
      }

      if (names.length > 0 && hasNone) {
        const placeholders = names.map(() => "?").join(", ");
        sql += ` AND (t.assignee IN (${placeholders}) OR t.assignee IS NULL)`;
        params.push(...names);
      } else if (names.length > 0) {
        const placeholders = names.map(() => "?").join(", ");
        sql += ` AND t.assignee IN (${placeholders})`;
        params.push(...names);
      } else if (hasNone) {
        sql += " AND t.assignee IS NULL";
      }
    }
  }

  const featFilter = filters.feature !== undefined ? filters.feature : filters.featureId;
  if (featFilter !== undefined && featFilter !== null) {
    let featureParts: (string | number)[] = [];
    if (typeof featFilter === "number") {
      featureParts = [featFilter];
    } else if (typeof featFilter === "string") {
      featureParts = featFilter
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (Array.isArray(featFilter)) {
      featureParts = featFilter;
    }

    if (featureParts.length > 0) {
      const ids: number[] = [];
      let hasNone = false;
      for (const part of featureParts) {
        if (typeof part === "number") {
          ids.push(part);
        } else {
          const str = String(part).trim();
          if (str.toLowerCase() === "none") {
            hasNone = true;
          } else {
            const parsed = Number(str);
            if (!Number.isInteger(parsed) || parsed <= 0 || !/^\d+$/.test(str)) {
              throw validation(`Invalid feature: ${str}`);
            }
            ids.push(parsed);
          }
        }
      }

      if (ids.length > 0 && hasNone) {
        const placeholders = ids.map(() => "?").join(", ");
        sql += ` AND (t.feature_id IN (${placeholders}) OR t.feature_id IS NULL)`;
        params.push(...ids);
      } else if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(", ");
        sql += ` AND t.feature_id IN (${placeholders})`;
        params.push(...ids);
      } else if (hasNone) {
        sql += " AND t.feature_id IS NULL";
      }
    }
  }

  if (filters.q && filters.q.trim().length > 0) {
    const q = filters.q.trim();
    sql += ` AND (
      (? || '-' || t.number::text) ILIKE '%' || ? || '%' OR
      t.title ILIKE '%' || ? || '%' OR
      COALESCE(t.description, '') ILIKE '%' || ? || '%'
    )`;
    params.push(project.key, q, q, q);
  }

  sql += `
    ORDER BY
      CASE t.column_id
        WHEN 'backlog' THEN 0
        WHEN 'todo' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'in_review' THEN 3
        WHEN 'done' THEN 4
        ELSE 5
      END ASC,
      t.rank ASC
  `;

  const rows = await ctx.db.all<{
    id: number;
    number: number;
    title: string;
    column_id: ColumnId;
    rank: number;
    priority: Priority;
    assignee: string | null;
    attention_reason: string | null;
    feature_id_val: number | null;
    feature_name: string | null;
    feature_color: string | null;
    blocked: number | boolean;
  }>(sql, ...params);

  return rows.map((r) => ({
    key: `${project.key}-${r.number}`,
    title: r.title,
    column: r.column_id,
    rank: r.rank,
    priority: r.priority,
    feature:
      r.feature_id_val != null
        ? {
            id: r.feature_id_val,
            name: r.feature_name!,
            color: r.feature_color!,
          }
        : null,
    assignee: r.assignee ?? null,
    blocked: r.blocked === true || r.blocked === 1,
    needsAttention: r.attention_reason ?? null,
  }));
}

export async function getBoard(
  ctx: Ctx,
  projectKey: string,
  filters?: ListTicketsFilters
): Promise<Board> {
  const project = await getProject(ctx, projectKey);
  const cards = await listTickets(ctx, projectKey, filters);
  const actors = await listActors(ctx);
  const features = await listFeatures(ctx, projectKey);

  const columns = COLUMNS.map((col) => ({
    id: col.id,
    name: col.name,
    tickets: cards.filter((c) => c.column === col.id),
  }));

  const counts: Record<ColumnId, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  };
  for (const col of columns) {
    counts[col.id] = col.tickets.length;
  }

  return {
    project: {
      ...project,
      counts,
    },
    columns,
    features,
    actors,
  };
}

export async function deleteTicket(ctx: Ctx, actor: string, ticketKey: string): Promise<void> {
  const { projectKey, ticketNumber } = parseTicketKey(ticketKey);

  let canonicalKey = "";
  let canonicalProjectKey = "";

  const blockedDependents = await ctx.db.tx(async () => {
    const project = await ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE lower(key) = lower(?)",
      projectKey
    );
    if (!project) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    const row = await ctx.db.get<{
      id: number;
      project_id: number;
      number: number;
      column_id: ColumnId;
      rank: number;
    }>(
      "SELECT id, project_id, number, column_id, rank FROM tickets WHERE project_id = ? AND number = ?",
      project.id,
      ticketNumber
    );

    if (!row) {
      throw notFound(`Ticket ${ticketKey} not found`);
    }

    canonicalKey = `${project.key}-${row.number}`;
    canonicalProjectKey = project.key;

    const blockedDependents = await ctx.db.all<{ project_key: string; number: number }>(
      `SELECT p.key as project_key, t.number
       FROM ticket_blockers tb
       JOIN tickets t ON tb.ticket_id = t.id
       JOIN projects p ON t.project_id = p.id
       WHERE tb.blocker_id = ?`,
      row.id
    );

    await touchActor(ctx, actor);

    await ctx.db.run("DELETE FROM activity WHERE ticket_id = ?", row.id);
    await ctx.db.run("DELETE FROM comments WHERE ticket_id = ?", row.id);
    await ctx.db.run("DELETE FROM tickets WHERE id = ?", row.id);

    await compactColumnRanks(ctx, project.id, row.column_id);

    return blockedDependents;
  });

  ctx.events.emit({
    type: "ticket.deleted",
    projectKey: canonicalProjectKey,
    ticketKey: canonicalKey,
    actor,
    at: ctx.clock.now().toISOString(),
  });

  for (const dep of blockedDependents) {
    ctx.events.emit({
      type: "ticket.updated",
      projectKey: dep.project_key,
      ticketKey: `${dep.project_key}-${dep.number}`,
      actor,
      at: ctx.clock.now().toISOString(),
    });
  }
}
