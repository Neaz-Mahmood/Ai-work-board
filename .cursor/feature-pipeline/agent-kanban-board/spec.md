# Spec: AI Work Board (agent kanban board)

Vocabulary follows `CONTEXT.md`. Decisions recorded in `docs/adr/0001`–`0004` are binding.

## Problem Statement

I run several AI coding agents locally (Claude Code, Cursor, agy). When I plan a feature, an agent breaks it into pieces of work and other agents carry them out, but there is no single place where I can see what was planned, what each agent is working on, what is waiting for review, and what is stuck. The work lives in agent transcripts and scattered files, across several repositories. I want a Jira-like board on my own machine that agents write to themselves, so I can watch and steer their work the way I would a human team's.

## Solution

A local web app, the AI Work Board, served by one local server on `127.0.0.1:4747`. It holds many Projects (one per local repository), each with a single Jira-style kanban Board with five fixed Columns: Backlog, To Do, In Progress, In Review, Done.

Agents talk to the board through an MCP server (Streamable HTTP, same server) or the `awb` command-line tool. A planning agent creates a Feature together with its ordered Tickets; working agents Claim the next available Ticket, move it through the Columns, comment on progress, and flag it Needs Attention when they get stuck. I see every change appear live on the board, and I can do everything myself in the UI too: drag cards, create and edit Tickets, comment, reorder, and delete. Every change is recorded in the Ticket's Activity with the Actor who made it.

The board only tracks; it never launches agents (ADR 0002).

## User Stories

### Running the board
1. As the user, I want to start the board with one command (`awb start`), so that I don't have to remember build steps.
2. As the user, I want the board to listen only on 127.0.0.1, so that nothing on my network can reach it.
3. As the user, I want the board's data stored in one database under my home directory, so that all Projects are in one place and my repositories stay free of board files.
4. As the user, I want to change the port and the data directory with flags or environment variables, so that I can avoid clashes and run a scratch copy.
5. As the user, I want `awb` available globally on my machine, so that agents in any repository can call it.
6. As an agent, I want a clear error telling me to run `awb start` when the server is not running, so that I can report the problem instead of failing silently.

### Projects
7. As the user, I want to add a Project from the UI by giving a repository path, so that I can start tracking work in that repository.
8. As an agent, I want to run `awb init` (or the `create_project` tool) in a repository, so that I can set up a Project without waiting for the user.
9. As the user, I want a Project Key derived from the folder name when I don't give one (e.g. `ai-work-board` → `AWB`), so that Ticket keys are short and recognisable.
10. As the user, I want key collisions resolved automatically by appending a digit, so that adding a Project never fails because of a key clash.
11. As the user, I want to choose a Project Key myself, so that I can match names I already use.
12. As the user, I want to see all Projects in a Jira-style sidebar, so that I can switch between Boards quickly.
13. As an agent, I want my Project found from my current directory, so that I don't have to know or pass the key.
14. As an agent, I want to pass an explicit Project Key that overrides directory lookup, so that I can work on a Project from anywhere.
15. As an agent, I want the nearest (deepest) registered Project path to win when Projects are nested, so that lookup is predictable.
16. As an agent, I want a helpful error naming `awb init` when no Project matches my directory, so that I know how to fix it.
17. As the user, I want to rename a Project, so that its display name stays accurate.
18. As the user, I want to delete a Project from the UI (after confirming), so that I can remove abandoned work.
19. As the user, I want registering the same path twice to be rejected, so that a repository never has two Boards.

### The Board
20. As the user, I want each Project to have exactly one Board with the five fixed Columns, so that every Project reads the same way.
21. As the user, I want each Column header to show its Ticket count, so that I can see the shape of the work at a glance.
22. As the user, I want cards that look like Jira cards (key, title, Feature label in its colour, Assignee avatar, Priority icon), so that the board is familiar.
23. As the user, I want a "blocked" marker on any card with an unfinished Blocker, so that I can see why it isn't being picked up.
24. As the user, I want a visible Needs Attention marker on flagged cards, so that stuck work stands out.
25. As the user, I want to drag a card to another Column, so that I can change its state directly.
26. As the user, I want to drag cards up and down within a Column, so that I can set the Rank that decides what gets worked on next.
27. As the user, I want to search Tickets by key, title or description from the board header, so that I can find one quickly.
28. As the user, I want quick filters by Feature and by Assignee, so that I can focus on one Feature or one agent.
29. As the user, I want changes made by agents to appear on the board without reloading, so that I can watch work happen live.
30. As the user, I want Done to show all completed Tickets, so that nothing disappears in v1.
31. As the user, I want a light theme modelled on Jira, so that the board is comfortable and familiar.
32. As the user, I want a friendly empty state when there are no Projects or no Tickets, so that I know what to do first.

