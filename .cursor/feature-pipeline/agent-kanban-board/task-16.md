# Task 16: Claim

## Context
The AI Work Board is a local Jira-style kanban for AI agents. A Claim is an agent atomically taking the next piece of work: the top-Ranked Ticket in To Do that is unassigned, not flagged Needs Attention (task 13), and whose Blockers are all Done (task 12), optionally limited to one Feature (task 14). The claiming agent becomes the Assignee and the Ticket moves to In Progress. Several agents may claim at once, so two agents must never get the same Ticket. The `Db` wrapper's `tx` uses `BEGIN IMMEDIATE` (task 01), which serialises writers across connections and processes.

## Do
- `src/domain/claim.ts`: `claimNextTicket(ctx, actor, projectKey, { featureId? }) → Ticket | null`. Inside one `db.tx`:
  1. Select the eligible Ticket with the lowest `rank`: `column_id = 'todo' AND assignee IS NULL AND attention_reason IS NULL AND NOT EXISTS (a Blocker not in 'done')` and, if given, `feature_id = ?` (a `featureId` from another Project → VALIDATION).
  2. None → return `null`.
  3. Set `assignee = actor`, move it to the bottom of In Progress, renumber ranks densely in To Do and In Progress, bump `updated_at`, `touchActor(actor)`, record Activity `claimed` `{ from: "todo", to: "in_progress" }`.
  After commit emit `ticket.moved` (when a Ticket was claimed). Reuse the rank helpers from `moveTicket` rather than duplicating them.
- REST: `POST /api/projects/:key/claim` `{ featureId? }` → `{ "ticket": Ticket | null }` (200 in both cases).
- MCP: `claim_next_ticket` `{ project?, cwd?, featureId?, actor? }` → `{ "ticket": Ticket | null }`.
- CLI: `awb claim [--feature ID]` → prints `Claimed AWB-4: <title>` followed by its description, or `Nothing to claim` — exit 0 in both cases; `--json` prints `{ "ticket": … }`.
- UI: `activityText.ts`: `claimed` → "claimed this and started work".
- Tests `test/claim.test.ts`:
  - Picks the top-ranked eligible To Do Ticket; skips assigned, flagged, blocked (Blocker not Done), Backlog/other-Column Tickets, and other Features when `featureId` given; a Ticket whose Blockers are all Done is eligible.
  - Result: assigned to the caller (REST header, MCP `actor`/`?actor=`, CLI `--as`), in In Progress at the bottom, Activity `claimed`, `ticket.moved` event; ranks dense afterwards.
  - Returns `{ ticket: null }` when nothing is eligible; CLI prints "Nothing to claim" with exit 0.
  - **Concurrency:** create 5 eligible Tickets; fire 20 claims in parallel via `Promise.all` through REST with different actors → exactly 5 distinct Tickets claimed, 15 nulls, no Ticket assigned twice. Repeat with **two `createApp` instances opened on the same `dataDir`** (two SQLite connections), interleaving claims from both → still no duplicates.

## Follow these existing patterns
- `src/domain/tickets.ts` `moveTicket` — rank renumbering and Activity.
- `src/domain/blockers.ts` — the derived blocked condition SQL.
- `src/server/routes/`, `src/mcp/tools/`, `src/cli/commands/` — adapters; `test/helpers.ts`, `test/mcp-helpers.ts` — harnesses.

## Do not
- Touch files outside: `src/domain/`, `src/server/`, `src/mcp/`, `src/cli/`, `src/web/components/ticket/activityText.ts`, `src/shared/`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Let Priority influence the choice (Rank only).

## Done when
- `awb claim` / `claim_next_ticket` hands out each eligible Ticket exactly once, in Rank order, even under concurrent calls.
- `pnpm test && pnpm typecheck && pnpm build` passes.
