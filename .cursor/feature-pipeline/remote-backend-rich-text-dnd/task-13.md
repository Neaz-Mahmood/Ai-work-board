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

## Clarifications (checked against the code)
- **pnpm in the image:** don't use `corepack enable`. Corepack is no longer bundled with Node 25+, and the repo has no `packageManager` field. Use `RUN npm install -g pnpm@11.25.0` (the version this repo's lockfile was made with).
- **Layout:** `WORKDIR /app`. `COPY --chown=node:node` everywhere. Switch to `USER node` before `pnpm install` so `node_modules` is owned by `node`; the `/app` directory must be created and chowned first, as root.
- **Manifests:** copy `apps/server/package.json`, `apps/web/package.json` and `packages/shared/package.json` explicitly, each to its own path. A glob `COPY` flattens directories. `apps/web/package.json` is needed for the workspace and frozen lockfile to resolve, even though no web sources are copied.
- **Persistence:** without `DATABASE_URL`, hosted mode uses PGlite under `AWB_HOME`. Set `ENV AWB_HOME=/data`, create `/data` owned by `node` (as root, before `USER node`) and declare `VOLUME /data`. The README must say: mount a volume at `/data` (`-v awb-data:/data`) or set `DATABASE_URL` for Postgres; otherwise data is lost with the container.
- **README `docker run` example:**
  - Use `-e` for each variable, plus `-v awb-data:/data` and `-p 4747:4747`.
  - Document every env var: `AWB_HOST`, `AWB_PORT`, `AWB_HOME`, `DATABASE_URL`, `AWB_ALLOWED_ORIGINS`, `AWB_OWNER_PASSWORD_HASH`, `AWB_SESSION_SECRET`, `AWB_API_TOKENS`.
  - The password hash can be generated either locally (`awb hash-password '<password>'`) or with the image: `docker run --rm awb node apps/server/bin/awb.js hash-password '<password>'`.
  - Note that the hash contains `$` characters, so quote it in single quotes or use an `--env-file`.
  - Note that cookies are `Secure` in hosted mode, so browsers need HTTPS in front.
- **Hosting section placement:** insert `## 11. Hosting` before the current "11. Notes" and renumber Notes to 12. Add the hosted MCP variants in the Hosting section; don't change the existing local snippets in section 6. The Cursor JSON uses `{ "mcpServers": { "ai-work-board": { "url": "https://api.board.example.com/mcp?actor=cursor", "headers": { "Authorization": "Bearer <token>" } } } }`.
- **Notes section:** it currently says "no auth; loopback only". Reword that sentence so it's true for both modes: local mode has no auth; hosted mode requires the owner password or an API token. Keep the rest of the Notes section.
- **Hosting caveat:** add a short "Security" bullet saying there is no built-in login rate limiting yet, so put the API behind a proxy/WAF with rate limits and use a long random owner password.
- You can't run Docker (shell is limited). Claude will run the Docker checks. Run only `pnpm typecheck`.
