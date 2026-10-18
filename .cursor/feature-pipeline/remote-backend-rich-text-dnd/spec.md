# Spec: Hostable backend, rich text descriptions, smooth drag and drop

Vocabulary follows `CONTEXT.md`. ADRs 0001, 0002, 0005–0010 are binding. ADR 0003 is superseded by 0005, and ADR 0004 is amended by 0006.

## Problem Statement

The AI Work Board only runs on my laptop. The server binds to 127.0.0.1, the UI is served by that same process, and all data sits in a SQLite file in my home directory. I can't host it on a server, reach it from my other machines, or keep the data in a proper remote database. Agents on another machine can't report to it.

Ticket and Feature descriptions are edited as raw markdown in a plain textarea. That's awkward for the structured notes I write and fix by hand.

Dragging cards on the Board feels laggy. The whole Board re-renders while I drag, cards don't make room in the target Column, and the Board refetches twice after every drop, so cards jump. The kanban board in viva-os feels much smoother.

## Solution

The board splits into a separately deployable **frontend** (a static single-page app) and one **backend** instance. The backend owns the database and serves the REST API, live updates and MCP.

The board runs in one of two modes:
- **Local mode** (default): `awb start` works as today. It stays on 127.0.0.1:4747 with an embedded database and no login, and serves the bundled UI from the same origin.
- **Hosted mode**: the backend runs from a Docker image on any host, stores data in Postgres, and requires auth. I log in to the UI with an owner password. Agents' CLI and MCP clients send an API token. The frontend is hosted separately on the same parent domain (e.g. `board.example.com` → `api.board.example.com`).

Existing local data is not migrated; both modes start fresh.

Ticket and Feature descriptions get a WYSIWYG rich text editor (Tiptap) that reads and writes markdown. Agents, the CLI and search keep working with markdown exactly as before.

Board drag and drop moves to Atlassian Pragmatic drag-and-drop, following viva-os:
- the browser's native drag preview, with no React work on every pointer move
- a drop-indicator line showing where the card will land
- memoized Columns and cards
- no live-update refetches during a drag
- one refetch after a drop

Keyboard users get Move up / Move down / Move to Column actions.

## User Stories

### Running and hosting
1. As the user, I want `awb start` with no configuration to keep running the whole board on my machine, so that local use stays zero-setup.
2. As the user, I want local mode to keep listening only on 127.0.0.1 with no login, so that local use stays private and frictionless.
3. As the user, I want local mode to keep serving the UI from the same address as the API, so that I open one URL as before.
4. As the user, I want to deploy the backend as a single Docker image configured only by environment variables, so that I can host it on any provider.
5. As the user, I want to set the bind host and port through configuration, so that the backend can listen on a server's public interface.
6. As the user, I want the backend to store data in a Postgres database given by a connection URL, so that my board data lives in a real remote database.
7. As the user, I want local mode to store data in an embedded database under `~/.ai-work-board`, so that I need no database server locally.
8. As the user, I want local and hosted mode to behave identically apart from storage, auth and UI serving, so that agents and I don't have to learn two boards.
9. As the user, I want the backend to refuse to start in hosted mode when auth isn't fully configured, and to name the missing variables, so that I can never expose an open board by mistake.
10. As the user, I want hosted mode detected automatically when the backend binds to a non-loopback address or a database URL is set, so that I don't need a separate mode flag.
11. As the user, I want exactly one backend instance to own the data, so that Claims and Rank changes stay correct and live updates reach every open board.
12. As the user, I want my old local SQLite board left untouched, so that nothing is deleted or silently imported.

