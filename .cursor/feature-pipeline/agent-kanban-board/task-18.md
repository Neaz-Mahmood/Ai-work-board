# Task 18: Agent docs and tool guidance

## Context
The AI Work Board is a local Jira-style kanban for AI agents; all features are in place (Projects, Tickets, editing/moving, comments, Blockers, Needs Attention, Features, Claim, live UI). Agents learn how to use a tool from its MCP descriptions and from instructions the user pastes into CLAUDE.md / AGENTS.md. This task writes the README (install, start, MCP setup for Claude Code and Cursor, CLI reference, the paste-ready agent workflow block) and rewrites every MCP tool description so it states the workflow.

The intended workflow: a **planning** agent creates a Feature with its ordered Tickets (they land in Backlog); the user reviews and moves approved Tickets to To Do; **working** agents call `claim_next_ticket`, comment progress, move the Ticket to In Review when done (the user or a reviewer moves it to Done), and call `set_needs_attention` with a reason when stuck. Agents never delete anything.

## Do
- `README.md` at the repo root with sections:
  1. What it is (two sentences). No images or screenshot placeholders.
  2. Requirements: Node 26+, pnpm.
  3. Install: `pnpm install`, `pnpm build`, `pnpm link --global` (exposes `awb`).
  4. Run: `awb start [--port N] [--data-dir DIR] [--open]`; defaults `127.0.0.1:4747`, data in `~/.ai-work-board/board.db`; env `AWB_PORT`, `AWB_HOME`, `AWB_URL`, `AWB_ACTOR`.
  5. Add a project: UI "Add project" or `awb init [--key KEY]` in a repository.
  6. Connect agents:
     - Claude Code: `claude mcp add --transport http ai-work-board "http://127.0.0.1:4747/mcp?actor=claude"`
     - Cursor (`~/.cursor/mcp.json` or `<repo>/.cursor/mcp.json`): `{ "mcpServers": { "ai-work-board": { "url": "http://127.0.0.1:4747/mcp?actor=cursor" } } }`
     - Any shell-capable agent: the `awb` CLI with `--as <name>` or `AWB_ACTOR`.
     - Explain the `actor` URL setting vs per-call `actor` parameter, and that `you` is reserved for the UI.
  7. "Using the AI Work Board" — a fenced markdown block the user pastes into CLAUDE.md / AGENTS.md, describing the workflow above, the five Columns, when to comment, when to flag Needs Attention, and the rule "never move a Ticket to Done yourself unless told to; move it to In Review".
  8. MCP tool reference: one line per tool (all tools: `list_projects`, `create_project`, `get_board`, `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `move_ticket`, `claim_next_ticket`, `add_comment`, `add_blocker`, `remove_blocker`, `set_needs_attention`, `clear_needs_attention`, `list_features`, `get_feature`, `create_feature`, `update_feature`).
  9. CLI reference: every command with its flags, the global flags (`--as`, `--project`, `--json`, `--url`) and exit codes (0 ok, 1 domain error, 2 usage, 3 server not running).
  10. Development: `pnpm dev` (Vite with proxy) + `awb start`, `pnpm test`, `pnpm typecheck`, `pnpm test:e2e`.
  11. Notes: deletion is UI-only and is a guardrail, not security (no auth; loopback only).
- MCP descriptions in `src/mcp/tools/*.ts`: every tool and every parameter gets a description. Tool descriptions say when to use it in the workflow, e.g. `create_feature`: "Planning step: create a Feature and its ordered Tickets in one call. Tickets land in Backlog for the user to approve. Use blockedByIndexes to order work within the list."; `claim_next_ticket`: "Start work: atomically takes the top-ranked unblocked, unassigned To Do Ticket, assigns it to you and moves it to In Progress. Returns {ticket: null} when nothing is available."; `move_ticket`: mention moving to In Review when done; `set_needs_attention`: "Use when you are stuck and need the user."; `project`/`cwd` parameters explain resolution by repository directory.
- `awb --help` and `awb <command> --help` print usage consistent with the README.
- Test `test/mcp-descriptions.test.ts`: every listed tool exists, has a description of at least 40 characters, and every input property has a description; the README mentions every tool name and every CLI command (read `README.md` from disk and check for each name).

## Follow these existing patterns
- `src/mcp/tools/*.ts`, `src/cli/main.ts`, `src/cli/commands/` — where descriptions and help text live.
- `.cursor/feature-pipeline/agent-kanban-board/spec.md` — "MCP tools", "CLI", "Documentation".

## Do not
- Touch files outside: `README.md`, `src/mcp/`, `src/cli/`, `test/`.
- Change tool names, parameters or behaviour; add dependencies; reformat unrelated code; commit.
- Add a command that edits Claude Code / Cursor / agy config files.

## Done when
- README covers install, run, agent setup, the paste-ready workflow block, and full MCP/CLI references; tool descriptions state the workflow.
- `pnpm test && pnpm typecheck` passes.
