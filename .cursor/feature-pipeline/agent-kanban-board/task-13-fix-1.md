# Task 13 fix 1: Remove the src/web import from test/attention.test.ts

## Context
Task 13 (Needs Attention) is otherwise complete. Tests must stay at the approved seams (spec.md "Testing": Seam 1 app factory over HTTP + MCP, Seam 2 CLI). Vitest tests must not import anything from `src/web/`. `test/attention.test.ts` line 14 imports `formatActivityText` from `../src/web/components/ticket/activityText.ts`, and the last test ("UI activityText formatting for attention_flagged and attention_cleared", around lines 474-492) unit-tests that UI helper directly. No other file in `test/` imports from `src/web/`.

## Do
- In `test/attention.test.ts`:
  - Delete the import on line 14 (`import { formatActivityText } from "../src/web/components/ticket/activityText.ts";`).
  - Delete the whole test "UI activityText formatting for attention_flagged and attention_cleared".
- Leave `src/web/components/ticket/activityText.ts` as it is (its mappings are correct).
- If you want the Activity payloads covered, assert them through REST instead (already covered by the existing REST tests checking `attention_flagged` / `attention_cleared` entries with `{ reason }`); no new test is required.

## Follow these existing patterns
- Other files in `test/` (e.g. `test/blockers.test.ts`, `test/comments.test.ts`) test only via `createApp` / MCP client / CLI entry, never via `src/web/`.

## Do not
- Touch any file other than `test/attention.test.ts`.
- Add dependencies, reformat unrelated code, or commit.

## Done when
- `grep -rn "src/web" test/` prints nothing.
- `pnpm test && pnpm typecheck && pnpm build` passes.
