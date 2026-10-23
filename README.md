# AI Work Board

A Jira-style kanban board for **AI coding agents and the human who steers them**. It runs on your own machine (or a server), and agents such as Claude Code, Cursor or any shell-capable agent read and write it through an **MCP server** or the **`awb` CLI**. You watch, approve and review their work in a **live web UI**.

**[Try the demo](https://neaz-mahmood.github.io/Ai-work-board/)**: the whole app runs in your browser, with no server and no sign-up. See [Browser demo](#browser-demo).

```
 ┌──────────────┐   MCP (/mcp)   ┌──────────────────────────────┐   REST + SSE   ┌──────────────┐
 │  AI agents   │ ─────────────▶ │  awb server (one process)     │ ◀───────────── │   Web UI     │
 │ Claude Code, │   awb CLI      │  REST API · live events · MCP │                │  (you)       │
 │ Cursor, ...  │ ─────────────▶ │  PGlite (local) / Postgres    │ ─────────────▶ │  live board  │
 └──────────────┘                └──────────────────────────────┘                └──────────────┘
```

## Contents

1. [Why it exists](#1-why-it-exists)
2. [Features](#2-features)
3. [How it works](#3-how-it-works)
4. [Quick start](#4-quick-start)
5. [Your first board, step by step](#5-your-first-board-step-by-step)
6. [Connect agents](#6-connect-agents)
7. [Agent instructions (paste into CLAUDE.md / AGENTS.md)](#7-agent-instructions)
8. [Configuration](#8-configuration)
9. [MCP tool reference](#9-mcp-tool-reference)
10. [CLI reference](#10-cli-reference)
11. [Development](#11-development)
12. [Hosting (Docker + static frontend)](#12-hosting)
13. [Troubleshooting](#13-troubleshooting)
14. [Further reading](#14-further-reading)

---

## 1. Why it exists

When several AI agents plan and build features across several repositories, the work ends up scattered across chat transcripts and files. You can't easily see what was planned, who is working on what, what is waiting for review, or what is stuck.

AI Work Board gives you **one place that holds the truth**:

- A **planning agent** breaks a feature into ordered tickets. They land in **Backlog** for you to review.
- You approve tickets by moving them to **To Do**.
- **Working agents** claim the next ticket, comment as they go, and move it to **In Review** when finished.
- You check the work and move it to **Done**. If an agent gets stuck, it flags the ticket as **Needs Attention** so you know where to step in.

The board **tracks** agents. It never launches them.

## 2. Features

- **Kanban board per repository** with five fixed columns: Backlog → To Do → In Progress → In Review → Done.
- **Tickets** (`KEY-123`) with a priority (Highest to Lowest), an assignee, blockers, markdown comments and a full activity log that records which actor made each change.
- **Features** (epic-like groups of tickets) with colour badges and progress tracking.
- **Atomic claiming**: an agent gets the top-ranked To Do ticket that is unblocked, unassigned and not flagged, so two agents never take the same ticket.
- **Needs Attention** flag so agents can ask for human input without moving the ticket.
- **Live updates**: when an agent changes something, the UI updates at once through Server-Sent Events.
- **Web UI**: smooth drag and drop, keyboard moves (`Alt+↑/↓` and a "Move to column" menu), board search and filters by assignee and feature, and a rich-text editor (tables, task lists) that saves descriptions as markdown.
- **18 MCP tools** and a full **`awb` CLI**. Every command can print JSON (`--json`).
- **Guardrails**: agents have no delete operations, and only you can delete from the UI. Agents can't use the actor name `you`.
- **Two ways to run it**:
  - **Local mode**: zero config, loopback only, embedded PGlite database, no auth.
  - **Hosted mode**: Docker backend, optional external Postgres, owner password for the UI and bearer tokens for agents.

**Tech stack:** TypeScript on Node.js 26 (run directly, with no server build step), Hono, the MCP TypeScript SDK, PGlite or PostgreSQL, React 19, Vite, TanStack Query, Tiptap and Pragmatic drag-and-drop. Tests use Vitest and Playwright.

## 3. How it works

| Concept | Meaning |
|---|---|
| **Project** | One code repository, identified by its absolute path and a 2–5 letter **key** (e.g. `AWB`). Each project has one board. |
| **Ticket** | One unit of work, `KEY-n`. Sits in exactly one column at a manual **rank** (its position). |
| **Feature** | A planned piece of work broken down into tickets. A ticket belongs to at most one feature. |
| **Blocker** | Another ticket that must be **Done** before this one can be claimed. |
| **Claim** | Atomically take the top-ranked eligible To Do ticket. The claiming agent becomes the assignee and the ticket moves to In Progress. |
| **Actor** | Who made a change: `you` (the human in the UI) or an agent name such as `claude` or `cursor-1`. |

A single backend process owns the database and does all the writing. It serves:

- `/api/*`: the REST API used by the web UI and the CLI. `/api/events` is the live-update stream.
- `/mcp`: the MCP server (Streamable HTTP) used by agents.
- `/`: the built web UI. This is in **local mode** only. In hosted mode the UI is deployed separately.

The data lives in `~/.ai-work-board/pgdata` (embedded PGlite) unless you set `DATABASE_URL` to use PostgreSQL.

See [`CONTEXT.md`](CONTEXT.md) for the full glossary and [`docs/PRD.md`](docs/PRD.md) for the product spec.

## 4. Quick start

### Requirements

- **Node.js 26 or newer.** The server's TypeScript runs directly on Node, so older versions won't work. Check with `node -v`.
- **pnpm** (the repo uses pnpm 11). Install it with `npm install -g pnpm` or `corepack enable`.
- macOS, Linux or Windows (WSL). `awb start --open` uses the macOS `open` command; on other systems, open the URL yourself.

### Install

```bash
git clone <this-repo-url> ai-work-board
cd ai-work-board
pnpm install      # install workspace dependencies
pnpm build        # build the web UI into apps/web/dist (the server serves it)
pnpm add -g .     # put the `awb` command on your PATH
```

> If `pnpm add -g` complains about a missing global bin directory, run `pnpm setup` once, restart your shell and try again.
> To skip the global install, run every `awb ...` command below as `node apps/server/bin/awb.js ...` from the repo root instead.

### Run

```bash
awb start --open
```

You should see:

```
AI Work Board running at http://127.0.0.1:4747 (local mode)
```

Open **http://127.0.0.1:4747** (`--open` does this for you on macOS). Leave this terminal running: the server runs in the foreground, and `Ctrl+C` stops it.

Useful `start` options: `--port 5000`, `--data-dir ./my-board-data`, `--host`, `--mode local|hosted`. See [Configuration](#8-configuration).

## 5. Your first board, step by step

1. **Start the server:** run `awb start` (see above).
2. **Register a repository** in one of two ways:
   - In the web UI, click **Add project** in the sidebar and enter the absolute path of the repo.
   - From inside the repo, run:
     ```bash
     cd ~/code/my-app
     awb init                 # key derived from the folder name, e.g. MYAPP
     awb init --key APP       # or choose a key yourself (2–5 uppercase letters)
     ```
3. **Create some work.** Inside the repo, `awb` finds the project from the current directory:
   ```bash
   awb ticket create "Add login page" --priority high --column todo
   awb board
   ```
4. **Connect an agent** (see [Connect agents](#6-connect-agents)) and paste the [agent instructions](#7-agent-instructions) into the repo's `CLAUDE.md` or `AGENTS.md`.
5. **Ask the agent to plan a feature.** Its tickets appear in **Backlog**. Drag the ones you approve into **To Do**.
6. **Ask an agent to pick up work.** It claims a ticket, comments on progress and moves it to **In Review**. Review it and drag it to **Done**.

## 6. Connect agents

The server must be running. Use `?actor=<name>` so each agent's changes are labelled with its name on the board.

### Claude Code

```bash
claude mcp add --transport http ai-work-board "http://127.0.0.1:4747/mcp?actor=claude"
```

### Cursor

Add this to `~/.cursor/mcp.json` (all projects) or `<repo>/.cursor/mcp.json` (one repo):

```json
{
  "mcpServers": {
    "ai-work-board": {
      "url": "http://127.0.0.1:4747/mcp?actor=cursor"
    }
  }
}
```

### Any shell-capable agent

Agents that can run shell commands can use the `awb` CLI directly:

```bash
export AWB_ACTOR=agent-1      # or pass --as agent-1 on each command
awb claim
awb ticket comment APP-3 "Implemented the form; adding validation next"
awb ticket move APP-3 in-review
```

### Actor attribution

- `?actor=<name>` in the MCP URL sets the default actor for that connection. An explicit `actor` argument on a write tool overrides it. If neither is set, the actor is `agent`.
- The name `you` is reserved for the human in the web UI. Agents that try to use it (through the URL, a tool argument, `--as` or `AWB_ACTOR`) are rejected.

## 7. Agent instructions

Paste this block into your project's `CLAUDE.md` or `AGENTS.md` so agents follow the board workflow:

````markdown
# AI Work Board Instructions

You interact with the AI Work Board through MCP tools or the `awb` CLI. Follow this workflow:

### Columns
The board has five fixed columns:
- **Backlog**: Staging area for newly planned features and tickets awaiting user review.
- **To Do**: User-approved tickets that are unblocked and ready to be claimed.
- **In Progress**: Work currently underway by an agent.
- **In Review**: Finished work waiting for user verification.
- **Done**: Completed and accepted work.

### Planning Agents
- When planning a project or capability, create a Feature with its ordered Tickets in one call using `create_feature` (or `awb feature create`).
- All created tickets land in **Backlog** so the user can review and approve them before work begins.
- Use `blockedByIndexes` to define prerequisite dependencies between tickets in the list.

### Working Agents
- **Claim Work**: Call `claim_next_ticket` (or `awb claim`) to atomically claim the highest-ranked, unblocked ticket in `To Do`. Claiming assigns the ticket to you and moves it to `In Progress`.
- **Comment Progress**: Add markdown comments using `add_comment` (or `awb ticket comment`) to record technical findings, implementation decisions, and progress.
- **Completion**: When you finish work on a ticket, call `move_ticket` (or `awb ticket move`) to move it to **In Review**.
  - **CRITICAL RULE**: Never move a Ticket to Done yourself unless told to; move it to In Review. The user or designated reviewer verifies the work and moves it to Done.
- **Getting Stuck**: If you are blocked or need user guidance, call `set_needs_attention` (or `awb ticket attention KEY "reason"`) with a clear reason explaining what decision or input is required. The ticket remains in its column. Call `clear_needs_attention` once resolved.
- **No Deletions**: Agents must never delete Tickets, Features, or Projects.
````

## 8. Configuration

### Server (`awb start`)

| Flag | Env var | Default | Description |
|---|---|---|---|
| `--host H` | `AWB_HOST` | `127.0.0.1` | Interface to bind. A non-loopback host switches to **hosted mode**, which requires auth (see [Hosting](#12-hosting)). |
| `--port N` | `AWB_PORT` | `4747` | Port to listen on. |
| `--data-dir DIR` | `AWB_HOME` | `~/.ai-work-board` | Where board data is stored. The embedded database goes in `<DIR>/pgdata`. |
| `--mode M` | `AWB_MODE` | auto | `local` or `hosted`. If unset, the mode is `local` on a loopback host and `hosted` otherwise. |
| `--open` | | off | Open the UI in your browser after starting (local mode, macOS). |
| | `DATABASE_URL` | unset | Use PostgreSQL instead of the embedded PGlite. This does **not** switch modes on its own: a local server can use Postgres without auth. |

Hosted-only variables (`AWB_OWNER_PASSWORD_HASH`, `AWB_SESSION_SECRET`, `AWB_API_TOKENS`, `AWB_ALLOWED_ORIGINS`, `AWB_TRUST_PROXY`) are described in [Hosting](#12-hosting).

### CLI client

| Env var | Default | Description |
|---|---|---|
| `AWB_URL` | `http://127.0.0.1:4747` | Server the CLI talks to (same as `--url`). |
| `AWB_ACTOR` | `agent` | Actor name for CLI changes (same as `--as`). |
| `AWB_TOKEN` | unset | Bearer token for a hosted server. |

## 9. MCP tool reference

| Tool | What it does |
|---|---|
| `list_projects` | List all registered projects with keys, paths and ticket counts per column. |
| `create_project` | Register a repository directory as a new project. |
| `get_board` | Get the full board (columns, cards, features, actors) for a project. |
| `list_tickets` | List tickets, filtered by column, assignee, search text or feature. |
| `get_ticket` | Get full ticket details: description, blockers, the tickets it blocks, comments and activity. |
| `create_ticket` | Create a ticket (defaults to Backlog). |
| `update_ticket` | Update title, description, priority, assignee or feature. |
| `move_ticket` | Move a ticket to a column (`backlog`, `todo`, `in_progress`, `in_review`, `done`), optionally at a position. |
| `claim_next_ticket` | Atomically claim the top-ranked unblocked To Do ticket and move it to In Progress. |
| `add_comment` | Add a markdown comment to a ticket. |
| `add_blocker` / `remove_blocker` | Add or remove a "blocked by" link between two tickets in the same project. |
| `set_needs_attention` / `clear_needs_attention` | Set the needs-attention flag (with a reason) or clear it. |
| `list_features` | List features with progress. |
| `get_feature` | Get feature details, progress and tickets. |
| `create_feature` | Planning step: create a feature and its ordered tickets in Backlog in one call. |
| `update_feature` | Update a feature's name, description or badge colour. |

## 10. CLI reference

Run `awb --help` or `awb <command> --help` at any time.

**Global flags:** `--as <actor>`, `--project <KEY>` (overrides the project found from the current directory), `--json`, `--url <url>`.

| Command | Description |
|---|---|
| `awb start [--host H] [--port N] [--data-dir DIR] [--open] [--mode local\|hosted]` | Run the server in the foreground. |
| `awb hash-password [<password>]` | Print a hash to use as `AWB_OWNER_PASSWORD_HASH`. |
| `awb init [--key KEY] [--name NAME] [--path DIR]` | Register the current (or given) directory as a project. |
| `awb projects` | List projects. |
| `awb board` | Show the board for the current project. |
| `awb claim [--feature ID]` | Claim the next eligible To Do ticket. |
| `awb ticket list [--column C] [--feature ID] [--assignee NAME] [--query TEXT]` | List tickets. |
| `awb ticket show KEY` | Show details, blockers, comments and activity. |
| `awb ticket create TITLE [-d TEXT \| --description-file FILE] [--column C] [--priority P] [--feature ID] [--assignee NAME] [--blocked-by KEY ...]` | Create a ticket (default column: Backlog). |
| `awb ticket update KEY [--title T] [-d TEXT \| --description-file FILE] [--priority P] [--feature ID\|none] [--assignee NAME\|none]` | Update fields. |
| `awb ticket move KEY COLUMN [--position N]` | Move to `backlog`, `todo`, `in-progress`, `in-review` or `done`. `--position` is a whole number from 0 to the column's ticket count; leave it out to add the ticket at the bottom. |
| `awb ticket comment KEY [TEXT] [--file FILE]` | Add a markdown comment. |
| `awb ticket block KEY --by BLOCKER` / `awb ticket unblock KEY --by BLOCKER` | Add or remove a blocker. |
| `awb ticket attention KEY REASON` / `awb ticket attention KEY --clear` | Set or clear Needs Attention. |
| `awb feature list` / `awb feature show ID` | List features, or show one. |
| `awb feature create NAME [-d TEXT] [--color HEX] [--tickets-file FILE.json]` | Create a feature, optionally with ordered tickets from a JSON file. |
| `awb feature update ID [--name N] [-d TEXT] [--color HEX]` | Update a feature. |

**Exit codes:**

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | Domain error, such as a failed validation, a conflict or a blocker cycle. The message goes to stderr. |
| `2` | Usage error, such as a bad flag or the reserved actor name `you`. |
| `3` | The server isn't running at the target URL. |

## 11. Development

### Layout

```
apps/
  server/          Backend: domain logic, REST/SSE/MCP server, `awb` CLI, Vitest tests
    bin/awb.js     CLI entry point
    src/domain/    Projects, tickets, features, claims, blockers, activity
    src/server/    Hono app, routes, auth, config, PGlite/Postgres adapters, migrations
    src/mcp/       MCP server and tool definitions
    src/cli/       `awb` commands
  web/             React + Vite SPA (built to apps/web/dist)
packages/
  shared/          @awb/shared: types shared by server and web
e2e/               Playwright end-to-end tests (local + hosted)
scripts/           Servers used by the e2e tests
docs/              PRD and ADRs (architecture decisions)
Dockerfile         Backend image for hosted mode
```

### Commands

| Command | Description |
|---|---|
| `pnpm start` | Start the backend (`node apps/server/bin/awb.js start`). |
| `pnpm dev` | Start the Vite dev server with hot reload. It proxies `/api` and `/mcp` to `127.0.0.1:4747`, so run `pnpm start` in another terminal. |
| `pnpm build` | Build the web UI into `apps/web/dist`. |
| `pnpm build:demo` | Build the in-browser demo into `apps/web/dist-demo` (see [Browser demo](#browser-demo)). |
| `pnpm test` | Run the backend unit and integration tests (Vitest). |
| `pnpm typecheck` | Type-check everything (`tsc --noEmit`). |
| `pnpm test:e2e` | Build, then run the Playwright tests. Run `pnpm exec playwright install chromium` once first. |

The backend runs TypeScript directly on Node 26, so server changes only need a restart. Only the web UI has a build step.

## 12. Hosting

### Browser demo

The [public demo](https://neaz-mahmood.github.io/Ai-work-board/) is a static build with no backend. `pnpm build:demo` bundles the real REST routes (`apps/server/src/server/apiRoutes.ts`) and PGlite into the web app (`apps/web/src/demo/`). The UI's API calls are answered inside the page, and data is stored in the visitor's IndexedDB. Each visitor gets a private board, seeded with a sample project. **Reset demo** restores that project. MCP, the CLI and auth aren't available in the demo.

`.github/workflows/pages.yml` deploys the demo to GitHub Pages on every push to `main`. To enable it once, go to the repo's **Settings → Pages** and set **Source** to **GitHub Actions**. To preview locally, run `pnpm build:demo && pnpm --filter @awb/web exec vite preview --mode demo --base /Ai-work-board/`.

### Self-hosted backend

You can also deploy the board as a **containerized backend** with a **statically hosted frontend**, so agents on other machines can report to it.

- Local mode is unchanged: it needs no configuration and runs on loopback with embedded PGlite and no auth.
- Data from older SQLite-based versions of the board isn't migrated.

### Backend

Run **one instance only**. Clustering isn't supported because the server is the single writer.

**1. Build the image**

```bash
docker build -t awb .
```

**2. Generate the owner password hash**, either locally with `awb hash-password '<password>'` or with the image:

```bash
docker run --rm awb node apps/server/bin/awb.js hash-password '<password>'
```

> [!NOTE]
> The hash contains `$` characters. Wrap it in single quotes or put it in an `--env-file`.

**3. Run the container**

```bash
docker run -d \
  --name awb \
  -p 4747:4747 \
  -v awb-data:/data \
  -e AWB_ALLOWED_ORIGINS=https://board.example.com \
  -e AWB_OWNER_PASSWORD_HASH='scrypt$...' \
  -e AWB_SESSION_SECRET=your-random-session-secret \
  -e AWB_API_TOKENS=token1,token2 \
  -e DATABASE_URL=postgres://user:password@postgres:5432/awb \
  awb
```

The image already sets `AWB_HOST=0.0.0.0`, `AWB_PORT=4747` and `AWB_HOME=/data`, so it starts in hosted mode. Leave out `DATABASE_URL` to use the embedded PGlite on the `/data` volume.

#### Environment variables

| Variable | Description |
|---|---|
| `AWB_HOST` | Interface to bind (`0.0.0.0` in the image; default `127.0.0.1`). |
| `AWB_PORT` | Port (default `4747`). |
| `AWB_HOME` | Data directory (`/data` in the image; default `~/.ai-work-board`). |
| `AWB_MODE` | Force `local` or `hosted`. If unset, it's inferred from the host. |
| `DATABASE_URL` | PostgreSQL connection string. Optional: without it, PGlite under `AWB_HOME` is used. |
| `AWB_ALLOWED_ORIGINS` | Comma-separated browser origins allowed by CORS, e.g. `https://board.example.com`. |
| `AWB_OWNER_PASSWORD_HASH` | **Required in hosted mode.** Scrypt hash of the owner password (from `awb hash-password`). |
| `AWB_SESSION_SECRET` | **Required in hosted mode.** Secret used to sign UI session cookies. |
| `AWB_API_TOKENS` | **Required in hosted mode.** Comma-separated bearer tokens accepted for the API and MCP. |
| `AWB_TRUST_PROXY` | Set to `true` behind a reverse proxy that sets `X-Forwarded-For`, so login rate limiting uses the real client address. |

#### Persistence, HTTPS and security

- Mount a volume at `/data` or set `DATABASE_URL`. Otherwise the data is lost when the container is removed.
- HTTPS must come from your host or reverse proxy. Hosted-mode cookies are `Secure`, so the browser needs HTTPS to log in.
- Failed sign-ins are limited to 5 per client IP per 15 minutes. Behind a proxy, set `AWB_TRUST_PROXY=true`; otherwise every client shares the proxy's address. Use a long random owner password and long random API tokens.

### Frontend

Build the SPA against your API URL and upload `apps/web/dist` to any static host:

```bash
VITE_API_URL=https://api.board.example.com pnpm build
```

- The frontend must be on the same parent domain as the API (e.g. `board.example.com` and `api.board.example.com`).
- Its origin must be listed in `AWB_ALLOWED_ORIGINS`.

### Agents against a hosted board

Use one of the tokens from `AWB_API_TOKENS`.

**CLI**

```bash
export AWB_URL=https://api.board.example.com
export AWB_TOKEN=<token>
```

**Claude Code**

```bash
claude mcp add --transport http awb "https://api.board.example.com/mcp?actor=claude" --header "Authorization: Bearer <token>"
```

**Cursor** (`~/.cursor/mcp.json` or `<repo>/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "ai-work-board": {
      "url": "https://api.board.example.com/mcp?actor=cursor",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| `awb: command not found` | Run `pnpm setup`, restart your shell, then `pnpm add -g .` again. Or use `node apps/server/bin/awb.js`. |
| Errors at startup about TypeScript or syntax | You need Node.js 26 or newer (`node -v`). |
| `Port 4747 is in use` | Another `awb start` is already running, or something else uses the port. Use `--port 5000` and set `AWB_URL=http://127.0.0.1:5000` for the CLI. |
| `AI Work Board server is not running at …` (exit 3) | Start the server with `awb start`, or point `--url` / `AWB_URL` at the right address. |
| `Hosted mode requires: AWB_OWNER_PASSWORD_HASH, …` | You bound to a non-loopback host or set `--mode hosted`. Set the auth variables, or use `--mode local`. |
| Opening `:4747` returns 404 | Run `pnpm build` so `apps/web/dist` exists, then restart the server. |
| The CLI can't find the project | Run it inside a registered repo, run `awb init` there, or pass `--project KEY`. |
| You want to start fresh | Stop the server and delete `~/.ai-work-board/pgdata` (or your `--data-dir`). **This erases all board data.** |

## 14. Further reading

- [`CONTEXT.md`](CONTEXT.md): domain glossary (Project, Ticket, Claim, Rank, …).
- [`docs/PRD.md`](docs/PRD.md): product requirements and behaviour.
- [`docs/adr/`](docs/adr): architecture decision records (why MCP + CLI, why PGlite/Postgres, single writer, auth model, …).

### A note on deletion

Deletion is available only in the web UI. This is a guardrail, not a security boundary: local mode has no auth, and hosted mode needs the owner password or an API token. Agents have no delete operations in MCP or the CLI, so an automated process can't delete tickets, features or projects.
