# Product Requirements — AI Work Board

_Vocabulary follows [`CONTEXT.md`](../CONTEXT.md). Decisions in [`docs/adr/0001`](adr/0001-board-is-source-of-truth-agents-use-mcp-and-cli.md)–[`0010`](adr/0010-in-process-write-mutex.md) are binding. ADR 0003 is superseded by 0005; ADR 0004 is amended by 0006._

This document describes the **shipped** product (v1 + v2 merged). It is a single canonical reference; the operator manual lives in [`README.md`](../README.md) and the rationale for every load-bearing decision lives in the ADRs.

---

## 1. Problem Statement

I run several AI coding agents locally (Claude Code, Cursor, agy). When I plan a feature, an agent breaks it into pieces of work and other agents carry them out, but there is no single place where I can see what was planned, what each agent is working on, what is waiting for review, and what is stuck. The work lives in agent transcripts and scattered files, across several repositories. I want a Jira-style board on my own machine that agents write to themselves, so I can watch and steer their work the way I would a human team's.

The board only runs on my laptop: it binds to a private address, the user interface ships from the same process, and the data sits in one file under my home directory. I cannot reach it from another machine, cannot put the data behind a real remote database, and cannot have agents on another machine report to it.

Ticket and Feature descriptions are written as raw markdown in a plain textarea — awkward for the structured notes I make and tweak by hand. And dragging cards on the Board feels laggy: the whole Board re-renders while I drag, cards do not make room in the target Column, and the Board re-fetches multiple times after every drop, so cards jump.

I want one place that holds the truth about planned and ongoing work, that agents and I can both write and read through programmatic interfaces, that I can host on a server if I want, that lets me edit descriptions in a familiar rich-text editor over markdown, and that keeps drag and drop smooth.

## 2. Solution

The AI Work Board is a Jira-style kanban board, run on the user's own machine or hosted on a server, where AI coding agents and the human who drives them record and track the work they plan and carry out across their local codebases.

It is a web app served by one backend process on `127.0.0.1:4747` (loopback) in **local mode**, or by one containerized backend instance on any host in **hosted mode**. The backend serves the REST API, the SSE live-update stream, the MCP (Model Context Protocol) server for agents, and — in local mode only — the static web app. It owns the database and is the only writer.

Each Project on the Board is one code repository, identified by an absolute path on the agent's machine and a Project Key of 2–5 uppercase letters. Every Project has exactly one Board with five fixed Columns: **Backlog**, **To Do**, **In Progress**, **In Review**, **Done**.

Three surfaces let agents and the human read and write the Board:

- **Web UI** (the human, Actor `you`) — drag cards, edit Tickets in a modal, manage Features, see live updates.
- **MCP server** at `/mcp` (Streamable HTTP) — 18 typed tools, no delete tools, stateless per request.
- **`awb` CLI** — a thin HTTP client of the same backend; every command has a human form and `--json`.

Every write is recorded as an Activity entry naming the Actor who made it. The Board only tracks agents; it never launches them (ADR 0002). A README paste-block (see [`README.md` §7](../README.md)) tells agents the workflow: plan into Backlog, Claim from To Do, move to In Review when done, flag Needs Attention when stuck.

---

## 3. Personas

### 3.1 The human user (Actor `you`)

The driver. Starts the Board (`awb start [--open]`), adds Projects from the UI or via `awb init`, creates and edits Tickets, comments, reorders by Rank, drags cards across Columns, deletes Tickets / Features / Projects from the UI, and moves Tickets to **Done** after reviewing ones in **In Review**. Identified in Activity and on cards as Actor `you`. In hosted mode, this person is also the sole owner authenticated by password and session cookie; `you` is reserved for them across every surface.

### 3.2 The planning agent

A model that turns a goal into a plan. It creates a Feature together with its ordered Tickets in one call (`create_feature` / `awb feature create`), using `blockedByIndexes` to express intra-Feature ordering before keys exist. Its output lands in **Backlog** for the user's review. Identifies itself through `?actor=` on the MCP URL, an `actor` parameter on individual calls, `--as` on the CLI, or the `AWB_ACTOR` environment variable. Does not delete. Does not Claim its own Tickets.

### 3.3 The working agent

A model that executes Tickets. It Calls `claim_next_ticket` / `awb claim` to atomically take the top-ranked, unblocked, unassigned, not-flagged To Do Ticket. Comments progress as markdown (`add_comment` / `awb ticket comment KEY`). On finishing, it moves the Ticket to **In Review** — never to **Done** — and stops. If blocked, it sets Needs Attention with a reason (`set_needs_attention`); once unblocked, it clears the flag (`clear_needs_attention`). Never deletes. Many working agents can run in parallel; Claim is atomic, so two agents cannot obtain the same Ticket.

