import type { Ctx } from "./context.ts";
import type {
  Card,
  ColumnId,
  Feature,
  FeatureWithTickets,
  Priority,
  Ticket,
} from "../shared/types.ts";
import { conflict, notFound, validation } from "../server/errors.ts";
import { touchActor } from "./actors.ts";
import { recordActivity } from "./activity.ts";
import { createTicketTx, listTickets } from "./tickets.ts";

export const FEATURE_PALETTE = [
  "#0C66E4",
  "#1F845A",
  "#E2B203",
  "#C9372C",
  "#6E5DC6",
  "#227D9B",
  "#E56910",
  "#AE4787",
];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export type NewFeatureTicket = {
  title: string;
  description?: string;
  priority?: Priority;
  column?: ColumnId;
  blockedBy?: string[];
  blockedByIndexes?: number[];
  assignee?: string | null;
};

export type CreateFeatureInput = {
  name: string;
  description?: string;
  color?: string;
  tickets?: NewFeatureTicket[];
};

export type UpdateFeaturePatch = {
  name?: string;
  description?: string;
  color?: string;
};

export function createFeature(
  ctx: Ctx,
  actor: string,
  projectKey: string,
  input: CreateFeatureInput
): { feature: Feature; tickets: Ticket[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validation("Input must be an object");
  }

  if (typeof input.name !== "string") {
    throw validation("Name must be a string");
  }
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 100) {
    throw validation("Name must be between 1 and 100 characters");
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

  if (input.color !== undefined) {
    if (typeof input.color !== "string" || !HEX_COLOR_REGEX.test(input.color)) {
      throw validation("Color must be a 6-character hex code starting with #");
    }
  }

  if (input.tickets !== undefined) {
    if (!Array.isArray(input.tickets)) {
      throw validation("tickets must be an array");
    }
    for (let i = 0; i < input.tickets.length; i++) {
      const t = input.tickets[i];
      if (!t || typeof t !== "object" || Array.isArray(t)) {
        throw validation(`Ticket at index ${i} must be an object`);
      }
      if (typeof t.title !== "string") {
        throw validation(`Title must be a string for ticket at index ${i}`);
      }
      const tTrimmed = t.title.trim();
      if (tTrimmed.length === 0 || tTrimmed.length > 200) {
        throw validation(
          `Title must be between 1 and 200 characters for ticket at index ${i}`
        );
      }
      if (t.blockedByIndexes !== undefined) {
        if (!Array.isArray(t.blockedByIndexes)) {
          throw validation("blockedByIndexes must refer to earlier tickets");
        }
        for (const idx of t.blockedByIndexes) {
          if (
            typeof idx !== "number" ||
            !Number.isInteger(idx) ||
            idx < 0 ||
            idx >= i
          ) {
            throw validation("blockedByIndexes must refer to earlier tickets");
          }
        }
      }
    }
  }

  let featureResult: Feature;
  const createdTickets: Ticket[] = [];

  ctx.db.tx(() => {
    const project = ctx.db.get<{ id: number; key: string }>(
      "SELECT id, key FROM projects WHERE UPPER(key) = UPPER(?)",
      projectKey
    );
    if (!project) {
      throw notFound(`Project ${projectKey} not found`);
    }

    const existing = ctx.db.get<{ id: number }>(
      "SELECT id FROM features WHERE project_id = ? AND name_lower = ?",
      project.id,
      trimmedName.toLowerCase()
    );
    if (existing) {
      throw conflict(`A feature named ${trimmedName} already exists`);
    }

    touchActor(ctx, actor);

    let color = input.color;
    if (!color) {
      const countRow = ctx.db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM features WHERE project_id = ?",
        project.id
      );
      const count = countRow?.count ?? 0;
      color = FEATURE_PALETTE[count % FEATURE_PALETTE.length];
    }

    const now = ctx.clock.now().toISOString();
    const insertResult = ctx.db.run(
      `INSERT INTO features (
        project_id, name, name_lower, description, color, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      project.id,
      trimmedName,
      trimmedName.toLowerCase(),
      description,
      color,
      now,
      now
    );

    const featureId = insertResult.lastInsertRowid;

    if (input.tickets && input.tickets.length > 0) {
      for (let i = 0; i < input.tickets.length; i++) {
        const tInput = input.tickets[i];
        const indexBlockers = (tInput.blockedByIndexes ?? []).map(
          (idx) => createdTickets[idx].key
        );
        const combinedBlockedBy = [
          ...(tInput.blockedBy ?? []),
          ...indexBlockers,
        ];

        const created = createTicketTx(ctx, actor, project.key, {
          title: tInput.title,
          description: tInput.description,
          column: tInput.column,
          priority: tInput.priority,
          assignee: tInput.assignee,
          featureId,
          blockedBy: combinedBlockedBy.length > 0 ? combinedBlockedBy : undefined,
        });
        createdTickets.push(created);
      }
    }

    const doneCount = createdTickets.filter((t) => t.column === "done").length;
    featureResult = {
      id: featureId,
      projectKey: project.key,
      name: trimmedName,
      description,
      color,
      progress: {
        done: doneCount,
        total: createdTickets.length,
      },
      createdAt: now,
      updatedAt: now,
    };
  });

  const emitNow = ctx.clock.now().toISOString();
  ctx.events.emit({
    type: "feature.created",
    projectKey: featureResult!.projectKey,
    featureId: featureResult!.id,
    actor,
    at: emitNow,
  });

  for (const t of createdTickets) {
    ctx.events.emit({
      type: "ticket.created",
      projectKey: t.projectKey,
      ticketKey: t.key,
      actor,
      at: emitNow,
    });
  }

  return {
    feature: featureResult!,
    tickets: createdTickets,
  };
}

export function listFeatures(ctx: Ctx, projectKey: string): Feature[] {
  const project = ctx.db.get<{ id: number; key: string }>(
    "SELECT id, key FROM projects WHERE UPPER(key) = UPPER(?)",
    projectKey
  );
  if (!project) {
    throw notFound(`Project ${projectKey} not found`);
  }

  const rows = ctx.db.all<{
    id: number;
    name: string;
    description: string;
    color: string;
    created_at: string;
    updated_at: string;
    total: number;
    done: number | null;
  }>(
    `SELECT
      f.id,
      f.name,
      f.description,
      f.color,
      f.created_at,
      f.updated_at,
      COUNT(t.id) as total,
      SUM(CASE WHEN t.column_id = 'done' THEN 1 ELSE 0 END) as done
    FROM features f
    LEFT JOIN tickets t ON t.feature_id = f.id
    WHERE f.project_id = ?
    GROUP BY f.id
    ORDER BY f.id ASC`,
    project.id
  );

  return rows.map((r) => ({
    id: r.id,
    projectKey: project.key,
    name: r.name,
    description: r.description,
    color: r.color,
    progress: {
      done: r.done ?? 0,
      total: r.total ?? 0,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getFeature(ctx: Ctx, id: number): FeatureWithTickets {
  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw notFound(`Feature ${id} not found`);
  }

  const feat = ctx.db.get<{
    id: number;
    project_id: number;
    name: string;
    description: string;
    color: string;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM features WHERE id = ?", id);

  if (!feat) {
    throw notFound(`Feature ${id} not found`);
  }

  const project = ctx.db.get<{ key: string }>(
    "SELECT key FROM projects WHERE id = ?",
    feat.project_id
  );
  if (!project) {
    throw notFound(`Feature ${id} not found`);
  }

  const cards = listTickets(ctx, project.key, { feature: feat.id });

  const doneCount = cards.filter((c) => c.column === "done").length;
  const totalCount = cards.length;

  return {
    id: feat.id,
    projectKey: project.key,
    name: feat.name,
    description: feat.description,
    color: feat.color,
    progress: {
      done: doneCount,
      total: totalCount,
    },
    createdAt: feat.created_at,
    updatedAt: feat.updated_at,
    tickets: cards,
  };
}

export function updateFeature(
  ctx: Ctx,
  actor: string,
  id: number,
  patch: UpdateFeaturePatch
): Feature {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw validation("Input must be an object");
  }

  const ALLOWED_FIELDS = new Set(["name", "description", "color"]);
  for (const key of Object.keys(patch)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw validation(`Unknown field: ${key}`);
    }
  }

  let trimmedName: string | undefined = undefined;
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string") {
      throw validation("Name must be a string");
    }
    trimmedName = patch.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 100) {
      throw validation("Name must be between 1 and 100 characters");
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

  if (patch.color !== undefined) {
    if (
      typeof patch.color !== "string" ||
      !HEX_COLOR_REGEX.test(patch.color)
    ) {
      throw validation("Color must be a 6-character hex code starting with #");
    }
  }

  let projectKey = "";
  let changed = false;

  const feature = ctx.db.tx(() => {
    const existing = ctx.db.get<{
      id: number;
      project_id: number;
      name: string;
      description: string;
      color: string;
      created_at: string;
      updated_at: string;
    }>("SELECT * FROM features WHERE id = ?", id);

    if (!existing) {
      throw notFound(`Feature ${id} not found`);
    }

    const project = ctx.db.get<{ key: string }>(
      "SELECT key FROM projects WHERE id = ?",
      existing.project_id
    );
    projectKey = project?.key ?? "";

    if (
      trimmedName !== undefined &&
      trimmedName.toLowerCase() !== existing.name.toLowerCase()
    ) {
      const conflictFeature = ctx.db.get<{ id: number }>(
        "SELECT id FROM features WHERE project_id = ? AND name_lower = ? AND id != ?",
        existing.project_id,
        trimmedName.toLowerCase(),
        existing.id
      );
      if (conflictFeature) {
        throw conflict(`A feature named ${trimmedName} already exists`);
      }
    }

    touchActor(ctx, actor);

    const newName = trimmedName !== undefined ? trimmedName : existing.name;
    const newDescription =
      patch.description !== undefined ? patch.description : existing.description;
    const newColor = patch.color !== undefined ? patch.color : existing.color;

    if (
      newName !== existing.name ||
      newDescription !== existing.description ||
      newColor !== existing.color
    ) {
      changed = true;
      const now = ctx.clock.now().toISOString();
      ctx.db.run(
        `UPDATE features SET
          name = ?,
          name_lower = ?,
          description = ?,
          color = ?,
          updated_at = ?
        WHERE id = ?`,
        newName,
        newName.toLowerCase(),
        newDescription,
        newColor,
        now,
        existing.id
      );
    }

    const featWithTickets = getFeature(ctx, existing.id);
    const { tickets: _t, ...featOnly } = featWithTickets;
    return featOnly;
  });

  if (changed) {
    ctx.events.emit({
      type: "feature.updated",
      projectKey,
      featureId: feature.id,
      actor,
      at: ctx.clock.now().toISOString(),
    });
  }

  return feature;
}

export function deleteFeature(ctx: Ctx, actor: string, id: number): void {
  touchActor(ctx, actor);
  let projectKey = "";

  ctx.db.tx(() => {
    const feature = ctx.db.get<{
      id: number;
      project_id: number;
      name: string;
    }>("SELECT id, project_id, name FROM features WHERE id = ?", id);

    if (!feature) {
      throw notFound(`Feature ${id} not found`);
    }

    const project = ctx.db.get<{ key: string }>(
      "SELECT key FROM projects WHERE id = ?",
      feature.project_id
    );
    projectKey = project?.key ?? "";

    const linkedTickets = ctx.db.all<{ id: number }>(
      "SELECT id FROM tickets WHERE feature_id = ? ORDER BY id ASC",
      feature.id
    );

    const now = ctx.clock.now().toISOString();
    for (const t of linkedTickets) {
      recordActivity(ctx, t.id, actor, "updated", {
        field: "feature",
        from: feature.name,
        to: null,
      });
      ctx.db.run("UPDATE tickets SET updated_at = ? WHERE id = ?", now, t.id);
    }

    ctx.db.run("DELETE FROM features WHERE id = ?", feature.id);
  });

  ctx.events.emit({
    type: "feature.deleted",
    projectKey,
    featureId: id,
    actor,
    at: ctx.clock.now().toISOString(),
  });
}
