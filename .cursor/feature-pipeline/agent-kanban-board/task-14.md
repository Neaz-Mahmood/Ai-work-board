# Task 14: Features, backend

## Context
The AI Work Board is a local Jira-style kanban for AI agents. A Feature is a planned piece of work broken down into Tickets; each Ticket belongs to at most one Feature. The key agent workflow is "plan a feature, break it into Tickets, write them on the board" — so a planning agent must be able to create a Feature together with its ordered Tickets (including Blockers between them) in one call. Tickets, Blockers (task 12) and events (task 08) exist; `Card.feature: FeatureRef | null` and `Board.features` are placeholders so far. This task adds Features through REST, MCP and CLI. The UI comes in task 15.

## Do
- Migration (next id):
  - `features(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, name_lower TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, name_lower))`
  - `ALTER TABLE tickets ADD COLUMN feature_id INTEGER REFERENCES features(id) ON DELETE SET NULL`
- `src/shared/types.ts`: `export type Feature = { id: number; projectKey: string; name: string; description: string; color: string; progress: { done: number; total: number }; createdAt: string; updatedAt: string }`; `export type FeatureWithTickets = Feature & { tickets: Card[] }`; `Board.features: Feature[]`.
- `src/domain/features.ts`:
  - Palette (in order): `#0C66E4`, `#1F845A`, `#E2B203`, `#C9372C`, `#6E5DC6`, `#227D9B`, `#E56910`, `#AE4787`. New Feature without a colour gets `palette[(number of Features ever created in the Project) % 8]` (count existing rows is acceptable). A given colour must match `^#[0-9a-fA-F]{6}$`.
  - Name trimmed 1–100 chars, unique per Project case-insensitively (CONFLICT "A feature named X already exists"); description ≤ 50 000.
  - `createFeature(ctx, actor, projectKey, { name, description?, color?, tickets?: NewFeatureTicket[] })` where `NewFeatureTicket = { title, description?, priority?, column?, blockedBy?: string[], blockedByIndexes?: number[] }`. Everything in **one** `db.tx`: insert the Feature, then create each Ticket in list order via the existing create logic with `featureId` set (so they land at the bottom of their Column — default Backlog — in list order). `blockedByIndexes` are 0-based positions in this `tickets` array and must point to earlier items only (index < own index; otherwise VALIDATION "blockedByIndexes must refer to earlier tickets"); `blockedBy` are existing Ticket keys. Any failure rolls back everything. After commit emit `feature.created` and one `ticket.created` per Ticket. Returns `{ feature: Feature, tickets: Ticket[] }`.
  - `listFeatures(ctx, projectKey)` ordered by creation; `getFeature(ctx, id)` → `FeatureWithTickets` (cards ordered by Column order then rank); `updateFeature(ctx, actor, id, { name?, description?, color? })` → emit `feature.updated`; `deleteFeature(ctx, actor, id)` → for every linked Ticket record Activity `updated` `{ field: "feature", from: <name>, to: null }`, then delete (FK sets `feature_id` NULL), emit `feature.deleted` (UI-only operation).
  - Progress = count of the Feature's Tickets in `done` / total.
- Tickets: `createTicket` and `updateTicket` accept `featureId?: number | null` (must belong to the same Project, else VALIDATION). Changing it records Activity `updated` `{ field: "feature", from: <name|null>, to: <name|null> }`. Cards and Tickets now return `feature: { id, name, color } | null`. `getBoard` returns `features: Feature[]`. `listTickets` accepts `feature` (id).
- REST:
  - `GET /api/projects/:key/features` → `Feature[]`
  - `POST /api/projects/:key/features` `{ name, description?, color?, tickets? }` → `{ feature, tickets }`, 201
  - `GET /api/features/:id` → `FeatureWithTickets`
  - `PATCH /api/features/:id` `{ name?, description?, color? }` → `Feature`
  - `DELETE /api/features/:id` → 204 (UI-only)
  - `POST /api/projects/:key/tickets` and `PATCH /api/tickets/:ticketKey` accept `featureId`; `GET /api/projects/:key/tickets` accepts `feature=`.
- MCP: `list_features` `{ project?, cwd? }`; `get_feature` `{ featureId }`; `create_feature` `{ project?, cwd?, name, description?, color?, tickets?, actor? }` (same `tickets` shape); `update_feature` `{ featureId, name?, description?, color?, actor? }`; `create_ticket`/`update_ticket` gain `featureId`; `list_tickets` gains `featureId`. No delete tool.
- CLI: `awb feature list` (`#<id>  <name>  <done>/<total>`); `awb feature show ID` (Feature then its Tickets); `awb feature create NAME [-d TEXT] [--color HEX] [--tickets-file FILE.json]` (the file is the `tickets` JSON array; prints the Feature id and created keys); `awb feature update ID [--name N] [-d TEXT] [--color HEX]`; `awb ticket create|update … --feature ID|none`; `awb ticket list --feature ID`.
- Tests `test/features.test.ts`: create with tickets incl. `blockedByIndexes` and `blockedBy` (Blockers exist, order and Column correct); forward/self index rejected and nothing is created (rollback); duplicate name (different case) 409; colour auto-assigned from the palette and validated; progress counts; update; delete keeps Tickets, clears links, records Activity; `featureId` on ticket create/update incl. cross-Project rejection; filters; events; MCP tools (and still no delete tool); CLI commands incl. `--tickets-file`.

## Follow these existing patterns
- `src/domain/tickets.ts` `createTicket`, `src/domain/blockers.ts` — reuse their internal helpers inside one transaction rather than duplicating SQL.
- `src/server/routes/`, `src/mcp/tools/`, `src/cli/commands/` — adapter style.
- `.cursor/feature-pipeline/agent-kanban-board/spec.md` — "Data model → Feature", "REST API", "MCP tools", "CLI".

## Do not
- Touch files outside: `src/domain/`, `src/server/`, `src/mcp/`, `src/cli/`, `src/shared/`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Build Feature UI (task 15) or Claim (task 16).

## Done when
- One `create_feature` call with ordered tickets creates the Feature, its Tickets in Backlog in order, and their Blockers; everything rolls back on any error.
- `pnpm test && pnpm typecheck` passes.
