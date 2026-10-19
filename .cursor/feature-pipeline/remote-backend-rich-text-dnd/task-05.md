# Task 05: Migrate batch B: Tickets, Blockers, Features

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is converting its domain core from the sync `ctx.db` to the async `ctx.adb` (`AsyncDb` in `src/server/db.ts`), callers-first: an async function may call a sync one, never the reverse.
- The REST/MCP adapters, `attention.ts`, `claim.ts` and `comments.addComment` are already async.
- This batch converts the Tickets / Blockers / Features modules, which call each other in a cycle and so must convert together.
- They keep calling the still-sync leaf helpers: `touchActor`, `listActors`, `recordActivity`, `listActivity`, `listComments`, `getProject`.

## Do
- Convert every exported function to `async`, using `ctx.adb` only (`await ctx.adb.tx(async () => …)` for transactions):
  - `src/domain/tickets.ts`: `createTicketTx`, `createTicket`, `getTicket`, `updateTicket`, `compactColumnRanks`, `insertTicketAtRank`, `moveTicket`, `listTickets`, `getBoard`, `deleteTicket`. `parseTicketKey` is pure and stays sync. Convert internal helpers that run SQL too.
  - `src/domain/blockers.ts`: `checkBlockerCycle`, `addBlocker`, `removeBlocker`, `attachBlockersOnCreate`
  - `src/domain/features.ts`: `createFeature`, `listFeatures`, `getFeature`, `updateFeature`, `deleteFeature`
- Add `await` at every call site of these functions: inside these three files, in `src/domain/attention.ts`, `src/domain/claim.ts`, `src/domain/comments.ts`, and in tests.
- Calls to the sync leaf helpers stay plain calls. They run on the same connection and join the open transaction.
- Write changed SQL portably for the later Postgres switch:
  - `INSERT … RETURNING id` via `ctx.adb.get` instead of `lastInsertRowid`
  - `lower(a) = lower(?)` instead of `COLLATE NOCASE`
  - `ON CONFLICT … DO NOTHING` instead of `INSERT OR IGNORE`/`REPLACE`
  - `Number(...)` around `COUNT(*)`
  - compare booleans explicitly rather than relying on SQLite returning 0/1
  - keep `LIKE` for search for now
- Rank semantics (dense from 0 per project and Column, siblings shifted inside one transaction) must stay exactly as they are.

## Follow these existing patterns
- `src/domain/claim.ts` and `src/domain/attention.ts` (converted in the previous batch): how converted functions use `ctx.adb.tx` and call sync helpers.
- Existing tests `test/tickets.test.ts`, `test/blockers.test.ts`, `test/features.test.ts`, `test/board-filters.test.ts`: they define the required behaviour. Don't change what they assert.

## Do not
- Touch files outside: `src/domain/tickets.ts`, `src/domain/blockers.ts`, `src/domain/features.ts`, `src/domain/attention.ts`, `src/domain/claim.ts`, `src/domain/comments.ts` (call sites only), `src/server/routes/`, `src/mcp/` (only if a missing `await` surfaces), `test/`
- Convert `projects.ts`, `actors.ts`, `activity.ts` or `listComments`; the next batch does that.
- Add dependencies, reformat unrelated code, or commit

## Done when
- No function in `tickets.ts`, `blockers.ts` or `features.ts` uses `ctx.db`; all use `ctx.adb`.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes
