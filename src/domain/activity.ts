import type { Ctx } from "./context.ts";
import type { ActivityEntry } from "../shared/types.ts";

export function recordActivity(
  ctx: Ctx,
  ticketId: number,
  actor: string,
  kind: string,
  payload: Record<string, unknown>
): ActivityEntry {
  const at = ctx.clock.now().toISOString();
  const payloadStr = JSON.stringify(payload);
  const result = ctx.db.run(
    "INSERT INTO activity (ticket_id, actor, at, kind, payload) VALUES (?, ?, ?, ?, ?)",
    ticketId,
    actor,
    at,
    kind,
    payloadStr
  );

  return {
    id: result.lastInsertRowid,
    actor,
    at,
    kind,
    payload,
  };
}

export function listActivity(ctx: Ctx, ticketId: number): ActivityEntry[] {
  const rows = ctx.db.all<{
    id: number;
    actor: string;
    at: string;
    kind: string;
    payload: string;
  }>(
    "SELECT id, actor, at, kind, payload FROM activity WHERE ticket_id = ? ORDER BY id ASC",
    ticketId
  );

  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    at: r.at,
    kind: r.kind,
    payload: JSON.parse(r.payload),
  }));
}