### Separate frontend
13. As the user, I want the UI built as a static app I can host on any static host or CDN, so that frontend and backend deploy independently.
14. As the user, I want to set the backend address when building the frontend, so that the same frontend code works locally and against my hosted backend.
15. As the user, I want the frontend to default to the same origin when no backend address is set, so that local mode needs no configuration.
16. As the user, I want the backend to accept browser requests only from frontend origins I list, so that other websites can't use my board through my browser.
17. As the user, I want CLI and MCP requests unaffected by the origin allowlist, so that agents connect without browser rules getting in the way.
18. As the user, I want live updates to keep working when the frontend and backend are on different subdomains, so that the hosted board is as live as the local one.
19. As a developer, I want the frontend dev server to keep proxying to a local backend, so that development stays a single command away.

### Signing in (hosted mode)
20. As the user, I want to sign in to the hosted board with a single owner password, so that only I can see and change it.
21. As the user, I want my password stored only as a hash in the server configuration, so that the plain password never sits on the server.
22. As the user, I want to stay signed in for 30 days on a browser, so that I don't log in every visit.
23. As the user, I want my browser session kept in a secure, script-inaccessible cookie, so that a malicious script can't steal it.
24. As the user, I want to see a login screen whenever I'm not signed in, so that it's obvious why the board isn't showing.
25. As the user, I want a wrong password rejected with a clear message, so that I know to retry.
26. As the user, I want to sign out, so that I can end my session on a shared machine.
27. As the user, I want everything I do in the browser recorded as Actor "you", as today, so that Activity stays readable.

### Agents on a hosted board
28. As an agent, I want to authenticate CLI calls with a token from `AWB_TOKEN` and point the CLI at the hosted backend with `AWB_URL`, so that I can work against a remote board.
29. As an agent, I want to authenticate MCP calls with a bearer token set in my MCP client's headers, so that Claude Code and Cursor can use the hosted board.
30. As the user, I want to configure several API tokens (e.g. one per machine), so that I can retire one by redeploying without breaking the others.
31. As an agent, I want a clear error telling me to set `AWB_TOKEN` when my token is missing or rejected, so that I can tell an auth problem apart from a server that isn't running.
32. As the user, I want a token only to grant access, while agents still name themselves with `--as`, `AWB_ACTOR` or `actor`, so that Activity keeps showing which agent did what.
33. As the user, I want agents still unable to act as "you", even with a valid token, so that my own Activity can't be impersonated by mistake.
34. As the user, I want requests without valid credentials rejected on the API, the live-update stream and MCP alike, so that there is no unguarded door.

### Projects on a remote server
35. As an agent, I want `awb init` and Project lookup from my current directory to work against a hosted backend, so that my workflow doesn't change.
36. As an agent, I want my CLI or MCP client to resolve symlinks and normalize the repository path on my own machine, so that the server never needs to see my filesystem.
37. As the user, I want the server to accept a Project path without checking that it exists on the server, so that hosted Projects can point at repositories on my laptop.
38. As an agent, I want the deepest registered Project path containing my directory to win, as before, so that lookup stays predictable.
39. As an agent working from a clone at a different path, I want to pass the Project Key explicitly, so that I can still reach the right Board.
40. As the user, I want registering the same normalized path twice still rejected, so that a repository never gets two Boards.

### Correctness under load
41. As a working agent, I want concurrent Claims from several agents to never hand the same Ticket to two of us, so that work isn't duplicated.
42. As the user, I want Ranks to stay gapless and consistent when several moves arrive at once, so that ordering never corrupts.
43. As the user, I want every existing Board behaviour (Blockers, Claim, Activity, Features, filters, live updates) to work the same after the database change, so that nothing regresses.

### Rich text descriptions
44. As the user, I want to edit a Ticket's description in a rich text editor, so that I can format notes without writing markdown syntax.
45. As the user, I want to edit a Feature's description in the same editor, so that both kinds of description feel the same.
46. As the user, I want headings (H1–H3), bold, italic, strikethrough, inline code, code blocks, bullet, numbered and task lists, links, blockquotes, horizontal rules and tables, so that I can write structured specs and checklists.
47. As the user, I want a compact toolbar for those formats, so that I can find them with the mouse.
48. As the user, I want markdown typing shortcuts (e.g. `## `, `- `, `[] `, three backticks), so that I can format quickly from the keyboard.
49. As the user, I want descriptions to keep rendering as formatted markdown when I'm not editing, so that reading stays fast and unchanged.
50. As the user, I want to click the description or the Edit button to start editing, and Save or Cancel explicitly, so that I never change a description by accident.
51. As the user, I want Cmd/Ctrl+Enter to save and Esc to cancel, so that editing is keyboard-friendly.
52. As the user, I want opening and saving a description without changes to leave its text exactly as it was, so that the editor never rewrites what agents wrote.
53. As an agent, I want to keep writing and reading descriptions as markdown through MCP and the CLI, so that my interface doesn't change.
54. As the user, I want search to keep matching description text, so that finding Tickets works as before.
55. As the user, I want formats that markdown can't hold (images, underline, colours, fonts, alignment, mentions) left out of the editor, so that what I see is what gets stored.
56. As the user, I want comments to stay a plain markdown text box, so that short notes remain quick.
57. As the user, I want inline Ticket creation on the Board to stay title-only, so that capturing work stays fast; I add a description in the Ticket modal.

### Drag and drop
58. As the user, I want dragging a card to feel smooth and immediate, with no stutter on a full Board, so that rearranging work is pleasant.
59. As the user, I want a drag preview that follows my pointer, so that I can see what I'm moving.
60. As the user, I want a line showing exactly where the card will land, above or below the card I'm hovering, so that drops are predictable.
61. As the user, I want to drop a card on an empty part of a Column to put it at the bottom, so that moving to a Column is easy.
62. As the user, I want the target Column highlighted while I hover it, so that I know where the card will go.
63. As the user, I want the card to appear in its new place immediately on drop, without jumping back or flickering, so that the Board feels responsive.
64. As the user, I want a failed move rolled back with an error message, as today, so that the Board never shows a state the server rejected.
65. As the user, I want live updates from agents not to disturb a drag in progress, and to show up right after I drop, so that I don't lose my drag and don't miss changes.
66. As the user, I want reordering within a Column to set Rank exactly as before, so that Claim order follows my arrangement.
67. As the user, I want dragging to keep working while search or filters hide some cards, with the drop placed relative to the visible card I hovered, so that I can rearrange a filtered view.
68. As a keyboard user, I want to move a focused card up or down within its Column with Alt+↑/↓, so that I can set Rank without a mouse.
69. As a keyboard user, I want a "Move to Column" action on a card, so that I can change its Column without a mouse.
70. As a screen-reader user, I want each move announced, so that I know where the card ended up.
71. As the user, I want moves to keep being recorded in Activity as by "you", so that history stays complete.

## Implementation Decisions

### Repository and packages (ADR 0006)
- The repo becomes a pnpm workspace with three packages:
  - **web app**: the React SPA, built with Vite to static files.
  - **server app**: domain core, storage, REST, SSE, MCP and the `awb` CLI. `awb start` launches the server, and the CLI is a thin HTTP client of it.
  - **shared package**: API types, the Column list, and board event types. The board event types move out of the domain core, because the web app must not import the server.
- The server package bundles the web app's production build so local mode can serve it.

### Server configuration
- One config resolver turns the environment (plus CLI flags) into a server config. It replaces the separate data-dir and port helpers. Variables:
  - `AWB_HOST` (default `127.0.0.1`), `AWB_PORT` (default 4747), `AWB_HOME` / `--data-dir`
  - `DATABASE_URL`
  - `AWB_ALLOWED_ORIGINS` (comma-separated)
  - `AWB_OWNER_PASSWORD_HASH`, `AWB_SESSION_SECRET`, `AWB_API_TOKENS` (comma-separated)
- **Hosted mode** = the host is not loopback, or `DATABASE_URL` is set. In hosted mode the resolver fails, naming every missing variable, unless the password hash, session secret and at least one API token are all set.
- **Local mode** = loopback and no `DATABASE_URL`. Auth is off, the origin allowlist is empty (same-origin only), and the bundled UI is served same-origin with SPA fallback.
- In hosted mode the server serves no UI.
- The app factory becomes async. It takes a database handle (or the info needed to open one), a clock, optional auth config, allowed origins and an optional static directory. Binding a port stays outside the factory.

### Storage (ADR 0005, ADR 0010)
- Local mode uses PGlite stored in a directory under the data dir. Hosted mode uses Postgres through a standard Postgres driver.
- The `Db` interface becomes async (`get` / `all` / `run` / `tx`), with one adapter per driver. The domain core keeps hand-written SQL, translated from SQLite to Postgres:
  - identity columns
  - case-insensitive uniqueness for Feature names
  - `RETURNING` in place of last-insert-id
  - ISO timestamp strings from the injected clock
  - JSON payload columns
- The migrations runner stays our own, now async. Migrations start from a fresh Postgres baseline.
- Every write transaction runs under one in-process async mutex. This replaces SQLite's `BEGIN IMMEDIATE` serialization for Claim, Rank shifting, ticket numbering and Blocker cycle checks. Reads don't take the mutex.
- No import of the old SQLite file. Remove the `better-sqlite3` dependency.

### Projects (ADR 0007)
- The server no longer checks existence, resolves symlinks or `realpath`s anything. A Project path is stored as given after trivial normalization: absolute, no trailing slash. Uniqueness and cwd matching (deepest containing path) work on those strings.
- The CLI resolves symlinks for `awb init` paths and the current directory before sending them.
- MCP clients pass `cwd` as they do today. The tool descriptions say it must be the absolute, symlink-resolved repository path.
- "Path must exist as a directory" validation moves from the server to the CLI.

### Auth (ADR 0009)
- `POST /api/auth/login` `{ password }` checks the password against the configured hash with a slow password hash such as scrypt. On success it sets a signed session cookie: httpOnly, Secure (except on loopback http), SameSite=Lax, 30 days. On failure it returns 401 `UNAUTHORIZED`.
- `POST /api/auth/logout` clears the cookie.
- `GET /api/auth/session` returns whether the caller is signed in and whether auth is enabled, so the UI knows whether to show the login screen.
- In hosted mode, all other `/api/*` routes (including `/api/events`) and `/mcp` require either a valid session cookie or `Authorization: Bearer <token>` matching a configured token, compared in constant time. Otherwise they return 401. The health endpoint stays public.
- A session-cookie request always acts as Actor `you`. A Bearer request is attributed exactly as today (`X-AWB-Actor`, MCP `actor` parameter or URL `actor`), and `you` stays reserved, as today.
- A small helper (e.g. an `awb hash-password` command) produces the password hash for configuration.
- CORS applies only to requests with an `Origin` header. An allowlisted origin gets credentialed CORS headers, including on preflight. Any other origin gets none.

### Frontend
- One API base-URL helper reads the build-time `VITE_API_URL` (empty = same origin). Every `fetch` uses it with `credentials: 'include'`, and the live-update `EventSource` uses it with `withCredentials: true`.
- A 401 from any call shows the login screen. Signing in returns to the page you were on. A sign-out control sits in the shell.
- Board behaviour, routes and query keys are otherwise unchanged.

### CLI
- The CLI reads `AWB_TOKEN` and sends it as a Bearer token when set. `AWB_URL` and `--url` stay as they are.
- A 401 from the server becomes a distinct error ("Authentication failed: set AWB_TOKEN to a token configured on the server"). The existing "server unreachable: run `awb start`" error stays separate.
- The README gains MCP snippets for a hosted board with an Authorization header.

### Rich text editor (ADR 0008)
- One shared description-editor component built on Tiptap with markdown serialization (as in viva-os's UI package). It takes initial markdown and returns markdown on Save. It's used in the Ticket modal's description section and the Feature create/edit form.
- Extensions are limited to what round-trips through GFM:
  - headings H1–H3, bold, italic, strike, inline code, code blocks
  - bullet, ordered and task lists
  - links, blockquotes, horizontal rules, tables
- The toolbar exposes those formats. Markdown input rules are enabled.
- If the markdown is unchanged after the editor loads and nothing was edited, Save sends no change, so descriptions stay byte-identical.
- Read-only rendering stays `react-markdown` with GFM.
- Comments and inline Ticket creation are unchanged.
- The server, MCP and CLI are unchanged for descriptions: the stored value is still a markdown string.

### Drag and drop
- dnd-kit is replaced by Pragmatic drag-and-drop with its hitbox (closest edge) and auto-scroll add-ons:
  - Each card is a draggable and a drop target with a closest top/bottom edge. Each Column body is a drop target.
  - One board-level monitor handles the drop.
  - The drag preview is the browser's native drag preview, built from a clone of the card.
  - A drop-indicator line is drawn at the closest edge of the hovered card. The hovered Column gets a highlight.
  - The source card is dimmed during the drag.
- No per-pointer-move React state at Board level. Columns and cards are memoized, with stable click and action callbacks, so hovering re-renders only the affected Column or card.
- A pure destination function maps (source Column and index, target card or Column, closest edge, visible filtered list) to the target Column and full-column Rank position. It keeps today's filtered-board semantics and replaces the current position helper.
- On drop, the optimistic board update runs at once. When the move settles, the Board is invalidated exactly once, ticket and project queries as needed.
- While a drag is active, live-update events are buffered and applied as one invalidation after the drop, so no refetch happens mid-drag.
- Keyboard: a focused card supports Alt+↑ / Alt+↓ (move within its Column) and a "Move to Column" action from a small card menu. Every move, by pointer or keyboard, is announced through a polite live region (e.g. "PROJ-12 moved to In Progress, position 3").
- No virtualization and no Column reordering; Columns stay fixed.

### Deployment
- The server package has a Dockerfile that builds the server and runs it with env config. HTTPS is terminated by the host or a reverse proxy.
- The web app deploys as static files built with `VITE_API_URL` set.

## Testing Decisions

- **What makes a good test**: assert external behaviour only:
  - HTTP status and body, MCP tool results
  - CLI output and exit code
  - what the user sees and what the API returns after a UI action

  Don't test internal module calls, SQL text or component internals. The existing suites already follow this and stay the model.
- **Seam 1, in-process app (vitest, node), the main seam**: the async app factory with an in-memory PGlite database and a fixed clock, driven through in-process requests. MCP runs through the SDK client over in-process fetch. The test-app helper stays the single entry point and gains helpers for a Bearer token, a session cookie and an `Origin` header. Covered here:
  - **Regression**: the whole existing REST and MCP suite, unchanged in what it checks, now on PGlite.
  - **Concurrency (ADR 0010)**: concurrent Claims and moves fired together through the app. Assert no Ticket is claimed twice and Ranks stay dense from 0. Prior art: the Claim tests.
  - **Project identity (ADR 0007)**: the server accepts paths that don't exist on its disk, matches a cwd by deepest prefix, and rejects duplicate normalized paths. Tests no longer create temp dirs only for server-side existence checks.
  - **Auth (ADR 0009)**:
    - Login succeeds and fails as specified; session state and logout work.
    - A cookie authorizes REST and SSE as Actor `you`; a Bearer token authorizes REST and MCP.
    - A missing or invalid credential gets 401 on `/api`, `/api/events` and `/mcp`; the health endpoint stays public.
    - Agents can't act as `you`.
    - An app without auth config behaves exactly as today.
  - **CORS**: an allowlisted origin gets credentialed CORS headers, including on preflight. Other origins get none. Requests with no origin are unaffected.
  - **Markdown**: GFM descriptions (tables, task lists, code blocks) written through REST and MCP come back byte-identical, and search still matches them.
- **Seam 2, CLI (vitest)**: the CLI entry point against the test server on a real port. Prior art: the CLI Projects and Tickets tests. Covered here:
  - The CLI resolves symlinks and normalizes cwd and paths on the client (real temp dirs and a symlink); the server receives the normalized path.
  - `AWB_TOKEN` works against an auth-enabled server.
  - A missing or invalid token gives the distinct auth error, separate from the unreachable-server error.
- **Seam 3, Playwright E2E**:
  - **Local mode** (existing server script, same origin, no auth):
    - Existing "Drag across Columns", "Reorder within a Column", "Modal edit and comment", "Filters" and "Live update" specs keep passing. The drag helper is rewritten for native HTML5 drag.
    - New: edge drops land above or below a card and survive a reload.
    - New: dropping while filtered.
    - New: Alt+↑/↓ and Move to Column, with the announcement text.
    - New: exactly one board refetch after a drop.
    - New: editing Ticket and Feature descriptions with the toolbar and shortcuts stores the expected markdown, checked through the API.
    - New: open-and-save without changes leaves a rich description byte-identical.
    - New: Cmd/Ctrl+Enter saves and Esc cancels.
  - **Hosted mode** (new server script): the API with auth, an origin allowlist and PGlite on `localhost:4799`. The built SPA is served separately with `VITE_API_URL=http://localhost:4799` on `localhost:4800`, which is same-site but cross-origin. Specs:
    - An unauthenticated visit shows the login screen; logging in reaches the board.
    - A Ticket created through the API with a Bearer token appears live over cross-origin SSE.
    - Logging out returns to the login screen.
- **Pure unit tests (vitest)**:
  - **DnD destination function**: same Column and cross Column, top and bottom edges, Column-body drops, empty Columns, filtered lists. Prior art: viva-os's board DnD tests.
  - **Config resolver**: local defaults; hosted mode detection; refusal naming the missing variables.
- **Optional Postgres contract run**: when `TEST_DATABASE_URL` is set, the Seam 1 suite runs again on the Postgres adapter. Otherwise it is skipped, so CI never needs a database server.
- **Not automated**:
  - the Docker image (manual smoke test: build, run with env, sign in, use the board)
  - the visual feel of dragging (manual comparison with viva-os)

## Out of Scope

- Running more than one backend instance, or any shared event channel across instances.
- User accounts, teams, multiple tenants, OAuth or SSO, and tokens managed in the UI.
- Importing or migrating data from the old SQLite board.
- Identifying Projects by git remote, or several paths per Project.
- Images, file uploads, underline, colours, fonts, alignment and mentions in descriptions.
- A rich editor for comments, and description entry during inline Ticket creation.
- Board virtualization, Column reordering, and user-defined Columns.
- Platform-specific deploy scripts; HTTPS termination inside the app.
- Server-side rendering of the frontend.

## Further Notes

- **Open point: password hashing.** The decision is "a hash in env, checked with a slow hash". The exact algorithm (scrypt from Node's standard library is preferred, so no native dependency) and the helper command's name are for the implementer to settle.
- **Open point: PGlite on Node 26.** Confirm early that the embedded PGlite build and the chosen Postgres driver run on the project's Node 26 engine and under Vitest's node environment. The first slice should prove this before the domain core is converted.
- **Open point: Secure cookies in the hosted e2e.** Plain-http `localhost` needs the Secure flag relaxed for loopback hosts. The resolver should allow this only for loopback, never for a real hosted domain.
- **Order of work.** The async database conversion touches every domain module and should land early, behind the existing suite, before auth, the package split, the editor and drag-and-drop build on it. The editor and drag-and-drop work only touch the web app and can proceed in parallel once the package split exists.
- **Docs.** README and agent setup docs need updating for `AWB_URL` / `AWB_TOKEN`, MCP headers, hosted-mode env variables and the frontend's `VITE_API_URL`.
- The old `~/.ai-work-board/board.db` is left on disk; the board no longer reads it.
