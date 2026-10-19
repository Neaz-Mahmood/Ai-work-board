# Task 12: Frontend on its own origin: API URL, CORS, login screen

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is a pnpm workspace: `apps/web` (Vite React SPA), `apps/server` (Hono backend + `awb` CLI), `packages/shared`.
- The backend already supports hosted-mode auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` → `{ authEnabled, signedIn }`, a signed `awb_session` cookie (SameSite=Lax), and Bearer tokens.
- `resolveServerConfig` (in `apps/server/src/server/config.ts`) already returns `allowedOrigins` from `AWB_ALLOWED_ORIGINS`.

In hosted mode the SPA runs on its own origin on the same parent domain as the API (e.g. `board.example.com` → `api.board.example.com`). This task makes that work end to end:
- the API base URL is set at build time;
- requests carry credentials;
- the server applies a CORS allowlist;
- the UI shows a login screen and a sign-out control.

Local mode (same origin, no auth) must behave exactly as today.

## Do
- `apps/server/src/server/app.ts`:
  - `AppOptions` gains `allowedOrigins?: string[]`.
  - Add `hono/cors` middleware on `/api/*` and `/mcp`: an `origin` function that returns the origin only if it is in the allowlist, `credentials: true`, `allowHeaders: ["Content-Type", "X-AWB-Actor", "Authorization"]`, and methods GET/POST/PATCH/DELETE/OPTIONS.
  - Requests without an `Origin` header are unaffected, and a non-allowlisted origin gets no CORS headers.
  - It must also apply to the SSE route `/api/events`.
- `apps/server/src/cli/commands/start.ts`: pass `config.allowedOrigins`.
- `apps/web/src/api/client.ts`:
  - Add `export function apiUrl(path: string)` = `(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "") + path`.
  - `api()` uses `fetch(apiUrl(path), { ..., credentials: "include" })`.
  - `ApiFailure` keeps `status`.
- `apps/web/src/vite-env.d.ts`: declare `VITE_API_URL?: string` on `ImportMetaEnv`.
- `apps/web/src/api/useLiveUpdates.ts`: `new EventSource(apiUrl(...), { withCredentials: true })`.
- `apps/web/src/api/auth.ts` (new): `useSession()` (TanStack Query on `GET /api/auth/session`), `useLogin()`, `useLogout()`. A logout clears the query cache.
- `apps/web/src/main.tsx`: give the `QueryClient` a `QueryCache` / `MutationCache` `onError` that, on `ApiFailure` with status 401, invalidates the session query.
- `apps/web/src/App.tsx`:
  - While the session is loading, render nothing.
  - If `authEnabled && !signedIn`, render `LoginPage` instead of the routes, keeping the current URL so you return to it after signing in.
  - Otherwise render the existing app unchanged.
- `apps/web/src/pages/LoginPage.tsx` + `LoginPage.css` (new): a centred card with a password field, a "Sign in" button and an inline error ("Wrong password"). Same Jira-like look as the existing dialogs. Use `data-testid="login-password"` and `data-testid="login-submit"`.
- `apps/web/src/components/Sidebar.tsx`: when `authEnabled`, show a "Sign out" button (`data-testid="sign-out"`) at the bottom.
- `apps/server/test/cors.test.ts` (new), in-process with `makeTestApp({ allowedOrigins: ["http://localhost:4800"] })`:
  - preflight `OPTIONS` from an allowed origin gets `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true`;
  - a disallowed origin gets neither;
  - a request with no `Origin` works.
- Hosted e2e:
  - `scripts/e2e-hosted-server.ts` (new): starts `createApp` with in-memory PGlite, `auth: { ownerPasswordHash: hashPassword("e2e-password"), sessionSecret: "e2e-secret", apiTokens: ["e2e-token"], secureCookies: false }` and `allowedOrigins: ["http://localhost:4800"]`, on `localhost:4801`.
  - `playwright.config.ts`:
    - Project `local`: the existing specs, with `testIgnore: "hosted/**"` and baseURL `http://127.0.0.1:4799`.
    - Project `hosted`: `testMatch: "hosted/**/*.spec.ts"`, baseURL `http://localhost:4800`.
    - `webServer` becomes an array: the existing server; the hosted API (`node scripts/e2e-hosted-server.ts`, url `http://localhost:4801/api/health`); and the SPA (`pnpm --filter @awb/web exec vite preview --port 4800 --strictPort --outDir ../dist-hosted`, url `http://localhost:4800`).
  - Root `package.json` `test:e2e`: build the local SPA (`pnpm build`), then a hosted SPA with `VITE_API_URL=http://localhost:4801` into `apps/web/dist-hosted` (`pnpm --filter @awb/web exec vite build --outDir ../dist-hosted`), then `playwright test`. Add `dist-hosted` to `.gitignore` if not covered.
  - `e2e/hosted/auth.spec.ts` (new):
    - visiting `/` shows the login screen;
    - a wrong password shows the error;
    - the right password shows the projects UI;
    - a Project and Ticket created via Playwright `request` against `http://localhost:4801` with `Authorization: Bearer e2e-token` and `X-AWB-Actor: e2e-agent` appear on the open Board without a reload (cross-origin SSE);
    - "Sign out" returns to the login screen.

## Follow these existing patterns
- `apps/web/src/components/AddProjectDialog.tsx` and `AddProjectDialog.css`: form and dialog styling and error display.
- `apps/web/src/api/projects.ts`: TanStack Query hook style and query keys in `apps/web/src/api/queryKeys.ts`.
- `e2e/board.spec.ts` "6. Live update": how a live update is asserted.
- `scripts/e2e-server.ts`: server script structure and cleanup.

