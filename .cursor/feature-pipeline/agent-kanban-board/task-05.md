# Task 05: App shell UI

## Context
The AI Work Board is a local Jira-style kanban for AI agents. The server (tasks 01–02) serves a React (Vite) single-page app from `src/web/` and exposes Projects at `/api/projects`. This task replaces the placeholder page with the Jira-like app shell: a left sidebar listing Projects, an add-project dialog, project settings (rename, delete), routing, empty states, data fetching with TanStack Query, and the light Atlassian-like look. The Board itself comes in task 06. The UI always acts as Actor `you`.

## Do
- Dependencies: `@tanstack/react-query`, `react-router-dom`.
- `src/web/api/client.ts`: `api<T>(method, path, body?)` using `fetch`, always sending `Content-Type: application/json` and `X-AWB-Actor: you`; non-2xx → throws `ApiFailure { status, code, message }` built from `{ error: { code, message } }`. Types come from `src/shared/types.ts` (type-only imports).
- `src/web/api/queryKeys.ts`: `qk.projects = ["projects"]`, `qk.project(key) = ["project", key]`, `qk.board(key) = ["board", key]`, `qk.ticket(ticketKey) = ["ticket", ticketKey]`, `qk.features(key) = ["features", key]`, `qk.actors = ["actors"]`. All later UI code uses these keys.
- `src/web/api/projects.ts`: hooks `useProjects()`, `useCreateProject()`, `useRenameProject()`, `useDeleteProject()` (mutations invalidate `qk.projects`).
- `src/web/main.tsx`: `QueryClientProvider` + `BrowserRouter`; imports `src/web/styles/theme.css`.
- `src/web/App.tsx` routes:
  - `/` → redirect to the last opened Project (key kept in `localStorage` under `awb:lastProject`, every access wrapped in try/catch) if it still exists, else the first Project, else the empty state.
  - `/projects/:key` → layout with sidebar + `BoardPage` (in this task a placeholder showing the Project name, key and path; task 06 fills it). Unknown key → "Project not found" with a link home.
- `src/web/components/Sidebar.tsx`: app name "AI Work Board", "Projects" heading, one entry per Project (a square avatar with the key's first letter in a colour derived from the key, the name, the key in small grey text); active Project highlighted; "+ Add project" button at the bottom; a settings (gear) button on the active Project.
- `src/web/components/AddProjectDialog.tsx`: modal with fields Path (required, absolute), Name (optional), Key (optional, uppercased while typing, 2–5 letters); shows the server's error message inline (e.g. "Path already registered as AWB"); on success navigates to `/projects/<KEY>`.
- `src/web/components/ProjectSettingsDialog.tsx`: rename (PATCH `/api/projects/:key`), and a "Delete project" danger zone requiring the user to type the key before the delete button enables (DELETE `/api/projects/:key`, then navigate to `/`).
- `src/web/components/EmptyState.tsx`: shown when there are no Projects — short explanation ("Projects are local repositories your agents work in") and an "Add project" button.
- `src/web/components/Modal.tsx`: reusable accessible modal (overlay, Escape and overlay-click close, focus moved inside).
- `src/web/styles/theme.css`: CSS custom properties for the Atlassian-like light theme — `--color-bg: #FFFFFF`, `--color-surface: #F7F8F9`, `--color-column: #F1F2F4`, `--color-text: #172B4D`, `--color-text-subtle: #626F86`, `--color-border: #DCDFE4`, `--color-brand: #0C66E4`, `--color-danger: #C9372C`, font stack `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`, 14px base, 3px/4px radii. Sidebar 240px wide, `--color-surface` background. Plain CSS (one stylesheet per component is fine, imported from the component); no CSS framework.
- Keep components small; no business logic beyond calling the API.

## Follow these existing patterns
- `src/shared/types.ts` — `Project`, `ApiError` shapes.
- `src/server/routes/projects.ts` — the REST contract: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:key`.
- `.cursor/feature-pipeline/agent-kanban-board/spec.md` — "Web UI".

## Do not
- Touch files outside: `src/web/`, `package.json`, `pnpm-lock.yaml`.
- Add dependencies other than `@tanstack/react-query` and `react-router-dom`; reformat unrelated code; commit.
- Implement the Board, cards or Ticket UI (task 06+).

## Done when
- With `awb start` running after `pnpm build`, the browser shows the sidebar; adding a Project via the dialog lists it and navigates to it; rename and delete work; with no Projects the empty state shows.
- `pnpm test && pnpm typecheck && pnpm build` passes.
