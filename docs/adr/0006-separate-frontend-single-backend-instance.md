---
status: accepted
---
# Separate frontend app; one backend instance stays the only writer; amends ADR 0004

The UI is its own static SPA (`apps/web`), deployed separately from the backend (`apps/server`: domain core, storage, REST, SSE, MCP, the `awb` CLI) and sharing types through `packages/shared` in a pnpm workspace. The frontend reaches the backend at a build-time `VITE_API_URL` (empty means same origin). The backend accepts browser requests only from an allowlist of origins (`AWB_ALLOWED_ORIGINS`). Frontend and backend are hosted on the same parent domain (e.g. `board.example.com` and `api.board.example.com`), so they count as same-site. Only the "binds to 127.0.0.1 and serves the UI" part of ADR 0004 changes: exactly one backend instance still owns the database and the in-process event bus that drives SSE. Bind host and port come from config, and the backend ships as one platform-agnostic Docker image. We don't support running several backend instances; that would need a shared event channel such as Postgres LISTEN/NOTIFY or Redis.
