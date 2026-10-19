# Plan: Hostable backend, rich text descriptions, smooth drag and drop

Spec: `spec.md` in this folder. ADRs: `docs/adr/0005`–`0010`.

Tasks 04–06 keep the approved batches, but each batch's contents are ordered callers-first. An async function can call a sync one, but a sync function can't await an async one. So the REST/MCP adapters and the root domain modules convert first, the Tickets/Blockers/Features cycle second, and the leaf modules (Projects, Actors, Activity) last. Every batch stays green on its own.

- [01] Prove PGlite and the Postgres driver on Node 26 — blocked by: none — status: done
- [02] Projects identified by a client-normalized path (ADR 0007) — blocked by: none — status: done
- [03] Expand: async Db and async app factory, still on SQLite — blocked by: 01, 02 — status: done ✅ (agy; fix-1 added the test updates, async-db tests, and a throw when a sync tx starts while an async tx is open)
- [04] Migrate batch A: REST/MCP adapters, Claim, Needs Attention, adding Comments — blocked by: 03 — status: done ✅ (agy; fix-1 removed a claim-only module mutex and dropped the two-instance Claim test, which ADR 0006/0010 rule out)
- [05] Migrate batch B: Tickets, Blockers, Features — blocked by: 04 — status: done ✅ (agy; fix-1 restored the name_lower lookup for Feature names, since SQLite lower() is ASCII-only)
- [06] Migrate batch C: Projects, Actors, Activity, listing Comments — blocked by: 05 — status: done ✅ (agy; no fixes needed)
- [07] Contract: switch storage to PGlite and Postgres — blocked by: 06 — status: done ✅ (agy; Claude removed better-sqlite3 + allowBuilds entry, narrowed SqlParam to exclude undefined, ran the start/restart smoke test; Postgres adapter not yet run against a real server)
- [08] Server config resolver and hosted-mode detection — blocked by: 07 — status: done ✅ (agy; no fixes needed; Claude added Clarifications and ran the hosted-refusal and local-start smoke tests)
- [09] Owner auth and API tokens across API, SSE, MCP and CLI — blocked by: 08 — status: done ✅ (agy; no fix rounds; Claude added Clarifications, typed the auth middleware as MiddlewareHandler, and ran a live hosted-mode smoke test)
- [10] Expand: extract the shared package — blocked by: 07 — status: done ✅ (agy; no fix rounds; Claude did the workspace wiring + pnpm install + tsconfig include up front, deleted the old src/shared files, and fixed the Done-when grep that matched @awb/shared)
- [11] Split into web and server apps; local mode serves the bundled SPA — blocked by: 09, 10 — status: done ✅ (agy for config/path edits; Claude did the git mv moves, workspace + package.json wiring and pnpm install, and fixed the README path in apps/server/test/mcp-descriptions.test.ts)
- [12] Frontend on its own origin: API URL, CORS, login screen — blocked by: 11 — status: done ✅ (agy; no fix rounds; Claude added Clarifications (CORS before auth, session gate, 401 loop guard, hosted e2e API context) and simplified useLogout to avoid QueryCache.add internals)
- [13] Docker image and hosting docs — blocked by: 12 — status: done ✅ (agy; no fix rounds; Claude added Clarifications (no corepack on Node 26, /data volume, explicit manifest copies), fixed two README errors, and ran docker build + hosted container smoke incl. volume persistence)
- [14] Rich text editor for Ticket descriptions — blocked by: 11 — status: done ✅ (agy, 1 fix round: task-list input rule via chain commands, single Escape handler, scoped CSS. Attempt 1 aborted reading outside-repo reference files. Claude installed Tiptap at 3.32.0 (not 3.27.1, to avoid mixed versions), restored a missing `}` in TicketModal.css that broke drag e2e, and reverted an unrelated sleep agy added to dragCard)
- [15] Feature descriptions use the rich text editor — blocked by: 14 — status: done ✅ (agy; no fix rounds; Claude added Clarifications (no second toolbar, editor key per form open, omit description from PATCH when untouched, requestSubmit for Cmd/Ctrl+Enter))
- [16] Prefactor: pure drag-and-drop destination function — blocked by: 11 — status: pending
- [17] Switch the Board to Pragmatic drag-and-drop — blocked by: 16 — status: pending
- [18] Quiet drags: one refetch after a drop — blocked by: 17 — status: pending
- [19] Keyboard moves and announcements — blocked by: 17 — status: pending