### 3.4 The host operator (hosted mode only)

The person who deploys the backend container and the static frontend. Provisions the database (an external Postgres given by `DATABASE_URL`, or the embedded PGlite in `/data`), the reverse proxy / TLS, and the same-parent-domain frontend URL (frontend on `board.example.com` with backend on `api.board.example.com`, so the cookie is same-site). Sets `AWB_OWNER_PASSWORD_HASH`, `AWB_SESSION_SECRET`, and at least one entry in `AWB_API_TOKENS`. Lists allowed browser origins in `AWB_ALLOWED_ORIGINS`. Distributes API tokens to agent operators. Sets `AWB_TRUST_PROXY=true` behind a proxy so login rate limiting uses the forwarded client IP.

---

## 4. User Stories

Voice: *As a [persona], I want [outcome], so that [reason].*

### 4.1 Running the Board

1. As the user, I want to start the Board with one command (`awb start`), so that I do not have to remember build steps.
2. As the user, I want local mode to listen only on a loopback address, so that nothing on my network can reach it.
3. As the user, I want the Board's data stored in one place under my home directory in local mode, so that all Projects live together and my repositories stay free of Board files.
4. As the user, I want to change the host, port, and data directory with flags or environment variables, so that I can avoid clashes and run a scratch copy.
5. As the user, I want `awb` available globally on my machine, so that agents in any repository can call it.
6. As an agent, I want a clear error telling me to run `awb start` when the server is not running, so that I can report the problem instead of failing silently.
7. As the user, I want local mode to keep zero-setup — no login, no configuration, no database server — so that I can be productive the first time.
8. As the user, I want to deploy the backend as one Docker image configured only by environment variables, so that I can host it on any provider.
9. As the user, I want hosted mode to store data in a Postgres database given by `DATABASE_URL`, so that my Board data lives in a real remote database.
10. As the user, I want hosted mode and local mode to behave identically apart from storage, auth, and the bundled UI, so that agents and I do not learn two Boards.
11. As the user, I want the backend to refuse to start in hosted mode when auth is not fully configured, naming every missing variable, so that I cannot expose an open Board by mistake.
12. As the user, I want exactly one backend instance to own the data, so that Claims and Rank changes stay correct and live updates reach every open Board.
13. As the user, I want existing data from older SQLite-based boards left untouched, so that nothing is silently imported or deleted.

### 4.2 Projects

14. As the user, I want to add a Project from the UI by giving a repository path, so that I can start tracking work in that repository.
15. As an agent, I want to run `awb init` (or call `create_project`) inside a repository, so that I can set up a Project without waiting for the user.
16. As the user, I want a Project Key derived from the folder name when I do not give one (for example `ai-work-board` → `AWB`), so that Ticket keys are short and recognisable.
17. As the user, I want key collisions resolved automatically by appending a digit within the 5-character cap, so that adding a Project never fails because of a key clash.
18. As the user, I want to choose a Project Key myself, so that I can match names I already use.
19. As the user, I want to see all Projects in a sidebar, so that I can switch between Boards quickly.
20. As an agent, I want my Project found from my current directory, so that I do not have to know or pass the key.
21. As an agent, I want to pass an explicit Project Key that overrides directory lookup, so that I can work on a Project from anywhere.
22. As an agent, I want the deepest registered Project path containing my directory to win when Projects are nested, so that lookup is predictable.
23. As an agent, I want a helpful error naming `awb init` when no Project matches my directory, so that I know how to fix it.
24. As the user, I want to rename a Project, so that its display name stays accurate.
25. As the user, I want to delete a Project from the UI (after confirming), so that I can remove abandoned work.
26. As the user, I want registering the same normalized path twice rejected, so that a repository never has two Boards.
27. As an agent, I want `awb init` and Project lookup from my current directory to work against a hosted backend, so that my workflow does not change.
28. As an agent, I want my CLI or MCP client to resolve symlinks and normalize the repository path on my own machine, so that the server never needs to see my filesystem.
29. As the user, I want the server to accept a Project path without checking that it exists on the server, so that hosted Projects can point at repositories on my laptop.
30. As an agent working from a clone at a different path, I want to pass the Project Key explicitly, so that I can still reach the right Board.

### 4.3 The Board

