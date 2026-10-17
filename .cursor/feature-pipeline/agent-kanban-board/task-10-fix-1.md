# Task 10 fix 1: Remove component-level tests from the Vitest suite

## Context
Task 10 is otherwise complete: the delete route, the modal and the `?selectedIssue=` routing all work, and `pnpm test && pnpm typecheck && pnpm build` passes. But `test/tickets-delete.test.ts` breaks the approved test-seam decision. spec.md ("Good tests exercise external behaviour only ... They do not reach into tables, internal modules or React components") says Vitest covers only Seam 1 (the app factory over HTTP/MCP/SSE) and Seam 2 (the CLI). UI behaviour belongs to Seam 3 (Playwright). The test file imports web code directly and unit-tests it:

- `test/tickets-delete.test.ts:5` — `import { renderToString } from "react-dom/server";`
- `test/tickets-delete.test.ts:8` — imports `formatActivityText, activityText` from `../src/web/components/ticket/activityText.ts`
- `test/tickets-delete.test.ts:9` — imports `Markdown` from `../src/web/components/Markdown.tsx`
- `test/tickets-delete.test.ts:140-220` — `test("activityText formats all activity kinds correctly", ...)`
- `test/tickets-delete.test.ts:222-end of that test` — `test("Markdown component renders GFM, escapes raw HTML, ...", ...)` (it also calls the component as a plain function)

## Do
- In `test/tickets-delete.test.ts`, delete the two tests above (activityText and Markdown) and the three imports at lines 5, 8 and 9.
- Leave the other three tests (REST delete, MCP no-delete tool, CLI `ticket delete` exits 2) exactly as they are.

## Follow these existing patterns
- `test/tickets.test.ts`, `test/mcp*.test.ts`: only HTTP, MCP-client and CLI seams; no imports from `src/web/`.

## Do not
- Touch any file other than `test/tickets-delete.test.ts`.
- Change product code, add dependencies, add a jsdom/React testing setup, or move these tests somewhere else under `test/`.
- Commit.

## Done when
- `grep -rn "src/web\|react-dom/server" test/` prints nothing.
- `grep -c "^  test(" test/tickets-delete.test.ts` prints `3`.
- `pnpm test && pnpm typecheck && pnpm build` passes.
