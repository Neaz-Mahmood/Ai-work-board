import path from "node:path";
import type { Ctx } from "./context.ts";
import type { ColumnId, Project } from "@awb/shared/types.ts";
import { DomainError, validation, notFound, conflict } from "../server/errors.ts";

export function normalizeProjectPath(p: string): string {
  if (!p || typeof p !== "string" || !path.isAbsolute(p)) {
    throw validation("Project path must be absolute");
  }
  let norm = path.normalize(p);
  while (norm.length > 1 && norm.endsWith("/")) {
    norm = norm.slice(0, -1);
  }
  return norm;
}

export function deriveKey(folderName: string, existingKeys: Set<string>): string {
  const separated = folderName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const rawParts = separated.split(/[-_\s.]+/);
  const letterParts = rawParts.filter((part) => /[a-zA-Z]/.test(part));
  let base = letterParts
    .map((part) => {
      const m = part.match(/[a-zA-Z]/);
      return m ? m[0].toUpperCase() : "";
    })
    .join("");

  if (base.length < 2) {
    const allLetters = (folderName.match(/[a-zA-Z]/g) || []).join("").toUpperCase();
    base = allLetters.slice(0, 3);
  }

  if (base.length < 2) {
    base = "PRJ";
  }

  base = base.slice(0, 5);

  if (!existingKeys.has(base)) {
    return base;
  }

  for (let i = 2; ; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, 5 - suffix.length) + suffix;
    if (!existingKeys.has(candidate)) {
      return candidate;
    }
  }
}

export async function createProject(
  ctx: Ctx,
  input: { path: string; name?: string; key?: string },
  actor: string = "agent"
): Promise<Project> {
  const normPath = normalizeProjectPath(input.path);

  const existingByPath = await ctx.db.get<{ key: string }>(
    "SELECT key FROM projects WHERE path = ?",
    normPath
  );
  if (existingByPath) {
    throw conflict(`Path already registered as ${existingByPath.key}`);
  }

  let projectName = path.basename(normPath);
  if (input.name !== undefined) {
    if (typeof input.name !== "string") {
      throw validation("Name must be a string");
    }
    const trimmed = input.name.trim();
    if (trimmed.length === 0 || trimmed.length > 100) {
      throw validation("Project name must be between 1 and 100 characters");
    }
    projectName = trimmed;
  }

  let projectKey: string;
  if (input.key !== undefined) {
    if (typeof input.key !== "string") {
      throw validation("Key must be a string");
    }
    const uppercased = input.key.toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(uppercased)) {
      throw validation("Project key must be 2 to 5 uppercase letters");
    }
    const existingByKey = await ctx.db.get<{ id: number }>(
      "SELECT id FROM projects WHERE key = ?",
      uppercased
    );
    if (existingByKey) {
      throw conflict(`Project key ${uppercased} is already in use`);
    }
    projectKey = uppercased;
  } else {
    const rows = await ctx.db.all<{ key: string }>("SELECT key FROM projects");
    const existingKeys = new Set(rows.map((r) => r.key));
    projectKey = deriveKey(path.basename(normPath), existingKeys);
  }

  const now = ctx.clock.now().toISOString();
  await ctx.db.tx(async () => {
    await ctx.db.run(
      "INSERT INTO projects (key, name, path, next_ticket_number, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      projectKey,
      projectName,
      normPath,
      now,
      now
    );
  });

  const project: Project = {
    key: projectKey,
    name: projectName,
    path: normPath,
    createdAt: now,
    updatedAt: now,
  };

  ctx.events.emit({
    type: "project.created",
    projectKey: project.key,
    actor,
    at: ctx.clock.now().toISOString(),
  });

  return project;
}

export async function listProjects(ctx: Ctx): Promise<Project[]> {
  const rows = await ctx.db.all<{
    id: number;
    key: string;
    name: string;
    path: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, key, name, path, created_at, updated_at FROM projects ORDER BY name ASC");

  const countRows = await ctx.db.all<{
    project_id: number;
    column_id: string;
    count: number | string;
  }>("SELECT project_id, column_id, COUNT(*)::int as count FROM tickets GROUP BY project_id, column_id");

  const countsMap = new Map<number, Record<ColumnId, number>>();
  for (const r of countRows) {
    let c = countsMap.get(r.project_id);
    if (!c) {
      c = { backlog: 0, todo: 0, in_progress: 0, in_review: 0, done: 0 };
      countsMap.set(r.project_id, c);
    }
    if (r.column_id in c) {
      c[r.column_id as ColumnId] = Number(r.count);
    }
  }

  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    path: r.path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    counts: countsMap.get(r.id) ?? {
      backlog: 0,
      todo: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
    },
  }));
}

export async function getProject(ctx: Ctx, key: string): Promise<Project> {
  const row = await ctx.db.get<{
    id: number;
    key: string;
    name: string;
    path: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, key, name, path, created_at, updated_at FROM projects WHERE key = ?", key.toUpperCase());

  if (!row) {
    throw notFound(`Project ${key} not found`);
  }

  const countRows = await ctx.db.all<{ column_id: string; count: number | string }>(
    "SELECT column_id, COUNT(*)::int as count FROM tickets WHERE project_id = ? GROUP BY column_id",
    row.id
  );

  const counts: Record<ColumnId, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  };
  for (const r of countRows) {
    if (r.column_id in counts) {
      counts[r.column_id as ColumnId] = Number(r.count);
    }
  }

  return {
    key: row.key,
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    counts,
  };
}

export async function renameProject(
  ctx: Ctx,
  key: string,
  name: string,
  actor: string = "agent"
): Promise<Project> {
  if (typeof name !== "string") {
    throw validation("Name must be a string");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw validation("Project name must be between 1 and 100 characters");
  }
  const project = await getProject(ctx, key);
  const now = ctx.clock.now().toISOString();
  await ctx.db.tx(async () => {
    await ctx.db.run(
      "UPDATE projects SET name = ?, updated_at = ? WHERE key = ?",
      trimmed,
      now,
      project.key
    );
  });

  const updated: Project = {
    ...project,
    name: trimmed,
    updatedAt: now,
  };

  ctx.events.emit({
    type: "project.updated",
    projectKey: updated.key,
    actor,
    at: ctx.clock.now().toISOString(),
  });

  return updated;
}

export async function deleteProject(
  ctx: Ctx,
  key: string,
  actor: string = "agent"
): Promise<void> {
  const project = await getProject(ctx, key);
  await ctx.db.tx(async () => {
    await ctx.db.run("DELETE FROM projects WHERE key = ?", project.key);
  });

  ctx.events.emit({
    type: "project.deleted",
    projectKey: project.key,
    actor,
    at: ctx.clock.now().toISOString(),
  });
}

export async function resolveProject(
  ctx: Ctx,
  params: { key?: string; cwd?: string }
): Promise<Project> {
  if (params.key) {
    return await getProject(ctx, params.key);
  }

  if (!params.cwd) {
    throw validation("Either key or cwd is required to resolve project");
  }

  const normalizedCwd = normalizeProjectPath(params.cwd);

  const projects = await listProjects(ctx);
  const matching = projects.filter((p) => {
    return (
      p.path === normalizedCwd ||
      (p.path === "/" ? normalizedCwd.startsWith("/") : normalizedCwd.startsWith(p.path + "/"))
    );
  });

  if (matching.length === 0) {
    throw new DomainError(
      "NO_PROJECT",
      `No project registered for ${params.cwd}. Run \`awb init\` in the repository root.`,
      404
    );
  }

  matching.sort((a, b) => b.path.length - a.path.length);
  return matching[0];
}
