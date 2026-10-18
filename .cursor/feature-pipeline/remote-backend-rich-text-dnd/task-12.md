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
