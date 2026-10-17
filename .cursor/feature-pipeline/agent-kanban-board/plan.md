# Plan: agent-kanban-board

Spec: `spec.md` (this folder). Glossary: `CONTEXT.md`. Decisions: `docs/adr/0001`–`0004`.
Every task verifies with `pnpm test && pnpm typecheck` (UI tasks also `pnpm build`; task 19 uses `pnpm test:e2e`).

- [01] Walking skeleton — blocked by: none — status: done
- [02] Projects through REST and CLI — blocked by: 01 — status: done
- [03] MCP endpoint — blocked by: 02 — status: done
- [04] Tickets: create and read, everywhere — blocked by: 03 — status: done
- [05] App shell UI — blocked by: 02 — status: done
- [06] Board view, read-only — blocked by: 04, 05 — status: done
- [07] Edit and move Tickets — blocked by: 04 — status: done
- [08] Live updates (SSE) — blocked by: 06, 07 — status: done
- [09] Drag-and-drop and inline create — blocked by: 06, 07 — status: done
- [10] Ticket detail modal and delete — blocked by: 07, 09 — status: done
- [11] Comments — blocked by: 10 — status: done
- [12] Blockers — blocked by: 10 — status: done
- [13] Needs Attention — blocked by: 10 — status: done
- [14] Features, backend — blocked by: 12 — status: done
- [15] Features UI — blocked by: 14, 08 — status: done
- [16] Claim — blocked by: 12, 13, 14 — status: done
- [17] Search and quick filters — blocked by: 15 — status: done
- [18] Agent docs and tool guidance — blocked by: 16 — status: done
- [19] UI smoke tests (Playwright) — blocked by: 08, 09, 10, 17 — status: done
