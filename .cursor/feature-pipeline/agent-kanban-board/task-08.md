# Task 08: Live updates (SSE)

## Context
The AI Work Board is a local Jira-style kanban for AI agents. Agents change Tickets through MCP and the CLI while the human watches the Board in the browser (task 06); the server is the only writer (ADR 0004), so it knows about every change. This task adds an in-process event bus, a Server-Sent Events stream at `/api/events`, and UI wiring so agent changes appear on the Board without reloading. From now on every task that adds a write must emit its event.

## Do
- `src/domain/events.ts`:
  ```ts
  export type BoardEventType = "project.created" | "project.updated" | "project.deleted" | "ticket.created" | "ticket.updated" | "ticket.moved" | "ticket.deleted" | "ticket.commented" | "feature.created" | "feature.updated" | "feature.deleted";
  export type BoardEvent = { type: BoardEventType; projectKey: string; ticketKey?: string; featureId?: number; actor: string; at: string };
  export class EventBus { emit(e: BoardEvent): void; subscribe(fn: (e: BoardEvent) => void): () => void }
  ```
  (No constructor parameter properties.) Add `events: EventBus` to `Ctx` in `src/domain/context.ts`; `createApp` creates one per app.
- Emit **after the transaction commits** (call `emit` after `db.tx(...)` returns, never inside it) for every existing write: create/rename/delete Project (`project.*`, actor from the request; Project REST create uses `restActor`), create Ticket (`ticket.created`), update Ticket (`ticket.updated`, only when something changed), move Ticket (`ticket.moved`, only when something changed). `at` = `ctx.clock.now().toISOString()`.
- `src/server/routes/events.ts`: `GET /api/events?project=KEY` using Hono `streamSSE`. Each event is written as `event: <type>` with `data: <JSON BoardEvent>`; when `project` is given, only that Project's events are sent. Send a `: ping` comment every 25 seconds (interval injectable through an optional `AppOptions.sseHeartbeatMs`, default 25000, so tests can shorten it). Unsubscribe and clear the timer when the client disconnects (`stream.onAbort`).
- `src/web/api/useLiveUpdates.ts`: `useLiveUpdates(projectKey)` opens `new EventSource("/api/events?project=" + key)`; on each event invalidate: `project.*` → `qk.projects`; `ticket.*` → `qk.board(key)` and `qk.ticket(ticketKey)` and `qk.projects`; `feature.*` → `qk.features(key)` and `qk.board(key)`. On `open` after a reconnect (any `open` after the first), invalidate everything for that Project. Close on unmount or Project change. Call it from `BoardPage`.
- Keep exactly one EventSource, for the open Board's Project; no project-less stream.
- Tests `test/events.test.ts`: open `GET /api/events?project=AWB` with `app.request`, read the response body stream until the expected `event:` line arrives (helper `readSseEvents(response, count, timeoutMs)` in `test/helpers.ts`, cancelling the reader afterwards); assert type and identifiers for: create Ticket via REST, update, move, and a Ticket created via MCP (`actor` = the MCP actor); no event for a no-op update; events for another Project are filtered out; heartbeat ping arrives with `sseHeartbeatMs: 50`; events are emitted only after commit (a failing create emits nothing).

## Follow these existing patterns
- `src/domain/tickets.ts`, `src/domain/projects.ts` — the write functions you add `emit` calls to.
- `src/server/app.ts` — `AppOptions`, route mounting.
- `src/web/api/queryKeys.ts`, `src/web/pages/BoardPage.tsx` — query keys and where to call the hook.

## Do not
- Touch files outside: `src/domain/`, `src/server/`, `src/mcp/`, `src/web/api/`, `src/web/pages/BoardPage.tsx`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Send full objects in events (identifiers only), or use WebSockets/polling.

## Done when
- A Ticket created with `awb ticket create` appears on an open Board within a second, without reload.
- `pnpm test && pnpm typecheck && pnpm build` passes.