### Tickets
33. As the user, I want to create a Ticket from the board (Jira's "+ Create" at the bottom of a Column), so that I can add work myself.
34. As an agent, I want to create a Ticket with title, markdown description, Priority, Feature, Column and Blockers, so that I can record planned work fully in one call.
35. As the user, I want each Ticket to get a key like `AWB-12` that is never reused, so that references in comments and commits stay unambiguous.
36. As the user, I want new Tickets to go to the bottom of their Column, so that existing Rank is not disturbed.
37. As the user, I want new Tickets to land in Backlog unless another Column is given, so that agent-planned work waits for my approval.
38. As the user, I want to open a Ticket in a detail modal over the board (with its key in the URL), so that I can read and edit it without losing my place and share a link to it.
39. As the user, I want to edit title, description, Priority, Feature and Assignee in the modal, so that I can correct agent output.
40. As the user, I want descriptions and comments rendered as markdown, so that agents' structured notes are readable.
41. As the user, I want to set Priority on Jira's five levels with Medium as default, so that importance is visible on the card.
42. As the user, I want Priority to have no effect on Rank, so that only my explicit ordering decides what gets claimed.
43. As an agent, I want to move a Ticket to any Column, so that I can reflect my real progress (there are no forbidden transitions).
44. As an agent, I want to assign or unassign a Ticket, so that ownership is accurate.
45. As the user, I want at most one Assignee per Ticket, so that ownership is clear.
46. As the user, I want to delete a Ticket from the UI (after confirming), so that I can remove mistakes.
47. As the user, I want agents to have no way to delete Tickets, Features or Projects through MCP or the CLI, so that a misbehaving agent cannot wipe work.

### Blockers
48. As an agent, I want to say a Ticket is blocked by other Tickets in the same Project, so that work happens in the right order.
49. As the user, I want Blockers to be shown on the card and in the modal, so that I understand dependencies.
50. As the user, I want Blockers that would form a cycle (or block a Ticket on itself, or cross Projects) to be rejected, so that work can never be blocked forever.
51. As the user, I want Blockers to never stop me or an agent from moving a Ticket manually, so that I stay in control.
52. As the user, I want deleting a Ticket to remove it as a Blocker from others, so that nothing stays blocked by a ghost.

### Claiming
53. As a working agent, I want to Claim the next Ticket in one call, so that I can start work without searching the board.
54. As a working agent, I want Claim to pick only To Do Tickets that are unassigned, not Needs Attention and whose Blockers are all Done, so that I never start work that cannot be done.
55. As a working agent, I want Claim to take the top-Ranked eligible Ticket, so that the user's ordering is respected.
56. As a working agent, I want Claim to be atomic, so that two agents never get the same Ticket.
57. As a working agent, I want Claim to assign the Ticket to me and move it to In Progress, so that the board reflects that I've started.
58. As a working agent, I want to optionally limit Claim to one Feature, so that I can work through a single plan.
59. As a working agent, I want a clear "nothing to claim" result rather than an error, so that I can stop cleanly.

### Needs Attention
60. As an agent, I want to flag a Ticket Needs Attention with a reason, so that the user knows I am stuck and why.
61. As the user, I want the flag to leave the Ticket in its Column, so that I can see where in the workflow it got stuck.
62. As the user or an agent, I want to clear the flag, so that the Ticket can continue.
63. As the user, I want the reason shown in the modal and as a tooltip on the card marker, so that I can act without digging.

### Features
64. As a planning agent, I want to create a Feature together with its ordered Tickets in one call, so that "plan, break into Tickets, write them on the board" is one step.
65. As a planning agent, I want Tickets in that call to name Blockers among each other by their position in the list, so that I can express order before the keys exist.
66. As the user, I want each Feature to have a name, optional markdown description and a colour, so that its cards are easy to spot.
67. As the user, I want a colour picked automatically if none is given, so that Features look distinct without effort.
68. As the user, I want Feature names unique within a Project, so that filters and references are unambiguous.
69. As the user, I want to see each Feature's progress (Done/total), so that I know how far a plan has got.
70. As the user, I want to edit a Feature's name, description and colour, so that I can tidy up agent output.
71. As the user, I want deleting a Feature to keep its Tickets and only remove their Feature link, so that no work is lost.
72. As an agent, I want to list Features and read one with its Tickets, so that I can find the plan I'm executing.

### Actors, comments and Activity
73. As an agent, I want to name myself with `--as`, `AWB_ACTOR`, an `actor` tool parameter or an `actor` setting in my MCP URL, so that my changes are attributed to me.
74. As the user, I want calls with no name recorded under Actor `agent` rather than refused, so that a misconfigured agent still works.
75. As the user, I want my own changes in the UI recorded as Actor `you`, and agents prevented from using that name, so that I can tell my changes from theirs.
76. As the user, I want new Actor names registered on first use with a generated avatar colour, so that I can tell agents apart on cards.
77. As an agent, I want to add markdown comments to a Ticket, so that I can report progress, findings and hand-offs.
78. As the user, I want to comment on a Ticket from the modal, so that I can give agents instructions.
79. As the user, I want every change to a Ticket recorded in its Activity with Actor, time and before/after values, so that I can see who did what, including when I overrode an agent.
80. As the user, I want the latest write to win when two Actors change the same Ticket, so that the board never blocks on conflicts, with Activity showing the sequence.

### Agent setup
81. As the user, I want README snippets that add the board's MCP server to Claude Code and to Cursor, so that setup is copy-paste.
82. As the user, I want a short "how to use the board" text to paste into CLAUDE.md or AGENTS.md, so that agents follow the same workflow (plan into Backlog, Claim from To Do, move to In Review when done, flag Needs Attention when stuck).
83. As an agent, I want a `--json` output mode on every CLI command, so that I can parse results reliably.

## Implementation Decisions

### Architecture (ADR 0004)
- One TypeScript Node process (Node 26, pnpm) is the only writer to the database. It serves the built React (Vite) single-page app, a REST API under `/api`, an SSE stream under `/api/events`, and MCP over Streamable HTTP at `/mcp`.
- HTTP framework: Hono (in-process `app.request`/`app.fetch` is the main test seam). SQLite through `better-sqlite3` (synchronous, mature, supports `BEGIN IMMEDIATE`). MCP via the official `@modelcontextprotocol/sdk` server with its Streamable HTTP transport, stateless mode.
- Single pnpm package with internal modules: **domain core** (Projects, Tickets, Features, Blockers, Claim, Activity, Actors; validation and transactions), **storage** (schema, migrations, queries), **event bus** (in-process, emits after commit), **http** (REST + SSE + static UI), **mcp** (tool definitions mapped onto the domain core), **cli** (`awb`, a thin HTTP client), **web** (the UI). REST and MCP are two thin adapters over the same domain core; neither holds business rules.
- Application factory: `createApp({ dataDir, clock })` returns the handler without binding a port; `awb start` binds `127.0.0.1` on the port. Defaults: data dir `~/.ai-work-board` (overridden by `AWB_HOME` or `--data-dir`), database file `board.db` in it, WAL mode, foreign keys on, busy timeout set. Port 4747 (overridden by `AWB_PORT` or `--port`). The CLI finds the server at `AWB_URL` (default `http://127.0.0.1:4747`).
- Migrations run at startup, in order, tracked in a schema version table; a fresh data dir yields a fresh schema.
- No auth. The server binds to loopback only.

### Data model
- **Project**: id, key (unique; 2–5 chars, `^[A-Z]{2,5}$` for chosen keys, or derived key plus digits within the 5-char limit), name, path (absolute, must exist as a directory, unique after normalising trailing slashes and resolving symlinks), next ticket number, created/updated.
- **Key derivation**: split the folder name on `-`, `_`, space, `.` and camelCase boundaries; take initials, uppercased. If that gives fewer than 2 letters, use the first 3 letters of the name. Cap at 5. On collision, append 2, 3, … (trimming letters if needed to stay within 5 chars). A chosen key that collides is rejected with an error (no silent rewrite).
- **Ticket**: id, project id, number (key is `<ProjectKey>-<number>`, numbers never reused even after deletes), title (required, non-empty, trimmed), description (markdown, may be empty), column (`backlog | todo | in_progress | in_review | done`), rank (within column), priority (`highest | high | medium | low | lowest`, default `medium`), feature id (nullable), assignee (Actor name, nullable), needs attention reason (nullable; non-null means flagged), created/updated.
- **Blocker** link: (ticket, blocked-by ticket). Same Project only, no self-links, no cycles (checked on insert by walking the graph). Removed by cascade when either Ticket is deleted.
- **Feature**: id, project id, name (unique per Project, case-insensitive), description (markdown), colour (hex; auto-assigned from a fixed 8-colour Jira-like palette, cycling, when not given), created/updated. Progress (done count / total) is derived, not stored.
- **Comment**: id, ticket id, actor, body (markdown, non-empty), created. Comments are immutable in v1.
- **Activity entry**: id, ticket id, actor, time (from the injected clock), kind, payload (JSON before/after). Kinds: `created`, `updated` (one entry per changed field: field, from, to), `moved` (from column, to column), `reranked`, `assigned` (from, to), `blocker_added`, `blocker_removed`, `attention_flagged` (reason), `attention_cleared`, `commented`, `claimed`. Activity is append-only; it is removed only when its Ticket is deleted.
- **Actor**: name (unique), colour (generated deterministically from the name), first seen. Names are trimmed, 1–40 chars of letters, digits, `-`, `_`, `.`. `you` is reserved for the UI; an agent call naming itself `you` is rejected. A missing name becomes `agent`.
- **Rank**: integer position per (project, column), dense from 0. A move or reorder takes a target column and an optional 0-based `position`; the server shifts siblings inside one transaction. No position means bottom of the target column. A move to the same column with a new position records `reranked`; a column change records `moved`.
- Concurrency: every write is one transaction; Claim uses `BEGIN IMMEDIATE` so concurrent Claims serialise. Last write wins for plain field edits.

### Claim
- Input: Project (key or cwd), optional feature id. Eligible = column `todo`, assignee null, needs attention null, every Blocker in `done`, and (if given) matching feature. Picks the lowest rank. In one transaction: assigns to the calling Actor, moves to the bottom of In Progress, writes `claimed` Activity. Returns the full Ticket, or `null` (`{"ticket": null}`) when nothing is eligible.

### Actor transport
- REST: header `X-AWB-Actor`. The UI always sends `you`; the CLI sends `--as` / `AWB_ACTOR`. The reserved name is enforced only for the CLI and MCP paths (it is a guardrail, not security; see Further Notes).
- MCP: optional `actor` parameter on every write tool; otherwise the `actor` query parameter on the MCP URL (e.g. `http://127.0.0.1:4747/mcp?actor=claude-opus`); otherwise `agent`. Parameter wins over URL.

### Project resolution (shared by REST, MCP, CLI)
- Explicit key wins. Otherwise a `cwd` path is matched against registered Project paths: the deepest Project whose path equals or contains `cwd`. No match → error `NO_PROJECT` with message "No project registered for <cwd>. Run `awb init` in the repository root."

### REST API (JSON; errors are `{ "error": { "code", "message" } }` with 400/404/409 statuses)
- `GET /api/health` → `{ ok, version }`
- `GET /api/projects` → list with Ticket counts per Column
- `POST /api/projects` `{ path, name?, key? }` → Project (201)
- `GET /api/projects/resolve?cwd=` → Project or 404 `NO_PROJECT`
- `GET /api/projects/:key` → Project
- `PATCH /api/projects/:key` `{ name }`
- `DELETE /api/projects/:key` (UI only)
- `GET /api/projects/:key/board` → `{ project, columns: [{ id, name, tickets: [card] }], features, actors }`; a card has key, title, column, rank, priority, feature (id, name, colour), assignee, blocked (bool), needsAttention (reason or null)
- `GET /api/projects/:key/tickets?column=&feature=&assignee=&q=` → cards
- `POST /api/projects/:key/tickets` `{ title, description?, column?, priority?, featureId?, assignee?, blockedBy?: [ticketKey] }` → Ticket (201)
- `POST /api/projects/:key/claim` `{ featureId? }` → `{ ticket | null }`
- `GET /api/projects/:key/features` → Features with progress
- `POST /api/projects/:key/features` `{ name, description?, color?, tickets?: [{ title, description?, priority?, column?, blockedBy?: [ticketKey], blockedByIndexes?: [int] }] }` → `{ feature, tickets }` (201), all in one transaction; `blockedByIndexes` refer to 0-based positions in this `tickets` array and must point backwards (earlier items only)
- `GET /api/features/:id` → Feature with progress and its cards
- `PATCH /api/features/:id` `{ name?, description?, color? }`
- `DELETE /api/features/:id` (UI only; clears Ticket links)
- `GET /api/tickets/:ticketKey` → full Ticket: fields, feature, blockers (key, title, column), blocks (reverse links), comments, activity (newest last)
- `PATCH /api/tickets/:ticketKey` `{ title?, description?, priority?, featureId?|null, assignee?|null }`
- `POST /api/tickets/:ticketKey/move` `{ column, position? }`
- `POST /api/tickets/:ticketKey/blockers` `{ blockerKey }`; `DELETE /api/tickets/:ticketKey/blockers/:blockerKey`
- `PUT /api/tickets/:ticketKey/attention` `{ reason }`; `DELETE /api/tickets/:ticketKey/attention`
- `POST /api/tickets/:ticketKey/comments` `{ body }` → Comment (201)
- `DELETE /api/tickets/:ticketKey` (UI only)
- `GET /api/actors` → Actors with colours
- `GET /api/events?project=KEY` → SSE (below)

### Live updates (SSE)
- The domain core publishes an event on the in-process bus after each committed write. `GET /api/events` streams them as `text/event-stream`, optionally filtered to one Project. Each message has `event: <type>` and JSON `data` `{ projectKey, ticketKey?, featureId?, actor, at }`. Types: `project.created|updated|deleted`, `ticket.created|updated|moved|deleted`, `ticket.commented`, `feature.created|updated|deleted`. A `: ping` comment is sent every 25 s.
- Events carry identifiers, not full objects. The UI (TanStack Query) invalidates the affected queries (board, ticket detail, features, project list) and refetches. On reconnect (browser `EventSource` auto-retry) it invalidates everything for the open Project, so missed events don't matter.

### MCP tools (Streamable HTTP at `/mcp`)
Every tool that needs a Project accepts `project` (key) or `cwd` (path); every write tool accepts optional `actor`. Results are JSON text content with the same shapes as REST. No delete tools exist.
- `list_projects` — all Projects.
- `create_project` `{ path, name?, key? }`
- `get_board` `{ project|cwd }` — Columns with cards, Features, Actors.
- `list_tickets` `{ project|cwd, column?, featureId?, assignee?, query? }`
- `get_ticket` `{ ticketKey }`
- `create_ticket` `{ project|cwd, title, description?, column?, priority?, featureId?, assignee?, blockedBy? }`
- `update_ticket` `{ ticketKey, title?, description?, priority?, featureId?, assignee? }`
- `move_ticket` `{ ticketKey, column, position? }`
- `claim_next_ticket` `{ project|cwd, featureId? }`
- `add_comment` `{ ticketKey, body }`
- `add_blocker` / `remove_blocker` `{ ticketKey, blockerKey }`
- `set_needs_attention` `{ ticketKey, reason }`; `clear_needs_attention` `{ ticketKey }`
- `list_features` `{ project|cwd }`; `get_feature` `{ featureId }`
- `create_feature` `{ project|cwd, name, description?, color?, tickets? }` — same `tickets` shape as REST, one transaction.
- `update_feature` `{ featureId, name?, description?, color? }`
- Tool descriptions state the intended workflow: plan into Backlog; the user moves approved Tickets to To Do; working agents Claim, comment, move to In Review when done, flag Needs Attention when stuck.

### CLI (`awb`, thin HTTP client)
Global flags: `--as <actor>` (else `AWB_ACTOR`), `--project <KEY>` (else resolved from current directory), `--json`, `--url <url>` (else `AWB_URL`). Exit code 0 on success, 1 on domain error (message on stderr), 2 on usage error, 3 when the server is unreachable (message: "AI Work Board server is not running at <url>. Run `awb start`.").
- `awb start [--port N] [--data-dir DIR] [--open]` — run the server in the foreground; `--open` opens the browser.
- `awb init [--key KEY] [--name NAME] [--path DIR]` — register the current (or given) directory.
- `awb projects` — list Projects.
- `awb board` — Columns with Ticket keys and titles for the current Project.
- `awb ticket list [--column C] [--feature ID] [--assignee NAME] [--query TEXT]`
- `awb ticket show KEY`
- `awb ticket create TITLE [-d TEXT | --description-file FILE] [--column C] [--priority P] [--feature ID] [--assignee NAME] [--blocked-by KEY ...]`
- `awb ticket update KEY [--title] [-d | --description-file] [--priority] [--feature ID|none] [--assignee NAME|none]`
- `awb ticket move KEY COLUMN [--position N]` — COLUMN accepts `backlog|todo|in-progress|in-review|done` (case-insensitive, `_` or `-`).
- `awb ticket comment KEY TEXT` (or `--file FILE`)
- `awb ticket block KEY --by BLOCKER` / `awb ticket unblock KEY --by BLOCKER`
- `awb ticket attention KEY REASON` / `awb ticket attention KEY --clear`
- `awb claim [--feature ID]` — prints the claimed Ticket, or "Nothing to claim" (exit 0).
- `awb feature list`, `awb feature show ID`
- `awb feature create NAME [-d TEXT] [--color HEX] [--tickets-file FILE.json]` — the JSON file is the `tickets` array.
- `awb feature update ID [--name] [-d] [--color]`
- Install: `pnpm build` then `pnpm link --global` from the repo exposes `awb`.

### Web UI
- React + Vite SPA served by the server; routing with a URL per board: `/projects/:key` with the open Ticket in `?selectedIssue=KEY` (as Jira does). `/` redirects to the most recently opened Project, or shows the empty state.
- Layout modelled on Jira's board: left sidebar (app name, Project list, "Add project"), board header (Project name and key, search box, Feature quick-filter chips, Assignee avatar filter), five Columns with uppercase names and counts, scrolling horizontally on narrow screens.
- Cards: title, then a footer row with Feature label (colour), Priority icon, key, and Assignee avatar (initials plus Actor colour); blocked and Needs Attention markers (reason as tooltip).
- Drag-and-drop with `@dnd-kit` across and within Columns, with an optimistic update that rolls back on error.
- "+ Create" at the bottom of each Column opens an inline title input; Enter creates the Ticket in that Column.
- Detail modal: editable title, markdown description (view / edit toggle), side panel with Column select, Assignee, Priority, Feature, Blockers (add/remove by key), Needs Attention (set with reason / clear), created/updated; below, tabs for Comments (with a composer) and Activity (human-readable entries with Actor avatar and relative time). Delete in a "…" menu with confirmation.
- Markdown rendered with `react-markdown` + GFM, with no raw HTML.
- Add-project dialog takes path, optional name and key. Project settings: rename, delete (confirm by typing the key).
- Feature management: a Features panel/drawer listing each Feature with progress, and create/edit/delete.
- Light theme only in v1, styled on Atlassian's look (neutral greys, blue accents) with plain CSS or CSS modules.

### Documentation
- README: install, `awb start`, MCP setup snippets for Claude Code (`claude mcp add --transport http ai-work-board http://127.0.0.1:4747/mcp?actor=claude`) and Cursor (`mcp.json` entry with URL), CLI reference, and a paste-ready "Using the AI Work Board" block for CLAUDE.md / AGENTS.md describing the workflow.

## Testing Decisions

- Good tests exercise external behaviour only: HTTP requests in, JSON/SSE out; CLI arguments in, stdout/exit code out; browser actions in, visible board out. They do not reach into tables, internal modules or React components. Setup goes through the same public API (small builder helpers that call REST).
- **Seam 1 — the application factory over HTTP (primary, Vitest).** `createApp({ dataDir, clock })` is exercised in-process with `app.request`/`app.fetch`, no port. Covers REST behaviour: Project creation, key derivation and collisions, path uniqueness, resolution by key and by cwd (deepest match, `NO_PROJECT`); Ticket create/edit/move, key sequencing (never reused), Rank shifting and reordering, defaults; Blockers including same-Project, self and cycle rejection, cascade on delete, derived blocked flag; Needs Attention set/clear; comments; Activity entries with Actor and before/after for every change; Feature create-with-tickets including `blockedByIndexes`, progress, unique names, delete clearing links; Actor handling (header, `agent` fallback, `you` reserved); validation errors and status codes. A concurrency test fires many Claims in parallel and asserts no Ticket is handed out twice and ineligible Tickets (blocked, assigned, flagged, wrong Column, other Feature) are skipped. MCP is tested through the same handler with the official MCP SDK client over Streamable HTTP, its `fetch` pointed at `app.fetch`: tool list (and absence of delete tools), each tool matching its REST counterpart, Actor from parameter vs URL vs fallback. SSE: open `/api/events`, make a change, assert the event arrives with the right type and identifiers.
- **Seam 2 — the `awb` CLI against a real server (Vitest, thin).** Start the app on an ephemeral port in a temp data dir; run the CLI entry function in-process with captured stdout/stderr and exit code. Covers `--as` / `AWB_ACTOR`, Project resolution from the working directory, `--json` output, a few core commands (init, ticket create/move, claim), and exit code 3 with the "run `awb start`" message against a closed port.
- **Seam 3 — UI smoke (Playwright).** Against the built app on an ephemeral port with a temp data dir: five Columns with counts render; drag a card between Columns and reorder within one; open the detail modal, edit, comment; Feature and Assignee quick filters; a change made through REST appears live without reload.
- **Isolation.** Every test file (or test) uses a fresh temp data dir with a real SQLite file in WAL mode (not `:memory:`), deleted afterwards; nothing ever touches `~/.ai-work-board`. The clock is injected so timestamps are deterministic.
- **Commands.** `pnpm test` runs Vitest (seams 1–2); `pnpm test:e2e` runs Playwright; `pnpm typecheck` runs `tsc --noEmit`. Task briefs verify with `pnpm test` and `pnpm typecheck`.
- **Prior art.** None in this repository (greenfield); the first slice establishes the pattern for the others.

## Out of Scope

- Syncing with or importing grill-and-build pipeline files (`plan.md`, `task-NN.md`), now or later (ADR 0001).
- Launching, stopping or supervising agents; streaming agent logs (ADR 0002).
- Authentication, multiple users, remote access, binding to anything but loopback.
- Configurable or per-Project Columns; workflow transition rules.
- Sprints, swimlanes, story points, estimates, ticket types, labels, due dates, attachments, sub-tasks, Ticket links other than Blockers.
- Editing or deleting comments; hiding or archiving old Done Tickets; undo.
- Dark theme (later, if cheap).
- A command that edits Claude Code / Cursor / agy config files.
- Electron or any desktop wrapper; running as a background daemon or OS service.
- Moving Tickets between Projects.
- Export/import of board data.

## Further Notes

- **Project Key format.** The grill settled "2–5 uppercase letters" and also "append a number on collision". The spec reconciles these: chosen keys are 2–5 letters; derived keys may end in digits, staying within 5 characters. CONTEXT.md was updated to match. Confirm this is acceptable.
- **"Only the user deletes" is a guardrail, not security.** There is no auth, so anything that can reach the REST API (including an agent using `curl`) could call a DELETE route or send `X-AWB-Actor: you`. MCP and the CLI simply expose no delete operations and refuse the name `you`. Acceptable for a single-user local tool; revisit if that ever changes.
- **Default Column for agent-created Tickets is Backlog,** which makes the user's move to To Do the approval step that makes work claimable. Agents can still pass another Column explicitly.
- **Claim moves the Ticket to the bottom of In Progress.** In Progress order has no meaning for Claim; this choice just keeps the earliest-started work at the top.
- **Blocked state is derived** at read time (any Blocker not in Done), never stored, so it can't go stale.
- **Activity is per Ticket only.** Feature and Project changes are not logged in v1.
- **Server port in use** at `awb start`: fail with a clear message naming `--port` / `AWB_PORT`; no automatic port hopping, because agents' MCP configs point at a fixed URL.
- **MCP stateless mode** means no per-session state on the server; the `actor` URL setting is read on every request.
- Library choices (Hono, better-sqlite3, @dnd-kit, TanStack Query, react-markdown) are recommendations the first slices should confirm against Node 26 compatibility; swapping any of them does not change this spec's behaviour.