## Do not
- Touch files outside: `apps/web/src/`, `apps/server/src/server/app.ts`, `apps/server/src/cli/commands/start.ts`, `apps/server/test/`, `scripts/`, `e2e/`, `playwright.config.ts`, root `package.json`, `.gitignore`
- Change server auth semantics (task 09 settled them)
- Add dependencies (`hono/cors` ships with `hono`), reformat unrelated code, or commit

## Done when
- The SPA built with `VITE_API_URL` works against a backend on another same-site origin: login, live updates and logout. Local mode is unchanged, with no login screen.
- `pnpm test` passes
- `pnpm typecheck` passes
- `pnpm test:e2e` passes (both the `local` and `hosted` projects)

## Clarifications (checked against the code)
- **Middleware order in `app.ts` (critical):**
  - Register the CORS middleware (`app.use("/api/*", corsMw)` and `app.use("/mcp", corsMw)`) **before** the existing auth middleware, and always, not only when `opts.auth` is set. Browser preflight `OPTIONS` requests carry no cookie or token, so they must be answered by CORS before auth runs.
  - 401 responses from the auth middleware must still carry `Access-Control-Allow-Origin` / `-Credentials` for an allowed origin; otherwise the SPA can't read the 401. Add a test for this.
  - With `allowedOrigins` empty or undefined, the `origin` function returns `null` for every origin, so no CORS headers are added and local behaviour is unchanged.
- **CORS tests:** `apps/server/test/cors.test.ts` uses `makeTestApp({ allowedOrigins: [...] })` with `app.request(...)` and explicit `Origin` headers. Add one case with `auth` set: a request from an allowed origin without credentials → 401 **with** the CORS headers, and a preflight from an allowed origin → 204 (not 401). Use `hashPassword` from `apps/server/src/server/auth.ts` for the auth fixture.
- **Session gate in `App.tsx`:** today `App` calls `useProjects()` at the top level, which would fire before login and 401.
  - Rename the current `App` function body to `function BoardApp()` in the same file, unchanged.
  - The exported `App` becomes the gate: `useSession()`; while loading → `null`; if `authEnabled && !signedIn` → `<LoginPage />`; otherwise → `<BoardApp />`.
  - Don't navigate on login or logout. The URL stays put, so after sign-in the same route renders.
- **`apps/web/src/api/auth.ts`:**
  - Add `session: ["session"] as const` to `qk` in `queryKeys.ts`.
  - `useSession`: `retry: false`, `staleTime: Infinity`.
  - `useLogin`: mutation `POST /api/auth/login { password }`; on success → `queryClient.invalidateQueries({ queryKey: qk.session })`.
  - `useLogout`: mutation `POST /api/auth/logout`; on success → `queryClient.clear()`, then `queryClient.invalidateQueries({ queryKey: qk.session })`.
  - LoginPage shows the server's `ApiFailure.message` ("Wrong password") on a 401.
- **Global 401 handler (`main.tsx`):** only invalidate the session query when the failing query/mutation is not the session query or the login mutation, so a wrong password doesn't loop. Use `query.queryKey[0] !== "session"` in `QueryCache.onError`, and give the login mutation `meta: { skipAuthInvalidate: true }`, checked in `MutationCache.onError`.
- **Sidebar sign-out:** `Sidebar.tsx` calls `useSession()` itself (no new props). Render the button in a footer `div` after the projects nav, styled in `Sidebar.css` to match the existing sidebar links.
- **`vite-env.d.ts`:** keep the existing `/// <reference types="vite/client" />` line, then add `interface ImportMetaEnv { readonly VITE_API_URL?: string }` and `interface ImportMeta { readonly env: ImportMetaEnv }`.
- **The only raw `fetch` / `EventSource` calls** are in `api/client.ts` and `api/useLiveUpdates.ts` (line 29). Both go through `apiUrl(...)`.
- **`.gitignore`:** `dist` doesn't match `dist-hosted`. Add a line `dist-hosted`.
- **`scripts/e2e-hosted-server.ts`:**
  - Mirror `scripts/e2e-server.ts`: `dataDir` from `mkdtemp`, `database: { kind: "pglite" }` (no dir = in-memory), no `staticDir`.
  - `serve({ ..., port: 4801, hostname: "localhost" })`.
  - Import `hashPassword` from `../apps/server/src/server/auth.ts`.
- **Hosted e2e API calls:** `e2e/helpers.ts` posts to relative URLs, which in the `hosted` project would hit the SPA origin (4800). In `e2e/hosted/auth.spec.ts`, build an API context with `playwright.request.newContext({ baseURL: "http://localhost:4801", extraHTTPHeaders: { Authorization: "Bearer e2e-token", "X-AWB-Actor": "e2e-agent" } })` and pass it to the existing `createProject` / `createTicket` helpers. Dispose it in `afterAll`. Don't change `e2e/helpers.ts`, except to add something if you truly need it.
- **`playwright.config.ts`:** keep `workers: 1`, `retries: 0` and the `local` project's existing settings. Each project sets its own `use.baseURL`. Each `webServer` entry keeps `reuseExistingServer: false`. The vite preview command runs with `cwd` defaulting to the repo root, which is fine because of `--filter`.
- **Root `package.json` `test:e2e`:** `pnpm build && VITE_API_URL=http://localhost:4801 pnpm --filter @awb/web exec vite build --outDir ../dist-hosted && playwright test`.
- **Login form:** use `<form onSubmit>` so Enter submits. Use `type="password"` and `autoFocus`. Disable the button while the mutation is pending.
- Don't add locks or mutexes. Don't change `auth.ts`, `requestActor.ts` or the auth middleware logic, beyond registering CORS before it.