31. As the user, I want each Project to have exactly one Board with the five fixed Columns (Backlog, To Do, In Progress, In Review, Done), so that every Project reads the same way.
32. As the user, I want each Column header to show its Ticket count, so that I can see the shape of the work at a glance.
33. As the user, I want cards that look like Jira cards — key, title, Feature label in its colour, Assignee avatar, Priority icon — so that the Board is familiar.
34. As the user, I want a "blocked" marker on any card with an unfinished Blocker, so that I can see why it is not being picked up.
35. As the user, I want a visible Needs Attention marker on flagged cards with the reason in a tooltip, so that stuck work stands out.
36. As the user, I want to drag a card to another Column, so that I can change its state directly.
37. As the user, I want to drag cards up and down within a Column, so that I can set the Rank that decides what gets worked on next.
38. As the user, I want to search Tickets by key, title, or description from the Board header, so that I can find one quickly.
39. As the user, I want quick filters by Feature and by Assignee, so that I can focus on one Feature or one agent.
40. As the user, I want changes made by agents to appear on the Board without reloading, so that I can watch work happen live.
41. As the user, I want Done to show all completed Tickets, so that nothing disappears.
42. As the user, I want a friendly empty state when there are no Projects or no Tickets, so that I know what to do first.

### 4.4 Tickets

