# Task 03: MCP endpoint

## Context
The AI Work Board is a local Jira-style kanban that AI agents (Claude Code, Cursor, agy) write to. Agents reach it through MCP over Streamable HTTP served by the same local server at `/mcp` (ADR 0004). Tasks 01–02 built `createApp`, the `Db` layer, Projects (`src/domain/projects.ts`, REST in `src/server/routes/projects.ts`) and the CLI. This task adds the MCP endpoint, Actor-name resolution for agents, the first two tools, and the MCP test harness that later tasks reuse for every tool.

## Do
- Dependencies: `@modelcontextprotocol/sdk` (latest 1.x) and `zod` (the version the SDK's peer dependency asks for).
- `src/domain/actors.ts` (names only for now; task 04 adds the Actor registry):
  - `ACTOR_NAME = /^[A-Za-z0-9._-]{1,40}$/`.
  - `resolveActorName(param?: string, urlActor?: string): string` → trimmed `param` if non-empty, else trimmed `urlActor` if non-empty, else `"agent"`.
  - `assertAgentActor(name)`: VALIDATION if it doesn't match `ACTOR_NAME`; VALIDATION "The actor name 'you' is reserved for the board UI." if it equals `you` (case-insensitive).
- `src/mcp/server.ts`: `buildMcpServer(ctx: Ctx, urlActor: string | undefined): McpServer` named `ai-work-board` with the server version from `package.json`. Register tools from modules under `src/mcp/tools/` (start with `src/mcp/tools/projects.ts`). Shared helpers in `src/mcp/result.ts`:
  - success → `{ content: [{ type: "text", text: JSON.stringify(value) }] }`
  - `DomainError` → `{ isError: true, content: [{ type: "text", text: "<CODE>: <message>" }] }` (never throw out of a tool).
  - `actorFor(args.actor)` → `resolveActorName(args.actor, urlActor)` then `assertAgentActor`.
- Every write tool accepts an optional `actor` string parameter. Tools in this task:
  - `list_projects` `{}` → `Project[]`
  - `create_project` `{ path: string, name?: string, key?: string, actor?: string }` → `Project` (validate the actor even though Projects have no Activity yet).
- Mount in `createApp`: `app.all("/mcp", …)` in **stateless** mode — for each request create a fresh `McpServer` + transport with `sessionIdGenerator: undefined`, read `actor` from the request URL query (`?actor=`), handle the request, and return the response. Prefer the SDK's Web-standard Streamable HTTP server transport (works directly with Hono `Request`/`Response`; check `node_modules/@modelcontextprotocol/sdk` for the exported class, e.g. `WebStandardStreamableHTTPServerTransport`). If the installed SDK only has the Node `IncomingMessage`/`ServerResponse` transport, bridge it via `c.env.incoming`/`c.env.outgoing` from `@hono/node-server` **and** make the in-process test harness below still work; document the choice in a comment.
- `test/mcp-helpers.ts`: `connectMcp(app, actor?)` → an MCP SDK `Client` connected with `StreamableHTTPClientTransport(new URL("http://awb.test/mcp" + (actor ? "?actor=" + actor : "")), { fetch: (url, init) => app.fetch(new Request(url, init)) })`; and `callTool(client, name, args)` → `{ isError, data }` where `data` is the parsed JSON text (or the raw text on error).
- `test/mcp-projects.test.ts`: tool list contains `list_projects` and `create_project`; `create_project` then `list_projects` returns it; errors come back as `isError` with `CONFLICT: …` / `VALIDATION: …`; `actor: "you"` → `isError` with the reserved message; URL `?actor=you` likewise; `resolveActorName` unit cases (param beats URL, URL beats default, default `agent`).

## Follow these existing patterns
- `src/server/routes/projects.ts` — MCP tools call the same `src/domain/projects.ts` functions as REST; no business rules inside tool handlers.
- `test/helpers.ts` — `makeTestApp()` for an isolated app with a temp data dir.
- `.cursor/feature-pipeline/agent-kanban-board/spec.md` — "Actor transport", "MCP tools".

## Do not
- Touch files outside: `src/mcp/`, `src/domain/actors.ts`, `src/server/app.ts`, `test/`, `package.json`, `pnpm-lock.yaml`.
- Add dependencies other than `@modelcontextprotocol/sdk` and `zod`; reformat unrelated code; commit.
- Add any delete tool.

## Done when
- An MCP client can connect to `http://127.0.0.1:4747/mcp` on a running server and call `list_projects` / `create_project`.
- `pnpm test && pnpm typecheck` passes.
