import type { Ctx } from "./context.ts";
import type { Actor } from "@awb/shared/types.ts";
import { validation } from "../server/errors.ts";

export const ACTOR_NAME = /^[A-Za-z0-9._-]{1,40}$/;

export const ACTOR_PALETTE: readonly string[] = [
  "#0052CC", // Blue (reserved for "you")
  "#00875A", // Green
  "#DE350B", // Red
  "#FF991F", // Orange / Amber
  "#5243AA", // Purple
  "#00A3BF", // Teal
  "#403294", // Indigo
  "#00B8D9", // Cyan
  "#42526E", // Charcoal
  "#E56910", // Rust
];

export function actorColor(name: string): string {
  if (name.toLowerCase() === "you") {
    return "#0052CC";
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return ACTOR_PALETTE[hash % ACTOR_PALETTE.length];
}

export async function touchActor(ctx: Ctx, name: string): Promise<Actor> {
  if (typeof name !== "string") {
    throw validation("Actor name must be a string");
  }
  const trimmed = name.trim();
  if (!ACTOR_NAME.test(trimmed)) {
    throw validation(
      `Invalid actor name "${name}". Actor names must be 1 to 40 characters matching ${ACTOR_NAME}.`
    );
  }

  const existing = await ctx.db.get<{ name: string; color: string }>(
    "SELECT name, color FROM actors WHERE name = ?",
    trimmed
  );
  if (existing) {
    return { name: existing.name, color: existing.color };
  }

  const color = actorColor(trimmed);
  const now = ctx.clock.now().toISOString();
  await ctx.db.run(
    "INSERT INTO actors (name, color, first_seen_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    trimmed,
    color,
    now
  );

  return { name: trimmed, color };
}

export async function listActors(ctx: Ctx): Promise<Actor[]> {
  const rows = await ctx.db.all<{ name: string; color: string }>(
    "SELECT name, color FROM actors ORDER BY name ASC"
  );
  return rows.map((r) => ({ name: r.name, color: r.color }));
}

export function restActor(headerValue?: string): string {
  const actor =
    headerValue !== undefined && headerValue.trim().length > 0
      ? headerValue.trim()
      : "agent";
  if (!ACTOR_NAME.test(actor)) {
    throw validation(
      `Invalid actor name "${actor}". Actor names must be 1 to 40 characters matching ${ACTOR_NAME}.`
    );
  }
  return actor;
}

export function resolveActorName(param?: string, urlActor?: string): string {
  if (param !== undefined && typeof param === "string") {
    const trimmed = param.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  if (urlActor !== undefined && typeof urlActor === "string") {
    const trimmed = urlActor.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "agent";
}

export function assertAgentActor(name: string): void {
  if (typeof name !== "string" || !ACTOR_NAME.test(name)) {
    throw validation(
      `Invalid actor name "${name}". Actor names must be 1 to 40 characters matching ${ACTOR_NAME}.`
    );
  }
  if (name.toLowerCase() === "you") {
    throw validation("The actor name 'you' is reserved for the board UI.");
  }
}
