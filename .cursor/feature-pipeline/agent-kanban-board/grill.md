# Grill: agent-kanban-board

## Round 1

Facts checked: empty repo; Node v26.8.1, pnpm 11.25.0; claude, cursor-agent, agy installed; codex/gemini not installed.

- Q1 How do agents write to the board? (a) board is source of truth + MCP/CLI, (b) mirror pipeline files, (c) both. Rec: (c) staged — v1 MCP+CLI, pipeline-folder sync later.
- Q2 Does the board start agents or only track? Rec: tracker only in v1; dispatcher later.
- Q3 3 or 5 columns; fixed or per-project? Rec: 5 fixed (Backlog, To Do, In Progress, In Review, Done); `needs attention` is a card flag.
- Q4 Human editing? Rec: full editing (drag/drop, create, edit, comment); last write wins; activity log records actor.
- Q5 What is a Project? Rec: one local repo with name, absolute path, unique 2–5 letter key; tickets `<KEY>-<n>`.
- Q6 Terms. Rec: Ticket (card, = task-NN.md), Feature (= pipeline slug, epic-like label); "Task" not a board term.
- Q7 Storage. Rec: one global SQLite DB (~/.ai-work-board/board.db), WAL.
- Q8 Stack. Rec: TS + Node + pnpm, Hono/Fastify, React+Vite, SQLite; 127.0.0.1, no auth; no Electron.
- Q9 Jira fidelity. Rec: Jira look (sidebar projects, header search + quick filters, column counts, Jira cards, detail modal w/ markdown, activity, comments); no sprints/swimlanes/points; light theme first.

### Answers
- Q1: **(a)** — board is source of truth with MCP server + CLI. No pipeline-file sync (not v1, not planned).
- Q2–Q9: accept recommendations as stated.

## Round 2

Planner wrote CONTEXT.md and ADRs 0001–0003.

- Q1 Agent↔server topology. (a) server-centric: one local server (port 4747) serves UI, REST, MCP over Streamable HTTP; CLI is thin client. (b) shared library: CLI + stdio MCP open SQLite directly. Rec: (a).
- Q2 Agent Actor identity. Rec: free-form name per call (`--as`/AWB_ACTOR, MCP param or ?actor=), auto-registered; missing → `agent`. Human = "you".
- Q3 Project resolution/creation. Rec: explicit key wins, else walk up from cwd; error points to `awb init`. Agents and UI can create Projects; key derived from folder name.
- Q4 Ticket fields. Rec: key, title, markdown description, Column, rank, Feature?, assignee?, priority (5 Jira levels, default Medium), blocked-by (same project), Needs Attention flag + reason, comments, Activity, timestamps. No types/labels/due/points/attachments.
- Q5 Feature data. Rec: belongs to Project; name, markdown description, colour, derived progress; one-call create feature + tickets; deleting Feature keeps Tickets.
- Q6 Moves/claiming. Rec: all moves allowed; `claim_next_ticket` atomically takes top To Do ticket with all blockers Done and not Needs Attention; blocked-by only shows a marker.
- Q7 Order. Rec: manual rank (drag), new at bottom, claim takes top rank; priority display only.
- Q8 Delete/archive. Rec: only human deletes in UI; no agent delete; Done shows all in v1.
- Q9 Install. Rec: global `awb` via pnpm link; README MCP snippets for Claude Code/Cursor + agent-usage text; no config-editing helper.

### Answers
- Q1: (a) server-centric.
- Q2–Q9: accept recommendations as stated.

## Round 3

FRONTIER EMPTY. Planner added ADR 0004 (single local server is the only writer) and extended CONTEXT.md (Rank, Priority, Blocker, Claim, Assignee). Restatement shown to user; awaiting confirmation.
Deferred to spec: exact MCP tool + CLI command list, REST routes, live updates (SSE), test seams.

User confirmed shared understanding.
