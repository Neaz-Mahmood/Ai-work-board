# Task 04: Tickets: create and read, everywhere

## Context
The AI Work Board (local Jira-style kanban for AI agents) has Projects through REST, MCP and CLI (tasks 01–03). This task adds Tickets — the units of work on a Project's Board — with create and read operations across all three surfaces, plus the Actor registry and the Activity log. Every Project has one Board with five fixed Columns. Later tasks add editing (07), comments (11), Blockers (12), Needs Attention (13) and Features (14); this task fixes the full Ticket JSON shape now, with placeholder values for those parts, so the UI types never churn.

## Do
- Migration 3 (`tickets`) in `src/server/migrations.ts`:
  - `tickets(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, number INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', column_id TEXT NOT NULL CHECK (column_id IN ('backlog','todo','in_progress','in_review','done')), rank INTEGER NOT NULL, priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('highest','high','medium','low','lowest')), assignee TEXT, attention_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, number))`
  - `actors(name TEXT PRIMARY KEY, color TEXT NOT NULL, first_seen_at TEXT NOT NULL)`
  - `activity(id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, actor TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL)` (payload is JSON)
- `src/shared/types.ts` additions:
  ```ts
  export type ColumnId = "backlog" | "todo" | "in_progress" | "in_review" | "done";
  export const COLUMNS: { id: ColumnId; name: string }[] // Backlog, To Do, In Progress, In Review, Done (in this order) — put the runtime constant in src/shared/columns.ts
  export type Priority = "highest" | "high" | "medium" | "low" | "lowest";
  export type FeatureRef = { id: number; name: string; color: string };
  export type Card = { key: string; title: string; column: ColumnId; rank: number; priority: Priority; feature: FeatureRef | null; assignee: string | null; blocked: boolean; needsAttention: string | null };
  export type TicketLink = { key: string; title: string; column: ColumnId };
  export type ActivityEntry = { id: number; actor: string; at: string; kind: string; payload: Record<string, unknown> };
  export type Comment = { id: number; actor: string; body: string; createdAt: string };
  export type Ticket = Card & { projectKey: string; number: number; description: string; createdAt: string; updatedAt: string; blockers: TicketLink[]; blocks: TicketLink[]; comments: Comment[]; activity: ActivityEntry[] };
  export type Actor = { name: string; color: string };
  export type Board = { project: Project; columns: { id: ColumnId; name: string; tickets: Card[] }[]; features: unknown[]; actors: Actor[] };
  ```
  `Project` gains `counts: Record<ColumnId, number>` (Ticket count per Column) on list and get responses.
  For now `feature` is always `null`, `blocked` always `false`, `blockers`/`blocks`/`comments` always `[]`, `Board.features` always `[]`.
- `src/domain/actors.ts` registry: `touchActor(ctx, name)` inserts the Actor on first use with a colour from a fixed 10-colour palette chosen by a stable string hash of the name (Actor `you` always gets `#0052CC`); `listActors(ctx)`; `restActor(headerValue)` → trimmed header or `"agent"`, validated with `ACTOR_NAME` (VALIDATION), `you` allowed (it is the UI). Agents (MCP, CLI) still go through `assertAgentActor` from task 03.
- `src/domain/activity.ts`: `recordActivity(ctx, ticketId, actor, kind, payload)` (uses `ctx.clock`) and `listActivity(ctx, ticketId)` oldest first.
- `src/domain/tickets.ts`:
  - `createTicket(ctx, actor, projectKey, { title, description?, column?, priority?, assignee? })`: title trimmed 1–200 chars; description ≤ 50 000 chars; column default `backlog`; priority default `medium`; assignee optional (validated with `ACTOR_NAME`, registered via `touchActor`). In one `db.tx`: take `projects.next_ticket_number`, increment it (numbers are never reused, even after deletes), insert at rank = number of Tickets in that Column (bottom), `touchActor(actor)`, record Activity `created` `{ column }`. Returns the full `Ticket`.
  - `getTicket(ctx, ticketKey)` (key format `<KEY>-<n>`, case-insensitive project key; NOT_FOUND otherwise) → `Ticket` with activity.
  - `listTickets(ctx, projectKey, { column?, assignee?, q? })` → `Card[]` ordered by column order then rank; `q` matches key, title or description case-insensitively (substring).
  - `getBoard(ctx, projectKey)` → `Board` with all five Columns (empty ones included), cards by rank, and all Actors.
- REST in `src/server/routes/tickets.ts` (actor from header `X-AWB-Actor` via `restActor`):
  - `POST /api/projects/:key/tickets` `{ title, description?, column?, priority?, assignee? }` → `Ticket`, 201
  - `GET /api/projects/:key/tickets?column=&assignee=&q=` → `Card[]`
  - `GET /api/projects/:key/board` → `Board`
  - `GET /api/tickets/:ticketKey` → `Ticket`
  - `GET /api/actors` → `Actor[]`
- MCP tools in `src/mcp/tools/tickets.ts`. Tools needing a Project take `project?: string` (key) or `cwd?: string`, resolved with `resolveProject` from task 02:
  - `get_board` `{ project?, cwd? }`
  - `list_tickets` `{ project?, cwd?, column?, assignee?, query? }`
  - `get_ticket` `{ ticketKey }`
  - `create_ticket` `{ project?, cwd?, title, description?, column?, priority?, assignee?, actor? }`
- CLI commands in `src/cli/commands/` (Project from `--project` or the current directory):
  - `awb board` — for each Column: `== To Do (2) ==` then lines `AWB-3  [high]  Title  @assignee`.
  - `awb ticket list [--column C] [--assignee NAME] [--query TEXT]`
  - `awb ticket show KEY` — key, title, Column, priority, assignee, description, then Activity lines.
  - `awb ticket create TITLE [-d TEXT | --description-file FILE] [--column C] [--priority P] [--assignee NAME]` — prints `Created AWB-1`.
  - Column arguments accept `backlog|todo|in-progress|in-review|done`, case-insensitive, with `_` or `-` (put the parser in `src/cli/columns.ts`). `--json` prints raw JSON for all.
- Tests: `test/tickets.test.ts` (REST: defaults; keys increase per Project and are independent between Projects; numbers not reused after a Ticket is deleted via a direct `ctx.db.run` delete; new Tickets go to the bottom of their Column; validation errors; board shape has five Columns in order; `counts`; `q`/`column`/`assignee` filters; Activity `created` with Actor from header, `agent` when no header; Actors registered with colours); `test/mcp-tickets.test.ts` (each tool; Project resolution by `cwd`; actor from parameter vs `?actor=`); `test/cli-tickets.test.ts` (create, list, show, board, `--json`, column parsing).

## Follow these existing patterns
- `src/domain/projects.ts`, `src/server/routes/projects.ts`, `src/mcp/tools/projects.ts`, `src/cli/commands/init.ts` — same layering: domain functions hold rules; REST/MCP/CLI are thin adapters.
- `test/helpers.ts`, `test/mcp-helpers.ts` — test harnesses.
- `.cursor/feature-pipeline/agent-kanban-board/spec.md` — "Data model", "REST API", "MCP tools", "CLI".

## Do not
- Touch files outside: `src/shared/`, `src/domain/`, `src/server/`, `src/mcp/`, `src/cli/`, `test/`.
- Add dependencies, reformat unrelated code, or commit.
- Implement editing, moving, comments, Blockers, Needs Attention, Features or any delete route (later tasks).

## Done when
- Tickets can be created and read through REST, MCP and CLI with the shapes above.
- `pnpm test && pnpm typecheck` passes.
