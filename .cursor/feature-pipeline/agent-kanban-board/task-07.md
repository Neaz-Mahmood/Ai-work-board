# Task 07: Edit and move Tickets

## Context
The AI Work Board is a local Jira-style kanban for AI agents. Task 04 added Ticket create/read across REST, MCP and CLI, the Actor registry and the Activity log (`src/domain/tickets.ts`, `src/domain/activity.ts`, `src/domain/actors.ts`). This task lets any Actor edit Ticket fields and move Tickets between and within Columns, with Rank maintained densely and every change recorded in Activity. All Column moves are allowed (no workflow rules); the latest write wins.

## Do
- `src/domain/tickets.ts`:
  - `updateTicket(ctx, actor, ticketKey, patch: { title?, description?, priority?, assignee?: string | null })` in one `db.tx`. Same validation as create (title 1–200 chars trimmed, description ≤ 50 000, priority enum, assignee `ACTOR_NAME` or null; a new assignee is registered with `touchActor`). For each field whose value actually changes, record one Activity entry: `updated` `{ field, from, to }` for title/description/priority, and `assigned` `{ from, to }` for assignee. Bump `updated_at` only if something changed. Unknown fields → VALIDATION. Returns the full `Ticket`.
  - `moveTicket(ctx, actor, ticketKey, { column, position? })` in one `db.tx`. `position` is 0-based in the target Column, clamped to `[0, count]` (count excluding the moving Ticket); missing → bottom. Remove the Ticket from its old Column, insert at the position, and renumber ranks densely `0..n-1` in both affected Columns. Activity: Column changed → `moved` `{ from, to }`; same Column but different rank → `reranked` `{ from, to }` (ranks); no change → no entry. Returns the full `Ticket`.
- REST in `src/server/routes/tickets.ts`:
  - `PATCH /api/tickets/:ticketKey` `{ title?, description?, priority?, assignee?: string | null }` → `Ticket`
  - `POST /api/tickets/:ticketKey/move` `{ column, position? }` → `Ticket`
- MCP tools in `src/mcp/tools/tickets.ts`:
  - `update_ticket` `{ ticketKey, title?, description?, priority?, assignee?: string | null, actor? }`
  - `move_ticket` `{ ticketKey, column, position?, actor? }`
- CLI:
  - `awb ticket update KEY [--title T] [-d TEXT | --description-file FILE] [--priority P] [--assignee NAME|none]` — `none` sends `null`; prints `Updated AWB-3`.
  - `awb ticket move KEY COLUMN [--position N]` — COLUMN parsed by `src/cli/columns.ts`; prints `Moved AWB-3 to In Review`.
- Tests: `test/tickets-edit.test.ts` (REST): each field edit records the right Activity with the header Actor; no-op edit records nothing; assignee set/unset; validation errors; move across Columns with and without position; reorder within a Column; ranks stay dense `0..n-1` in both Columns after a sequence of moves; position clamping; any Column → any Column allowed (e.g. Backlog → Done); last write wins (two PATCHes, second value stays, both in Activity). `test/mcp-tickets-edit.test.ts` and `test/cli-tickets-edit.test.ts` cover the new tool and commands.

## Follow these existing patterns
- `createTicket` in `src/domain/tickets.ts` — transaction, `touchActor`, `recordActivity`.
- `src/server/routes/tickets.ts`, `src/mcp/tools/tickets.ts`, `src/cli/commands/` — thin adapters; MCP actors via `actorFor`, REST via `restActor`.
- `.cursor/feature-pipeline/agent-kanban-board/spec.md` — "Data model → Rank / Activity entry".

## Do not
- Touch files outside: `src/domain/`, `src/server/`, `src/mcp/`, `src/cli/`, `src/shared/`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Add workflow restrictions on Column moves, or any UI.

## Done when
- Tickets can be edited and moved through REST, MCP and CLI; Activity records each change with its Actor; ranks stay dense.
- `pnpm test && pnpm typecheck` passes.
