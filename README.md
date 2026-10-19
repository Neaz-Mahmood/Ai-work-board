# AI Work Board

## 1. What It Is
The AI Work Board is a local Jira-style kanban board built for orchestrating autonomous AI coding agents across multiple repositories on your machine. It provides a real-time web UI, an embedded Model Context Protocol (MCP) server, and the `awb` CLI so that planning and working agents can coordinate tasks with human oversight.

## 2. Requirements
- Node.js 26+
- pnpm

## 3. Install
Clone the repository and run:
```bash
pnpm install
pnpm build
pnpm link --global
```
This builds both the client UI and the server bundle and links the `awb` executable globally.

## 4. Run
Start the server in the foreground:
```bash
awb start [--port N] [--data-dir DIR] [--open]
```
- By default, the server listens on `127.0.0.1:4747` (loopback only).
- Board data is stored in SQLite at `~/.ai-work-board/board.db`.
- Pass `--open` to launch the web UI in your default browser automatically.

Environment variables:
- `AWB_PORT`: Server port (default: `4747`).
- `AWB_HOME`: Base directory for board database and files (default: `~/.ai-work-board`).
- `AWB_URL`: Server endpoint URL used by the CLI (default: `http://127.0.0.1:4747`).
- `AWB_ACTOR`: Default actor identity for CLI operations (default: `agent`).

## 5. Add a Project
You can register a local repository with the board in two ways:
- **Web UI**: Open `http://127.0.0.1:4747`, click **Add project** in the sidebar, and provide the absolute path to your repository directory.
- **CLI**: In your repository directory, run:
  ```bash
  awb init [--key KEY]
  ```
  Optionally specify `--key KEY` (2-5 uppercase letters); otherwise, a project key is derived automatically from the folder name.

## 6. Connect Agents
Configure your AI agents to connect to the board's MCP server or shell CLI:

### Claude Code
```bash
claude mcp add --transport http ai-work-board "http://127.0.0.1:4747/mcp?actor=claude"
```