43. As the user, I want to create a Ticket from the Board (Jira's "+ Create" at the bottom of a Column), so that I can add work myself.
44. As an agent, I want to create a Ticket with title, markdown description, Priority, Feature, Column, and Blockers, so that I can record planned work fully in one call.
45. As the user, I want each Ticket to get a key like `AWB-12` that is never reused even after deletes, so that references in comments and commits stay unambiguous.
46. As the user, I want new Tickets to go to the bottom of their Column, so that existing Rank is not disturbed.
47. As the user, I want new Tickets to land in Backlog unless another Column is given, so that agent-planned work waits for my approval.
48. As the user, I want to open a Ticket in a detail modal over the Board (with its key in the URL), so that I can read and edit it without losing my place and share a link to it.
49. As the user, I want to edit title, description, Priority, Feature, and Assignee in the modal, so that I can correct agent output.
50. As the user, I want descriptions and comments rendered as formatted markdown when reading, so that agents' structured notes are readable.
51. As the user, I want to set Priority on Jira's five levels (Highest, High, Medium, Low, Lowest) with Medium as default, so that importance is visible on the card.
52. As the user, I want Priority to have no effect on Rank, so that only my explicit ordering decides what gets Claimed.
53. As an agent, I want to move a Ticket to any Column, so that I can reflect my real progress (there are no forbidden transitions in the tool itself).
54. As an agent, I want to assign or unassign a Ticket, so that ownership is accurate.
55. As the user, I want at most one Assignee per Ticket, so that ownership is clear.
56. As the user, I want to delete a Ticket from the UI (after confirming), so that I can remove mistakes.

### 4.5 Blockers

57. As an agent, I want to say a Ticket is blocked by other Tickets in the same Project, so that work happens in the right order.
58. As the user, I want Blockers to be shown on the card and in the modal, so that I understand dependencies.
59. As the user, I want Blockers that would form a cycle (or block a Ticket on itself, or cross Projects) to be rejected, so that work can never be blocked forever.
60. As the user, I want Blockers to never stop me or an agent from moving a Ticket manually, so that I stay in control.
61. As the user, I want deleting a Ticket to remove it as a Blocker from others, so that nothing stays blocked by a ghost.

### 4.6 Claiming

62. As a working agent, I want to Claim the next Ticket in one call, so that I can start work without searching the Board.
63. As a working agent, I want Claim to pick only To Do Tickets that are unassigned, not flagged, and whose Blockers are all Done, so that I never start work that cannot be done.
64. As a working agent, I want Claim to take the top-Ranked eligible Ticket, so that the user's ordering is respected.
65. As a working agent, I want Claim to be atomic, so that two agents never get the same Ticket.
66. As a working agent, I want Claim to assign the Ticket to me and move it to the bottom of **In Progress**, so that the Board reflects that I have started.
67. As a working agent, I want to optionally limit Claim to one Feature, so that I can work through a single plan.
68. As a working agent, I want a clear "nothing to claim" result rather than an error, so that I can stop cleanly.

### 4.7 Needs Attention

69. As an agent, I want to flag a Ticket Needs Attention with a reason, so that the user knows I am stuck and why.
70. As the user, I want the flag to leave the Ticket in its Column, so that I can see where in the workflow it got stuck.
71. As the user or an agent, I want to clear the flag, so that the Ticket can continue.
72. As the user, I want the reason shown in the modal and as a tooltip on the card marker, so that I can act without digging.

### 4.8 Features

73. As a planning agent, I want to create a Feature together with its ordered Tickets in one call, so that "plan, break into Tickets, write them on the Board" is one step.
74. As a planning agent, I want Tickets in that call to name Blockers among each other by their position in the list (`blockedByIndexes`), so that I can express order before the keys exist.
75. As the user, I want each Feature to have a name, optional markdown description, and a colour, so that its cards are easy to spot.
76. As the user, I want a colour picked automatically if none is given, so that Features look distinct without effort.
77. As the user, I want Feature names unique within a Project, so that filters and references are unambiguous.
78. As the user, I want to see each Feature's progress (Done count / total), so that I know how far a plan has got.
79. As the user, I want to edit a Feature's name, description, and colour, so that I can tidy up agent output.
80. As the user, I want deleting a Feature to keep its Tickets and only remove their Feature link, so that no work is lost.
81. As an agent, I want to list Features and read one with its Tickets, so that I can find the plan I am executing.

### 4.9 Actors, comments, and Activity

82. As an agent, I want to name myself with `--as`, `AWB_ACTOR`, an `actor` tool parameter, or an `actor` setting on my MCP URL, so that my changes are attributed to me.
83. As the user, I want calls with no name recorded under Actor `agent` rather than refused, so that a misconfigured agent still works.
84. As the user, I want my own changes in the UI recorded as Actor `you`, and agents prevented from using that name, so that I can tell my changes from theirs.
85. As the user, I want new Actor names registered on first use with a generated avatar colour, so that I can tell agents apart on cards.
86. As an agent, I want to add markdown comments to a Ticket, so that I can report progress, findings, and hand-offs.
87. As the user, I want to comment on a Ticket from the modal, so that I can give agents instructions.
88. As the user, I want every change to a Ticket recorded in its Activity with Actor, time, and before/after values, so that I can see who did what, including when I overrode an agent.
89. As the user, I want the latest write to win when two Actors change the same Ticket, so that the Board never blocks on conflicts, with Activity showing the sequence.

### 4.10 Agent setup

90. As the user, I want README snippets that add the Board's MCP server to Claude Code and to Cursor, so that setup is copy-paste.
91. As the user, I want a short "how to use the Board" text to paste into `CLAUDE.md` or `AGENTS.md`, so that agents follow the same workflow (plan into Backlog, Claim from To Do, move to In Review when done, flag Needs Attention when stuck).
92. As an agent, I want a `--json` output mode on every CLI command, so that I can parse results reliably.
93. As an agent, I want `AWB_URL` and `AWB_TOKEN` to point the CLI at a hosted backend with a Bearer token, so that I can work against a remote Board.
94. As an agent, I want an `Authorization: Bearer <token>` header on MCP requests, so that Claude Code and Cursor can use the hosted Board.
95. As the user, I want to configure several API tokens in `AWB_API_TOKENS` (one per machine, for example), so that I can retire one by redeploying without breaking the others.
96. As an agent, I want a clear error telling me to set `AWB_TOKEN` when my token is missing or rejected, so that I can tell an auth problem apart from a server that is not running.
97. As the user, I want a token only to grant access, while agents still name themselves with `--as`, `AWB_ACTOR`, or `actor`, so that Activity keeps showing which agent did what.
98. As the user, I want agents still unable to act as `you`, even with a valid token, so that my own Activity cannot be impersonated by mistake.
99. As the user, I want requests without valid credentials rejected on the API, the live-update stream, and MCP alike, so that there is no unguarded door.

### 4.11 Separate frontend and hosting

100. As the user, I want the user interface built as a static app I can host on any CDN, so that frontend and backend deploy independently.
101. As the user, I want to set the backend address when building the frontend (`VITE_API_URL`), so that the same frontend code works locally and against my hosted backend.
102. As the user, I want the frontend to default to the same origin when no backend address is set, so that local mode needs no configuration.
103. As the user, I want the backend to accept browser requests only from frontend origins I list (`AWB_ALLOWED_ORIGINS`), so that other websites cannot use my Board through my browser.
104. As the user, I want CLI and MCP requests unaffected by the origin allowlist, so that agents connect without browser rules getting in the way.
105. As the user, I want live updates to keep working when the frontend and backend are on different subdomains of the same parent, so that the hosted Board is as live as the local one.
106. As a developer, I want the frontend dev server to keep proxying to a local backend, so that development stays a single command away.

### 4.12 Signing in (hosted mode)

107. As the user, I want to sign in to the hosted Board with a single owner password, so that only I can see and change it.
108. As the user, I want my password stored only as a hash in the server configuration, so that the plain password never sits on the server.
109. As the user, I want to stay signed in for 30 days on a browser, so that I do not log in every visit.
110. As the user, I want my browser session kept in a secure, script-inaccessible cookie, so that a malicious script cannot steal it.
111. As the user, I want to see a login screen whenever I am not signed in, so that it is obvious why the Board is not showing.
112. As the user, I want a wrong password rejected with a clear message, so that I know to retry.
113. As the user, I want to sign out, so that I can end my session on a shared machine.
114. As the user, I want everything I do in the browser recorded as Actor `you`, so that Activity stays readable.
115. As the user, I want failed sign-ins limited per client IP, so that brute-force guessing does not get through.

### 4.13 Rich text descriptions

116. As the user, I want to edit a Ticket's description in a rich text editor, so that I can format notes without writing markdown syntax.
117. As the user, I want to edit a Feature's description in the same editor, so that both kinds of description feel the same.
118. As the user, I want headings (H1–H3), bold, italic, strikethrough, inline code, code blocks, bullet, numbered and task lists, links, blockquotes, horizontal rules, and tables, so that I can write structured specs and checklists.
119. As the user, I want a compact toolbar for those formats, so that I can find them with the mouse.
120. As the user, I want markdown typing shortcuts (for example `## `, `- `, `[] `, three backticks), so that I can format quickly from the keyboard.
121. As the user, I want descriptions to keep rendering as formatted markdown when I am not editing, so that reading stays fast and unchanged.
122. As the user, I want to click the description or the Edit button to start editing, and Save or Cancel explicitly, so that I never change a description by accident.
123. As the user, I want Cmd/Ctrl+Enter to save and Esc to cancel, so that editing is keyboard-friendly.
124. As the user, I want opening and saving a description without changes to leave its text exactly as it was, so that the editor never rewrites what agents wrote.
125. As an agent, I want to keep writing and reading descriptions as markdown through MCP and the CLI, so that my interface does not change.
126. As the user, I want search to keep matching description text, so that finding Tickets works as before.
127. As the user, I want formats that markdown cannot hold (images, underline, colours, fonts, alignment, mentions) left out of the editor, so that what I see is what gets stored.
128. As the user, I want comments to stay a plain markdown text box, so that short notes remain quick.
129. As the user, I want inline Ticket creation on the Board to stay title-only, so that capturing work stays fast; I add a description in the Ticket modal.

### 4.14 Drag and drop and keyboard moves

130. As the user, I want dragging a card to feel smooth and immediate, with no stutter on a full Board, so that rearranging work is pleasant.
131. As the user, I want a drag preview that follows my pointer, so that I can see what I am moving.
132. As the user, I want a line showing exactly where the card will land — above or below the card I am hovering — so that drops are predictable.
133. As the user, I want to drop a card on an empty part of a Column to put it at the bottom, so that moving to a Column is easy.
134. As the user, I want the target Column highlighted while I hover it, so that I know where the card will go.
135. As the user, I want the card to appear in its new place immediately on drop, without jumping back or flickering, so that the Board feels responsive.
136. As the user, I want a failed move rolled back with an error message, so that the Board never shows a state the server rejected.
137. As the user, I want live updates from agents not to disturb a drag in progress, and to show up right after I drop, so that I do not lose my drag and do not miss changes.
138. As the user, I want reordering within a Column to set Rank exactly as before, so that Claim order follows my arrangement.
139. As the user, I want dragging to keep working while search or filters hide some cards, with the drop placed relative to the visible card I hovered, so that I can rearrange a filtered view.
140. As a keyboard user, I want to move a focused card up or down within its Column with Alt+↑ / Alt+↓, so that I can set Rank without a mouse.
141. As a keyboard user, I want a "Move to Column" action on a card, so that I can change its Column without a mouse.
142. As a screen-reader user, I want each move announced through a polite live region, so that I know where the card ended up.
143. As the user, I want moves to keep being recorded in Activity as by `you`, so that history stays complete.

### 4.15 Correctness under load

144. As a working agent, I want concurrent Claims from several agents to never hand the same Ticket to two of us, so that work is not duplicated.
145. As the user, I want Ranks to stay gapless and consistent when several moves arrive at once, so that ordering never corrupts.
146. As the user, I want every existing Board behaviour (Blockers, Claim, Activity, Features, filters, live updates) to work the same after the database change, so that nothing regresses.

### 4.16 Documentation as contract

147. As a maintainer, I want the README, CLI help text, and MCP tool descriptions to be checked for consistency in tests, so that docs cannot drift away from behaviour.

---

## 5. Agent Workflow Contract (invariants)

The non-negotiable rules that govern how agents interact with the Board. These are restated here so the PRD is self-contained; the paste-ready text for `CLAUDE.md` / `AGENTS.md` lives in [`README.md` §7](../README.md).

- Agents move finished work to **In Review**. They **never** move a Ticket to **Done** themselves. The human reviews and moves to **Done**. (The reason: the human, not the agent, is the verifier of completed work.)
- Agents **cannot delete** Tickets, Features, or Projects through MCP or the CLI. Deletion is UI-only, exists as a guardrail against a misbehaving agent, and is therefore not security — local mode has no auth at all (see ADR 0009, [§3.4](#34-the-host-operator-hosted-mode-only)).
- Actor name **`you`** is reserved for the human user in the web UI. Agents specifying `you` via the MCP URL, an `actor` parameter, `--as`, or `AWB_ACTOR` are rejected. A token never impersonates `you`.
- Agents land new Tickets in **Backlog** by default; the move from Backlog to To Do is the user's approval gate and the point at which a Ticket becomes Claimable.
- **Claim** is the only entry point to work. It is atomic: in one transaction it assigns the Ticket to the calling Actor, moves it to the bottom of **In Progress**, and writes a `claimed` Activity entry. Concurrent Claims cannot hand the same Ticket to two agents.
- **Rank** (manual position in a Column) decides what Claim takes. **Priority** is display-only and never affects Rank.
- Five fixed Columns — Backlog, To Do, In Progress, In Review, Done — identical for every Project. The columns cannot be reordered, hidden, or customised.
- All Ticket descriptions stay stored as markdown. The rich-text editor round-trips markdown; agents and the CLI read and write markdown unchanged.

---

## 6. Architecture Decisions (summary)

Full text and rationale live in [`docs/adr/`](adr/). Cited in code and in the §4 stories that flow from them.

| #   | Title                                                                                                                 | Status                      |
| --- | --------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 0001 | [Board is source of truth; agents write via MCP and CLI](adr/0001-board-is-source-of-truth-agents-use-mcp-and-cli.md) | accepted                    |
| 0002 | [Board tracks agents; it does not launch them](adr/0002-board-tracks-agents-does-not-launch-them.md)                   | accepted                    |
| 0003 | One global SQLite database                                                                                            | superseded by 0005          |
| 0004 | One local server is the only writer                                                                                   | amended by 0006             |
| 0005 | [Postgres when hosted, PGlite locally](adr/0005-postgres-hosted-pglite-local.md)                                       | accepted                    |
| 0006 | [Separate frontend; one backend instance stays the only writer](adr/0006-separate-frontend-single-backend-instance.md) | accepted (amends 0004)      |
| 0007 | [Project path is client-normalized](adr/0007-project-path-is-client-normalized.md)                                     | accepted                    |
| 0008 | [Descriptions stay markdown](adr/0008-descriptions-stay-markdown.md)                                                   | accepted                    |
| 0009 | [Single owner, env-configured auth, hosted only](adr/0009-single-owner-auth-hosted-only.md)                           | accepted                    |
| 0010 | [In-process write mutex](adr/0010-in-process-write-mutex.md)                                                          | accepted                    |

---

## 7. Reference Appendix

### 7.1 MCP tools (18, zero deletes)

Streamable HTTP at `/mcp`, stateless per request. Every write tool accepts an optional `actor` parameter that overrides the connection's `?actor=`. Project-scoped tools accept `project` (key) or `cwd`. Results are JSON text content; errors are returned with `isError: true` as `"CODE: message"`.

**Projects (2)** — `list_projects`, `create_project`
**Tickets (12)** — `get_board`, `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `move_ticket`, `claim_next_ticket`, `add_comment`, `add_blocker`, `remove_blocker`, `set_needs_attention`, `clear_needs_attention`
**Features (4)** — `list_features`, `get_feature`, `create_feature`, `update_feature`

> **Note: no delete tools exist by design.** Deletion is UI-only (Ticket, Feature, Project); see §5 invariant.

### 7.2 CLI (`awb`)

Global options: `--as <actor>` (else `AWB_ACTOR`), `--project <KEY>` (else resolved from the current directory), `--json`, `--url <url>` (else `AWB_URL`); for hosted mode, set `AWB_TOKEN`.

Commands:

- `awb start [--host H] [--port N] [--data-dir DIR] [--open] [--mode local|hosted]` — run the server in the foreground; `--open` opens the browser (local mode only).
- `awb hash-password [<password>]` — produce a scrypt hash for `AWB_OWNER_PASSWORD_HASH`.
- `awb init [--key KEY] [--name NAME] [--path DIR]` — register the current or given directory as a Project.
- `awb projects` — list registered Projects.
- `awb board` — show the kanban Board for the current Project (Ticket keys and titles per Column).
- `awb claim [--feature ID]` — Claim the next eligible unblocked To Do Ticket; prints "Nothing to claim" and exits 0 when there is none.
- `awb ticket list [--column C] [--feature ID] [--assignee NAME] [--query TEXT]`
- `awb ticket show KEY`
- `awb ticket create TITLE [-d TEXT | --description-file FILE] [--column C] [--priority P] [--feature ID] [--assignee NAME] [--blocked-by KEY ...]`
- `awb ticket update KEY [--title TITLE] [-d TEXT | --description-file FILE] [--priority P] [--feature ID|none] [--assignee NAME|none]`
- `awb ticket move KEY COLUMN [--position N]` — `COLUMN` accepts `backlog | todo | in-progress | in-review | done` (case-insensitive, `_` or `-`).
- `awb ticket comment KEY [TEXT] [--file FILE]`
- `awb ticket block KEY --by BLOCKER` / `awb ticket unblock KEY --by BLOCKER`
- `awb ticket attention KEY [REASON]` / `awb ticket attention KEY --clear`
- `awb feature list` / `awb feature show ID`
- `awb feature create NAME [-d TEXT] [--color HEX] [--tickets-file FILE.json]`
- `awb feature update ID [--name NAME] [-d TEXT] [--color HEX]`

Exit codes:

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| 0    | Success                                                 |
| 1    | Domain error (validation, conflict, cycle detected) — message on stderr |
| 2    | Usage error (bad flag/argument; reserved actor name `you`) |
| 3    | Server not running — `AI Work Board server is not running at <url>. Run \`awb start\`.` |
| 4    | Authentication failed (set `AWB_TOKEN` against hosted mode) |

### 7.3 REST endpoints

Base `/api`. JSON in/out; errors are `{ "error": { "code", "message" } }` with `400`/`404`/`409`/`401` status.

- Public — `GET /api/health`, `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/logout`.
- Projects — `GET /api/projects`, `POST /api/projects`, `GET /api/projects/resolve?cwd=`, `GET /api/projects/:key`, `PATCH /api/projects/:key`, `DELETE /api/projects/:key` (UI only).
- Board and Tickets — `GET /api/projects/:key/board`, `GET /api/projects/:key/tickets`, `POST /api/projects/:key/tickets`, `POST /api/projects/:key/claim`, `GET /api/tickets/:ticketKey`, `PATCH /api/tickets/:ticketKey`, `DELETE /api/tickets/:ticketKey` (UI only), `POST /api/tickets/:ticketKey/move`, `POST /api/tickets/:ticketKey/comments`, `POST /api/tickets/:ticketKey/blockers`, `DELETE /api/tickets/:ticketKey/blockers/:blockerKey`, `PUT /api/tickets/:ticketKey/attention`, `DELETE /api/tickets/:ticketKey/attention`.
- Features — `GET /api/projects/:key/features`, `POST /api/projects/:key/features`, `GET /api/features/:id`, `PATCH /api/features/:id`, `DELETE /api/features/:id` (UI only).
- Actors and live updates — `GET /api/actors`, `GET /api/events?project=KEY` (SSE).

### 7.4 Live updates (SSE)

`GET /api/events?project=KEY` (credentials or Bearer token in hosted mode) streams `text/event-stream`. Each message carries `event: <type>` and a JSON `data` body of `{ projectKey, ticketKey?, featureId?, actor, at }`. A `: ping` heartbeat is sent every 25 s. Types: `project.created | project.updated | project.deleted`, `ticket.created | ticket.updated | ticket.moved | ticket.deleted | ticket.commented`, `feature.created | feature.updated | feature.deleted`.

### 7.5 Environment variables

#### Backend

| Variable                    | Default                                | Purpose |
| --------------------------- | -------------------------------------- | ------- |
| `AWB_HOST`                  | `127.0.0.1`                            | Bind interface (`0.0.0.0` in Docker). |
| `AWB_PORT`                  | `4747`                                 | Listen port. |
| `AWB_HOME`                  | `~/.ai-work-board` (`/data` in Docker) | Data root; PGlite lives at `<AWB_HOME>/pgdata`. |
| `AWB_MODE`                  | inferred                               | `local` \| `hosted`. Explicit value wins over inference. |
| `DATABASE_URL`              | unset                                  | Postgres DSN when set. Does **not** flip mode — pointed locally is supported. |
| `AWB_ALLOWED_ORIGINS`       | `[]`                                   | Comma-separated list of allowed browser origins for CORS (hosted mode). |
| `AWB_OWNER_PASSWORD_HASH`   | —                                      | Scrypt hash of the owner password. **Required to start** in hosted mode. |
| `AWB_SESSION_SECRET`        | —                                      | Secret signing the web session cookie. **Required** in hosted mode. |
| `AWB_API_TOKENS`            | —                                      | Comma-separated list of bearer tokens. **At least one required** in hosted mode. |
| `AWB_TRUST_PROXY`           | `false`                                | `true` when a reverse proxy sets `X-Forwarded-For` (login rate-limit uses it). |

Mode resolution (from [`apps/server/src/server/config.ts`](../apps/server/src/server/config.ts)): an explicit `--mode` or `AWB_MODE` always wins; otherwise a non-loopback host implies hosted mode and a loopback host implies local. In hosted mode the server refuses to start unless `AWB_OWNER_PASSWORD_HASH`, `AWB_SESSION_SECRET`, and at least one token in `AWB_API_TOKENS` are set, and it names every missing variable.

> **Shell quoting.** The scrypt hash in `AWB_OWNER_PASSWORD_HASH` contains `$` characters — quote the value in single quotes or pass it through an `--env-file`, or the shell will expand it.

#### CLI client

| Variable    | Default                    | Purpose |
| ----------- | -------------------------- | ------- |
| `AWB_URL`   | `http://127.0.0.1:4747`    | Target backend URL. |
| `AWB_TOKEN` | unset                      | Bearer token for hosted mode. |
| `AWB_ACTOR` | `agent`                    | Default Actor name for change attribution. |

#### Frontend build

| Variable        | Default | Purpose |
| --------------- | ------- | ------- |
| `VITE_API_URL`  | unset (same origin) | Backend URL the SPA talks to; set at build time. |

> **Build constraint.** The repo uses `pnpm-workspace.yaml` `packageExtensions` to declare a missing peer for `tiptap-markdown@0.9.0` (`@tiptap/pm`). Local installs require that pin.

### 7.6 Repository layout

| Path              | Purpose |
| ----------------- | ------- |
| `apps/server`     | `@awb/server` — domain core, persistence, REST, SSE, MCP, `awb` CLI, tests. |
| `apps/web`        | `@awb/web` — Vite + React 19 SPA (kanban Board UI). |
| `packages/shared` | `@awb/shared` — framework-free TS types, the `COLUMNS` list, board event types. |
| `e2e/`            | Playwright suites (local mode + hosted mode). |
| `scripts/`        | E2E server launchers. |
| `docs/adr/`       | The 10 architecture decision records. |
| `Dockerfile`      | Server-only Node 26 slim image; SPA is hosted separately. |

### 7.7 Verification

- `pnpm test` — Vitest unit and integration suites (seam 1: in-process REST/MCP/CLI/SSE; seam 2: CLI against a real port; DnD pure-function tests).
- `pnpm typecheck` — TypeScript (`tsc --noEmit`) across `apps/`, `packages/`, `e2e/`, `scripts/`.
- `pnpm test:e2e` — build SPA, build the hosted SPA with `VITE_API_URL`, and run Playwright (local + hosted projects).
- `pnpm build` — Vite SPA production build to `apps/web/dist`.

A dedicated test ([`mcp-descriptions.test.ts`](../apps/server/test/mcp-descriptions.test.ts)) enforces that README tool/command lists, CLI help text, and MCP tool descriptions stay in sync.

---

## 8. Related documents

- [`../README.md`](../README.md) — operator manual (install, run, CLI/MCP reference, Docker hosting).
- [`../CONTEXT.md`](../CONTEXT.md) — the binding domain vocabulary.
- [`adr/`](adr/) — the 10 architecture decision records (rationale for every load-bearing decision).
- [`../.cursor/feature-pipeline/agent-kanban-board/spec.md`](../.cursor/feature-pipeline/agent-kanban-board/spec.md) — original v1 specification (the v1 story set this PRD consolidates).
- [`../.cursor/feature-pipeline/remote-backend-rich-text-dnd/spec.md`](../.cursor/feature-pipeline/remote-backend-rich-text-dnd/spec.md) — v2 specification (hosted mode, auth, rich text, drag-and-drop; the v2 story set this PRD consolidates).
