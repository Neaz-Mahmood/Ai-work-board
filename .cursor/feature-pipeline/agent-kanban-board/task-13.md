# Task 13: Needs Attention

## Context
The AI Work Board is a local Jira-style kanban for AI agents. Needs Attention is a flag with a reason that marks a Ticket an agent could not complete without human help; it does not move the Ticket out of its Column, and flagged Tickets are never claimed (task 16). The `tickets.attention_reason` column already exists (task 04; non-null means flagged), `Card.needsAttention` already carries the reason, and `TicketCard` already renders an orange "Needs attention" lozenge with the reason as `title` (task 06).

## Do
- `src/domain/attention.ts`:
  - `setNeedsAttention(ctx, actor, ticketKey, reason)`: reason trimmed, 1–500 chars (VALIDATION). Sets `attention_reason`, bumps `updated_at`, records Activity `attention_flagged` `{ reason }`, emits `ticket.updated`. Setting it again (same or different reason) records a new entry.
  - `clearNeedsAttention(ctx, actor, ticketKey)`: if not flagged → no-op (no Activity, no event); else clear, Activity `attention_cleared` `{ reason: <previous reason> }`, emit `ticket.updated`.
  - The Ticket stays in its Column and keeps its Assignee in both cases.
- REST: `PUT /api/tickets/:ticketKey/attention` `{ reason }` → `Ticket`; `DELETE /api/tickets/:ticketKey/attention` → `Ticket`.
- MCP: `set_needs_attention` `{ ticketKey, reason, actor? }`; `clear_needs_attention` `{ ticketKey, actor? }`.
- CLI: `awb ticket attention KEY REASON` → `Flagged AWB-3`; `awb ticket attention KEY --clear` → `Cleared AWB-3`; `awb ticket show` prints `Needs attention: <reason>` when flagged.
- UI:
  - `TicketModal`: when flagged, an orange banner at the top of the left column: "Needs attention: <reason>" with a "Resolve" button (clears). Side panel: a "Flag as needs attention" button opening a small form for the reason.
  - `activityText.ts`: `attention_flagged` → "flagged this as needing attention: <reason>"; `attention_cleared` → "cleared the needs-attention flag".
- Tests `test/attention.test.ts`: set/clear via REST, MCP and CLI with Actors; empty and over-long reason rejected; Column and Assignee unchanged; re-flag records a second entry; clearing an unflagged Ticket is a no-op; `needsAttention` appears on cards in `GET /api/projects/:key/board`; `ticket.updated` events.

## Follow these existing patterns
- `src/domain/blockers.ts`, `src/domain/comments.ts` — small domain modules with Activity + emit-after-commit.
- `src/server/routes/tickets.ts`, `src/mcp/tools/tickets.ts`, `src/cli/commands/` — adapters.
- `src/web/components/ticket/TicketModal.tsx` — modal sections.

## Do not
- Touch files outside: `src/domain/`, `src/server/`, `src/mcp/`, `src/cli/`, `src/web/`, `src/shared/`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Add a Needs Attention Column or move flagged Tickets.

## Done when
- An agent can flag and clear Needs Attention; the board marker and modal banner update live.
- `pnpm test && pnpm typecheck && pnpm build` passes.
