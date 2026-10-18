# Task 04: Migrate batch A: REST/MCP adapters, Claim, Needs Attention, adding Comments

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is converting its domain core from the sync `ctx.db` to the async `ctx.adb` (`AsyncDb` in `src/server/db.ts`), one batch at a time, so that the storage can later become Postgres/PGlite.

**Rule for every batch:** an async (converted) function may call a sync (unconverted) one, but a sync function must never call an async one. So batches go callers-first. This batch converts:
- the adapters (REST routes and MCP tools), which only gain `await`s;
- the domain functions that only adapters call.

## Do
- `src/server/routes/projects.ts`, `src/server/routes/tickets.ts`, `src/server/routes/features.ts`, `src/server/routes/events.ts`, `src/mcp/tools/projects.ts`, `src/mcp/tools/tickets.ts`, `src/mcp/tools/features.ts`, `src/mcp/server.ts`: make every handler `async` (if not already) and `await` every domain call. Awaiting a sync return value is harmless, so this stays green.
- Convert these functions to `async`, using only `ctx.adb` for their own SQL and `await ctx.adb.tx(async () => …)` for their transactions:
  - `src/domain/attention.ts`: `setNeedsAttention`, `clearNeedsAttention`
  - `src/domain/claim.ts`: `claimNextTicket`
  - `src/domain/comments.ts`: `addComment` only. `listComments` stays sync, because sync `getTicket` calls it.

  Inside them, keep calling the still-sync helpers (`getTicket`, `parseTicketKey`, `touchActor`, `recordActivity`, `compactColumnRanks`, `insertTicketAtRank`) as plain calls. They run on the same connection and join the open transaction.
- Write all new or changed SQL so that it also runs on Postgres later:
  - `INSERT … RETURNING id` via `ctx.adb.get`, never `lastInsertRowid`
  - `lower(a) = lower(?)` instead of `COLLATE NOCASE`
  - `ON CONFLICT … DO NOTHING` instead of `INSERT OR IGNORE`
  - `COUNT(*)` results read with `Number(...)`
- Update tests that call these domain functions directly (e.g. `test/claim.test.ts`, `test/comments.test.ts`) to `await` them.

## Follow these existing patterns
- `src/server/db.ts`: `AsyncDb` (`get`/`all`/`run`/`tx`) and how `adb.tx` joins nested and sync transactions.
- The current bodies of the functions being converted: keep their validation, Activity entries and event emission (`ctx.events`) identical. Only the I/O style changes.

## Do not
- Touch files outside: `src/server/routes/`, `src/mcp/`, `src/domain/attention.ts`, `src/domain/claim.ts`, `src/domain/comments.ts`, `test/`
- Convert `tickets.ts`, `blockers.ts`, `features.ts`, `projects.ts`, `actors.ts`, `activity.ts`, or `listComments`; later batches do that.
- Add dependencies, reformat unrelated code, or commit

## Done when
- The listed functions are async and use only `ctx.adb`; every adapter awaits domain calls.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes
