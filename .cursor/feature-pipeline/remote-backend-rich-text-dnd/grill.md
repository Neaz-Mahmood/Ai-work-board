# Grill: remote backend, rich text descriptions, better drag and drop

## Feature request
"I want the board app to have a real backend, so that I can host it in a server. and have remote database. Also the task should have a rich text editor instead of plain text for descriptions. Also the board's drag and drop is laggy, check the viva-os, kanban board implementation for better drag and drop implementation."

## Round 1

### Findings
- Server already exists: one Hono server (`awb start`), only writer (ADR 0004); serves UI, `/api`, SSE `/api/events`, MCP `/mcp`. CLI is an HTTP client via `AWB_URL`.
- Bound to 127.0.0.1 (`src/cli/commands/start.ts:29`), no auth by design.
- Storage: SQLite at `~/.ai-work-board/board.db` (ADR 0003), better-sqlite3; sync `Db` interface (`src/server/db.ts`), ~122 sync call sites in the domain core. A network DB forces async.
- Live updates: in-process event bus → SSE (single instance only).
- Projects keyed by absolute path checked with existsSync/realpathSync on the server (`src/domain/projects.ts:14-21`); breaks when the server is remote.
- Descriptions/comments are markdown, edited in a `<textarea>` (`TicketModal.tsx:417`), rendered with react-markdown + remark-gfm. viva-os uses Tiptap 3 + tiptap-markdown.
- DnD: dnd-kit + DragOverlay. Lag causes: board-wide re-render on every hovered-target change, unmemoized Column/TicketCard + inline onClick, collision detection recreated each render, no cross-column make-room, double refetch after drop (onSettled + SSE).
- viva-os uses Atlassian Pragmatic DnD: native drag preview, closest-edge drop indicators, single monitorForElements, external BoardStore with per-column/card subscriptions + memo, refetch suppression during drag, column virtualization.

### Questions (planner recommendation in ➡️)
- Q1 Keep one hostable server instance (configurable host/port, no multi-instance)? ➡️ Yes.
- Q2 Audience: (a) only you, several machines (b) small trusted team (c) multi-tenant? ➡️ (a).
- Q3 Keep zero-setup local mode as default, hosted mode via config? ➡️ Yes.
- Q4 DB: (a) Postgres hosted + PGlite local (b) libSQL/Turso (c) SQLite on server disk? ➡️ (a), new ADR replacing 0003.
- Q5 Project identity remote: (a) client-normalized path string, server only stores/matches (b) git remote URL (c) (a) + multiple paths per project? ➡️ (a).
- Q6 Hosting: platform-agnostic Dockerfile + env vars, HTTPS by host/proxy? ➡️ Yes.
- Q7 Markdown stays canonical storage; editor is WYSIWYG over markdown (Tiptap + tiptap-markdown)? ➡️ Yes.
- Q8 Rich editor scope: (a) ticket desc (b) ticket + feature desc (c) + comments? ➡️ (b).
- Q9 DnD: (a) Pragmatic DnD like viva-os (no virtualization/column reorder) (b) fix dnd-kit? ➡️ (a).

### Answers
User: "it should have a separate frontend ui"
(Bears on Q1: frontend split from the server. Q2–Q9 not answered yet.)

## Round 2

### Settled
- UI becomes its own frontend app, deployed apart from the backend, talking over the API (ADR to supersede ADR 0004's "server serves the UI" once layout settles).

### Findings
- UI is already a separate Vite build (`src/web` → `dist/web`), served statically by `src/server/app.ts` (staticDir + SPA fallback). Vite dev proxies `/api`, `/mcp` to 127.0.0.1:4747.
- Single pnpm package; `pnpm-workspace.yaml` only holds overrides.
- Web imports `shared/types.ts`, `shared/columns.ts`, and `domain/events.ts` (in `useLiveUpdates.ts`) → needs a shared package.
- API client uses relative `fetch(path)` with hard-coded `X-AWB-Actor: you`; `EventSource('/api/events?...')` relative → needs base URL + CORS.
- EventSource can't send custom headers → auth must work for SSE (cookie + withCredentials, query token, or fetch-based SSE).

### Questions (planner recommendation in ➡️)
- Q1′ One backend instance, only writer (DB, REST, SSE, MCP), AWB_HOST/AWB_PORT, no horizontal scaling? ➡️ Yes.
- Q2 Audience (a) only you (b) small team (c) multi-tenant? ➡️ (a).
- Q3 Keep zero-setup local mode as default? ➡️ Yes.
- Q4 DB (a) Postgres + PGlite local (b) libSQL/Turso (c) SQLite on server disk? ➡️ (a).
- Q5 Project path = client-normalized string, server never touches FS? ➡️ Yes.
- Q6 Backend as platform-agnostic Docker image + env config? ➡️ Yes.
- Q7 Markdown stays canonical, Tiptap + tiptap-markdown editor? ➡️ Yes.
- Q8 Rich editor on (a) ticket desc (b) ticket + feature desc (c) + comments? ➡️ (b).
- Q9 DnD (a) Pragmatic DnD like viva-os (b) fix dnd-kit? ➡️ (a).
- Q10 Monorepo: apps/web, apps/server (incl. CLI), packages/shared? ➡️ Yes.
- Q11 Frontend as static SPA, no SSR? ➡️ Yes.
- Q12 API base URL via build-time VITE_API_URL, same-origin default? ➡️ Yes.
- Q13 CORS explicit allowlist AWB_ALLOWED_ORIGINS (empty locally)? ➡️ Yes.
- Q14 Frontend and backend on same parent domain (vs unrelated domains)? ➡️ Same parent domain.

### Answers
User: "all recommended" — Q1′–Q14 accepted as recommended.

## Round 3

### Recorded by planner
- ADRs: 0005 Postgres hosted / PGlite local (supersedes 0003); 0006 separate frontend + single backend instance (amends 0004); 0007 project path client-normalized; 0008 descriptions stay markdown. CONTEXT.md intro + Project definition updated.

### Findings
- `~/.ai-work-board/board.db` holds real data → migration needed.
- Feature description editor is a textarea in `FeaturesPanel.tsx`; `CreateTicketInline` is title-only.
- dnd-kit KeyboardSensor gives keyboard reordering today (no e2e test); Pragmatic DnD has none — viva-os uses card actions + announcer.
- Claim and rank shifting rely on SQLite `BEGIN IMMEDIATE`.

### Questions (planner recommendation in ➡️)
- Q15 Browser login: (a) env password hash + signed httpOnly session cookie (30d), SSE via withCredentials, browser acts as `you` (b) GitHub OAuth (c) proxy only? ➡️ (a).
- Q16 CLI/MCP creds: (a) static env tokens AWB_API_TOKENS (b) UI-managed hashed tokens? Actor stays self-chosen. ➡️ (a).
- Q17 Hosted mode refuses to start without auth config; local mode stays open? ➡️ Yes.
- Q18 Local mode still serves bundled SPA same-origin on 127.0.0.1:4747? ➡️ Yes.
- Q19 Migration: (a) `awb import-sqlite [path]` into empty target, preserving ids/numbers/timestamps, start prints hint (b) auto-import (c) none? ➡️ (a).
- Q20 Hand-written SQL behind async Db (PGlite + postgres adapters), in-process write mutex replacing BEGIN IMMEDIATE, own migrations, tests on in-memory PGlite (vs Kysely/Drizzle)? ➡️ Yes.
- Q21 Editor formatting = GFM round-trip set (H1–H3, bold, italic, strike, code, code blocks, lists, task lists, links, quotes, hr, tables), toolbar + markdown shortcuts; no images/underline/colors/mentions? ➡️ Yes.
- Q22 Keep click-to-edit with Save/Cancel (Cmd+Enter/Esc), one shared editor component for Ticket + Feature? ➡️ Yes.
- Q23 Inline create stays title-only? ➡️ Yes.
- Q24 Replace keyboard dragging with card actions Move up/down/Move to Column (Alt+↑/↓, card menu) + SR announcement? ➡️ Yes.
- Q25 Filtered dragging keeps working, drop relative to hovered visible card mapped to full-column Rank? ➡️ Yes.

### Answers
User: "Q19 c, rest as recommended" — no migration, start fresh (no import command, no start hint). Q15–Q18, Q20–Q25 accepted as recommended.

## FRONTIER EMPTY

Planner recorded ADR 0009 (single-owner auth, hosted only), ADR 0010 (in-process write mutex, async Db with PGlite/Postgres adapters), and a Q19 consequence on ADR 0005.

### Shared understanding (planner restatement)
1. Architecture: pnpm workspace — apps/web (static SPA), apps/server (domain, storage, REST, SSE, MCP, awb CLI), packages/shared (API types, Columns, event types). One backend instance, only writer; host/port from config; Docker image + env; HTTPS by host/proxy. VITE_API_URL (same-origin default) via one base-URL helper; CORS allowlist AWB_ALLOWED_ORIGINS; same parent domain.
2. Modes: local default (127.0.0.1:4747, PGlite under ~/.ai-work-board, no auth, bundled SPA same-origin); hosted (Postgres via DATABASE_URL, auth required, refuses to start without it). No data migration.
3. Storage: async domain core, hand-written Postgres SQL, in-process write mutex for Claim/Rank shifting, tests on in-memory PGlite.
4. Auth: browser password → session cookie, always Actor `you`; CLI/MCP Bearer tokens from env (AWB_URL, AWB_TOKEN); agents self-name, can't be `you`.
5. Projects: client-normalized path, server stores + deepest-prefix match, no FS checks; --project KEY for other clone paths.
6. Rich text: Tiptap + tiptap-markdown, markdown canonical; Ticket + Feature descriptions only; GFM set; toolbar + shortcuts; click-to-edit Save/Cancel, Cmd+Enter/Esc; one shared component; read view stays react-markdown.
7. DnD: Pragmatic DnD per viva-os (native preview, closest-edge indicators, one monitor, memoized Column/card), refetch suppression during drag, single invalidation after drop, no virtualization/column reorder, keyboard card actions (Alt+↑/↓, Move to Column) + announcement, filtered drops map to full-column Rank.

Out of scope: multi-instance, UI-managed tokens, OAuth, data import, git-remote project identity, images/uploads.

### User confirmation
User: "yes, go ahead" — shared understanding confirmed.