### Cursor
Add to your user settings (`~/.cursor/mcp.json`) or repository settings (`<repo>/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "ai-work-board": {
      "url": "http://127.0.0.1:4747/mcp?actor=cursor"
    }
  }
}
```

### Any Shell-Capable Agent
Shell-capable agents can use the `awb` CLI directly:
- Pass the `--as <name>` flag on individual commands.
- Or set the `AWB_ACTOR` environment variable (e.g. `export AWB_ACTOR=agent-1`).

### Actor Attribution
- **URL setting vs. parameter**: Setting `?actor=<name>` in the MCP URL establishes the default actor for all calls on that connection. An explicit `actor` parameter on any write tool call overrides the URL setting. If neither is specified, the actor defaults to `agent`.
- **Reserved name**: The actor name `you` is reserved exclusively for the human user in the web UI. Agents specifying `you` via URL, tool parameter, `--as`, or `AWB_ACTOR` will be rejected.

## 7. Using the AI Work Board
Paste the following block into your project's `CLAUDE.md` or `AGENTS.md` to instruct agents on how to use the board:

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

## 8. MCP Tool Reference
One line per tool:
- `list_projects`: List all registered projects with keys, paths, and column ticket counts.
- `create_project`: Register a repository directory as a new project on the board.
- `get_board`: Retrieve the full kanban board (columns, cards, features, actors) for a project.
- `list_tickets`: Query and filter ticket cards by column, assignee, search query, or feature.
- `get_ticket`: Fetch full ticket details, descriptions, blockers, reverse blocks, comments, and activity log.
- `create_ticket`: Create a new ticket on a project board (defaults to Backlog).
- `update_ticket`: Update ticket title, description, priority, assignee, or feature link.
- `move_ticket`: Move a ticket to a column (backlog, todo, in_progress, in_review, done) and optional rank position (move to In Review when done).
- `claim_next_ticket`: Atomically claim the top-ranked unblocked To Do ticket, assign to caller, and move to In Progress.
- `add_comment`: Append a markdown comment to a ticket to report progress or technical notes.
- `add_blocker`: Mark a ticket as blocked by another ticket within the same project.
- `remove_blocker`: Remove a blocker relationship between two tickets.
- `set_needs_attention`: Flag a ticket as needing human user attention with an explanatory reason.
- `clear_needs_attention`: Clear the needs-attention flag from a ticket.
- `list_features`: List all features in a project with completion progress metrics.
- `get_feature`: Fetch feature details, progress metrics, and associated tickets.
- `create_feature`: Planning step: create a Feature and its ordered Tickets in one call into Backlog.
- `update_feature`: Update a feature's name, description, or badge color.

## 9. CLI Reference
All commands support the following global flags:
- `--as <actor>`: Actor name for change attribution (overrides `AWB_ACTOR`; default: `agent`; `you` is reserved).
- `--project <KEY>`: Target project key (overrides directory resolution).
- `--json`: Format command output as JSON.
- `--url <url>`: Target server URL (overrides `AWB_URL`; default: `http://127.0.0.1:4747`).

Exit codes:
- `0`: Success (OK)
- `1`: Domain error (validation failure, conflict, cycle detected; printed to stderr)
- `2`: Usage error (invalid flag or argument, reserved actor name 'you')
- `3`: Server not running ("AI Work Board server is not running at <url>. Run `awb start`.")

Commands:
- `awb start [--port N] [--data-dir DIR] [--open]`: Run the server in the foreground (`--open` opens the browser).
- `awb init [--key KEY] [--name NAME] [--path DIR]`: Register the current or specified directory as a project.
- `awb projects`: List all registered projects.
- `awb board`: Show kanban board columns with ticket keys and titles for the current project.
- `awb claim [--feature ID]`: Claim the next eligible unblocked To Do ticket and move it to In Progress.
- `awb ticket list [--column C] [--feature ID] [--assignee NAME] [--query TEXT]`: List tickets on the project board.
- `awb ticket show KEY`: Show full ticket details, blockers, comments, and activity log.
- `awb ticket create TITLE [-d TEXT | --description-file FILE] [--column C] [--priority P] [--feature ID] [--assignee NAME] [--blocked-by KEY ...]`: Create a ticket.
- `awb ticket update KEY [--title] [-d | --description-file] [--priority] [--feature ID|none] [--assignee NAME|none]`: Update ticket fields.
- `awb ticket move KEY COLUMN [--position N]`: Move ticket to a column (`backlog`, `todo`, `in-progress`, `in-review`, `done`) and optional position.
- `awb ticket comment KEY TEXT` (or `--file FILE`): Add a markdown comment to a ticket.
- `awb ticket block KEY --by BLOCKER`: Block a ticket by another ticket.
- `awb ticket unblock KEY --by BLOCKER`: Unblock a ticket from another ticket.
- `awb ticket attention KEY REASON` / `awb ticket attention KEY --clear`: Set or clear the needs-attention flag on a ticket.
- `awb feature list`: List features with progress metrics.
- `awb feature show ID`: Show feature details, description, and tickets.
- `awb feature create NAME [-d TEXT] [--color HEX] [--tickets-file FILE.json]`: Create a feature with optional ordered tickets from JSON file.
- `awb feature update ID [--name] [-d] [--color]`: Update a feature's name, description, or color.

## 10. Development
- `apps/web` (Vite SPA, built to `apps/web/dist`), `apps/server` (domain, REST/SSE/MCP server, `awb` CLI, tests) and `packages/shared` (`@awb/shared` types).
- `pnpm dev`: Start Vite development server with proxy to backend.
- `awb start`: Start backend server.
- `pnpm test`: Run backend unit and integration test suites with Vitest.
- `pnpm typecheck`: Run TypeScript type checking (`tsc --noEmit`).
- `pnpm test:e2e`: Run Playwright end-to-end tests.

## 11. Notes
Deletion is UI-only and is a guardrail, not security (no auth; loopback only). Agents have no delete operations in MCP or CLI, preventing an automated process from deleting tickets, features, or projects.
# Ai-work-board
