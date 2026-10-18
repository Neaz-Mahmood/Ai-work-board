# Task 13: Docker image and hosting docs

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is a pnpm workspace: `apps/web` (static SPA), `apps/server` (backend + `awb` CLI, run directly by Node 26 type stripping, no build step), `packages/shared`.
- Hosted mode is configured by env: `AWB_HOST`, `AWB_PORT`, `DATABASE_URL`, `AWB_ALLOWED_ORIGINS`, `AWB_OWNER_PASSWORD_HASH` (from `awb hash-password`), `AWB_SESSION_SECRET`, `AWB_API_TOKENS`.
- The SPA is built with `VITE_API_URL` and hosted on any static host on the same parent domain.
- Agents use `AWB_URL` + `AWB_TOKEN` for the CLI, and an `Authorization: Bearer` header for MCP.

This task ships a platform-agnostic Docker image for the backend and documents hosting.

## Do
- `Dockerfile` (repo root; the build context needs the whole workspace):
  - Based on `node:26-slim`, with pnpm via `corepack enable`.
  - Copy the workspace manifests first (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `apps/*/package.json`, `packages/*/package.json`) for layer caching, then `pnpm install --frozen-lockfile --prod`, then copy `apps/server` and `packages/shared`.
  - `ENV AWB_HOST=0.0.0.0 AWB_PORT=4747`, `EXPOSE 4747`, `CMD ["node", "apps/server/bin/awb.js", "start"]`.
  - Run as the non-root `node` user.
  - The image contains no web build; hosted mode serves no UI.
- `.dockerignore` (new): `node_modules`, `**/node_modules`, `**/dist`, `**/dist-hosted`, `test-results`, `playwright-report`, `.git`, `.cursor`.
- `README.md`: add a "Hosting" section:
  - **Backend**: `docker build -t awb .`, then `docker run` with every env variable listed with a one-line meaning; generating the password hash with `awb hash-password`; HTTPS by your host or reverse proxy; one instance only.
  - **Frontend**: `VITE_API_URL=https://api.board.example.com pnpm build`, then upload `apps/web/dist` to any static host; it must be on the same parent domain as the API, and its origin listed in `AWB_ALLOWED_ORIGINS`.
  - **Agents**: `AWB_URL` / `AWB_TOKEN` for the CLI. MCP snippets for Claude Code (`claude mcp add --transport http awb https://api.board.example.com/mcp?actor=claude --header "Authorization: Bearer <token>"`) and Cursor (`.cursor/mcp.json` with `url` and `headers`).
  - **Local mode**: unchanged; no config needed.
  - A note that existing local SQLite data isn't migrated.

## Follow these existing patterns
- `README.md`: the existing MCP setup snippets for Claude Code and Cursor. Mirror their format for the hosted variants.

## Do not
- Touch files outside: `Dockerfile`, `.dockerignore`, `README.md`
- Add platform-specific deploy scripts, change code, add dependencies, or commit

## Done when
- If Docker is available: `docker build -t awb .` succeeds. Then `docker run --rm -e AWB_OWNER_PASSWORD_HASH=$(node apps/server/bin/awb.js hash-password x) -e AWB_SESSION_SECRET=s -e AWB_API_TOKENS=t -p 4747:4747 awb` serves `curl localhost:4747/api/health`, and `curl -H "Authorization: Bearer t" localhost:4747/api/projects` returns 200. If Docker isn't available, say so in your report.
- `pnpm typecheck` passes
