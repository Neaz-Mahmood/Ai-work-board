# Task 12: Blockers

## Context
The AI Work Board is a local Jira-style kanban for AI agents. A Blocker is another Ticket in the same Project that must be Done before a Ticket can be claimed by an agent (Claim comes in task 16). A Ticket with any Blocker not in Done is "blocked" — derived at read time, never stored. Blockers never stop manual moves; they only show a marker. The `Card` type already has `blocked: boolean` and `Ticket` has `blockers`/`blocks: TicketLink[]` (placeholders so far), and `TicketCard` already renders a "Blocked" lozenge when `blocked` is true (task 06).

## Do
- Migration (next id): `ticket_blockers(ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, blocker_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, PRIMARY KEY (ticket_id, blocker_id))`.
- `src/domain/blockers.ts`:
  - `addBlocker(ctx, actor, ticketKey, blockerKey)`: both must exist (NOT_FOUND); same Project (VALIDATION "Blockers must be in the same project"); not itself (VALIDATION); reject cycles (VALIDATION "That would create a blocker cycle") — walk from the blocker through its own Blockers transitively; if you reach the Ticket, it's a cycle. Adding an existing link is a no-op (no Activity, no event). Otherwise insert, record Activity `blocker_added` `{ blockerKey }` on the blocked Ticket, emit `ticket.updated`.
  - `removeBlocker(ctx, actor, ticketKey, blockerKey)`: removing a missing link is a no-op; otherwise delete, Activity `blocker_removed` `{ blockerKey }`, emit `ticket.updated`.
  - Derived state: a card's `blocked` = exists a Blocker whose `column_id <> 'done'`. Compute it in SQL for `getBoard`, `listTickets` and `getTicket`. `getTicket` fills `blockers` (Tickets blocking it) and `blocks` (Tickets it blocks) as `{ key, title, column }`, ordered by number.
  - Moving a Blocker into or out of Done changes other cards' `blocked` value: after a move, also emit `ticket.updated` for each Ticket it blocks (so open Boards refresh).
  - Deleting a Ticket removes its links via cascade.
- `createTicket` accepts `blockedBy?: string[]` (Ticket keys), validated as above and added in the same transaction (Activity `blocker_added` per Blocker).
- REST:
  - `POST /api/projects/:key/tickets` accepts `blockedBy`.
  - `POST /api/tickets/:ticketKey/blockers` `{ blockerKey }` → `Ticket`
  - `DELETE /api/tickets/:ticketKey/blockers/:blockerKey` → `Ticket`
- MCP: `create_ticket` gains `blockedBy?: string[]`; new tools `add_blocker` and `remove_blocker` `{ ticketKey, blockerKey, actor? }`.
- CLI: `awb ticket create … --blocked-by KEY` (repeatable); `awb ticket block KEY --by BLOCKER`; `awb ticket unblock KEY --by BLOCKER`; `awb ticket show` lists "Blocked by" and "Blocks".
- UI:
  - `TicketModal` side panel: "Blocked by" section listing Blocker keys + titles + a Column lozenge (each clickable → opens that Ticket's modal), a remove (×) button each, and an "Add blocker" input taking a Ticket key; a "Blocks" read-only list below.
  - `TicketCard` lozenge `title`: "Blocked by unfinished tickets".
  - `activityText.ts`: `blocker_added` → "added blocker AWB-2"; `blocker_removed` → "removed blocker AWB-2".
- Tests `test/blockers.test.ts`: add/remove via REST, MCP, CLI; same-Project, self and cycle (direct A→B→A and longer A→B→C→A) rejected; duplicate add is a no-op; `blocked` true while any Blocker is not Done and false once all are Done; `blockers`/`blocks` lists; `blockedBy` on create; deleting a Blocker Ticket unblocks; manual move of a blocked Ticket still allowed; events emitted for dependents when a Blocker moves to Done.

## Follow these existing patterns
- `src/domain/tickets.ts`, `src/domain/comments.ts` — transaction, Activity, emit-after-commit.
- `src/server/routes/tickets.ts`, `src/mcp/tools/tickets.ts`, `src/cli/commands/` — adapters.
- `src/web/components/ticket/TicketModal.tsx` — side panel sections.

## Do not
- Touch files outside: `src/domain/`, `src/server/`, `src/mcp/`, `src/cli/`, `src/web/`, `src/shared/`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Block manual or agent moves because of Blockers; store `blocked` in a column.

## Done when
- Blockers can be managed everywhere; blocked cards show the marker and update live when a Blocker reaches Done.
- `pnpm test && pnpm typecheck && pnpm build` passes.
