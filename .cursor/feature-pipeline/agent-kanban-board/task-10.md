# Task 10: Ticket detail modal and delete

## Context
The AI Work Board is a local Jira-style kanban for AI agents. Cards render on the Board with drag-and-drop (tasks 06, 09); Tickets can be read with `GET /api/tickets/:ticketKey` (full `Ticket` incl. `activity`) and edited with `PATCH /api/tickets/:ticketKey` and `POST /api/tickets/:ticketKey/move` (task 07). This task adds the Jira-style Ticket detail modal (opened by clicking a card, addressed in the URL) and Ticket deletion — which only the human can do, through the UI. Agents get no delete in MCP or the CLI.

## Do
- Server:
  - `deleteTicket(ctx, actor, ticketKey)` in `src/domain/tickets.ts` (cascade removes its Activity; renumber ranks densely in its Column; Ticket numbers are not reused) and emit `ticket.deleted` after commit.
  - `DELETE /api/tickets/:ticketKey` → 204 in `src/server/routes/tickets.ts`.
  - No MCP tool and no CLI command for deletion.
- Dependencies: `react-markdown`, `remark-gfm`.
- `src/web/components/Markdown.tsx`: renders markdown with GFM, **no raw HTML** (do not enable `rehype-raw`), links open in a new tab with `rel="noreferrer"`.
- `src/web/api/tickets.ts`: `useTicket(ticketKey)` (`qk.ticket`), `useUpdateTicket()`, `useDeleteTicket()`; mutations invalidate `qk.ticket(key)`, `qk.board(projectKey)`, `qk.projects`.
- Routing: the open Ticket lives in the query string, `/projects/:key?selectedIssue=AWB-12` (as in Jira). Clicking a card sets it; closing removes it; reloading the URL reopens the modal.
- `src/web/components/ticket/TicketModal.tsx` (wide modal, ~960px, two-column layout):
  - Header: the key (small, subtle) and a "…" menu with "Delete" → confirmation dialog ("Delete AWB-12? This can't be undone.") → DELETE, close modal.
  - Left: title editable in place (click to edit, Enter/blur saves, Escape cancels); "Description" section rendering `Markdown`, with an "Edit" toggle to a textarea plus Save/Cancel; then a tab bar containing only "Activity" for now (task 11 adds a "Comments" tab before it) showing the Activity list.
  - Right side panel "Details": Column (select of the five Columns → move to bottom of that Column), Assignee (text input with suggestions from `board.actors`, empty = unassigned), Priority (select with `PriorityIcon`), then "Created <relative time>" and "Updated <relative time>".
- `src/web/components/ticket/activityText.ts`: human-readable lines per Activity kind, e.g. `created` → "created the ticket in Backlog"; `updated` → "changed the Title from "a" to "b"" (for description just "updated the Description"); `moved` → "moved this from To Do to In Progress"; `reranked` → "changed the rank"; `assigned` → "assigned this to X" / "unassigned Y"; unknown kinds → the kind name. Each entry shows `ActorAvatar`, Actor name, the text and a relative time (`title` = exact timestamp).
- Tests: `test/tickets-delete.test.ts` — REST delete returns 204, Ticket gone (404), Activity gone, ranks of remaining Tickets in that Column dense, next created Ticket gets a new number (not reused), `ticket.deleted` event emitted; MCP tool list contains no tool whose name includes `delete`; `runCli(["ticket", "delete", "X-1"])` exits 2 (unknown command).

## Follow these existing patterns
- `src/web/components/Modal.tsx`, `ActorAvatar.tsx`, `PriorityIcon.tsx` — reuse.
- `src/web/api/board.ts`, `src/web/api/tickets.ts` (task 09) — hook style and cache keys.
- `src/domain/tickets.ts` `moveTicket` — rank renumbering; `src/domain/events.ts` — emit after commit.

## Do not
- Touch files outside: `src/web/`, `src/domain/tickets.ts`, `src/server/routes/tickets.ts`, `test/`, `package.json`, `pnpm-lock.yaml`.
- Add dependencies other than `react-markdown` and `remark-gfm`; reformat unrelated code; commit.
- Expose deletion through MCP or the CLI.

## Done when
- Clicking a card opens the modal with `?selectedIssue=KEY`; title, description, Column, Assignee and Priority edits persist and appear in Activity as Actor `you`; delete removes the Ticket from the Board.
- `pnpm test && pnpm typecheck && pnpm build` passes.
