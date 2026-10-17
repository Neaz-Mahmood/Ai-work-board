# Task 11: Comments

## Context
The AI Work Board is a local Jira-style kanban for AI agents. Agents report progress and hand-offs by commenting on Tickets, and the human gives instructions the same way. The Ticket detail modal exists (task 10, `src/web/components/ticket/TicketModal.tsx`) with an Activity tab; the `Ticket` type already has `comments: Comment[]` (always empty until now). This task adds markdown comments through REST, MCP, CLI and the modal. Comments are immutable in v1 (no edit, no delete).

## Do
- Migration (next id) in `src/server/migrations.ts`: `comments(id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, actor TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)`.
- `src/domain/comments.ts`: `addComment(ctx, actor, ticketKey, body)` — body trimmed, 1–20 000 chars (VALIDATION otherwise); in one `db.tx` insert, `touchActor(actor)`, bump the Ticket's `updated_at`, record Activity `commented` `{ commentId }`; after commit emit `ticket.commented`. Returns `Comment` (`{ id, actor, body, createdAt }`). `getTicket` now fills `comments` oldest first.
- REST: `POST /api/tickets/:ticketKey/comments` `{ body }` → `Comment`, 201.
- MCP: `add_comment` `{ ticketKey, body, actor? }`.
- CLI: `awb ticket comment KEY TEXT` or `awb ticket comment KEY --file FILE` → prints `Commented on AWB-3`; `awb ticket show KEY` lists comments (`--- <actor> at <time>` then the body).
- UI:
  - `src/web/api/tickets.ts`: `useAddComment(ticketKey)` invalidating `qk.ticket`.
  - `TicketModal`: tab bar becomes "Comments" (default) and "Activity". Comments tab: a composer at the top ("Add a comment…" textarea that expands on focus, Save/Cancel, Cmd/Ctrl+Enter saves) and the list newest first, each with `ActorAvatar`, Actor name, relative time, and the body via `Markdown`.
  - `activityText.ts`: `commented` → "added a comment".
- Tests `test/comments.test.ts` (REST + MCP + CLI): adding returns the comment with the header/MCP Actor; empty body 400; comments appear in `GET /api/tickets/:key` in order; Activity `commented`; `ticket.commented` SSE event; comments are removed when the Ticket is deleted; MCP `add_comment` and CLI `ticket comment` (text and `--file`) work; no route for editing or deleting comments exists (PATCH/DELETE return 404).

## Follow these existing patterns
- `src/domain/tickets.ts` `updateTicket` — transaction, Activity, emit after commit.
- `src/server/routes/tickets.ts`, `src/mcp/tools/tickets.ts`, `src/cli/commands/` — adapter style.
- `src/web/components/ticket/TicketModal.tsx`, `src/web/components/Markdown.tsx` — modal layout and markdown rendering.

## Do not
- Touch files outside: `src/domain/`, `src/server/`, `src/mcp/`, `src/cli/`, `src/web/`, `src/shared/`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Add comment editing or deletion.

## Done when
- A comment added with `awb ticket comment` shows up in the open modal live, rendered as markdown; comments from the modal are attributed to `you`.
- `pnpm test && pnpm typecheck && pnpm build` passes.
