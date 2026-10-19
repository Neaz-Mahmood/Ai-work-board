import type { Ctx } from "./context.ts";
import type { ActivityEntry } from "@awb/shared/types.ts";

export async function recordActivity(
  ctx: Ctx,
  ticketId: number,
  actor: string,
  kind: string,
  payload: Record<string, unknown>
): Promise<ActivityEntry> {
  const at = ctx.clock.now().toISOString();
  const payloadStr = JSON.stringify(payload);
  const result = await ctx.db.get<{ id: number }>(
    "INSERT INTO activity (ticket_id, actor, at, kind, payload) VALUES (?, ?, ?, ?, ?) RETURNING id",
    ticketId,
    actor,
    at,
    kind,
    payloadStr
  );

  return {
    id: Number(result!.id),
    actor,
    at,
    kind,
    payload,
  };
}

export async function listActivity(ctx: Ctx, ticketId: number): Promise<ActivityEntry[]> {
  const rows = await ctx.db.all<{
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
    id: Number(r.id),
    actor: r.actor,
    at: r.at,
    kind: r.kind,
    payload: JSON.parse(r.payload),
  }));
}
