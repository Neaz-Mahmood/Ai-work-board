# Task 16 fix 1: Remove the src/web import from test/claim.test.ts

## Context
Task 16 (Claim) is otherwise complete. Tests must stay at the approved seams (spec.md "Testing Decisions": Seam 1 app factory over HTTP + MCP, Seam 2 CLI). Vitest tests must not import anything from `src/web/`. `test/claim.test.ts` line 15 imports `formatActivityText` from `../src/web/components/ticket/activityText.ts`, and the test "activityText formats claimed as 'claimed this and started work'" (around lines 365-376) unit-tests that UI helper directly. Tasks 10 and 13 failed review for the same thing.

## Do
- In `test/claim.test.ts`:
  - Delete the import on line 15 (`import { formatActivityText } from "../src/web/components/ticket/activityText.ts";`).
  - Delete the whole test "activityText formats claimed as 'claimed this and started work'".
- Leave `src/web/components/ticket/activityText.ts` as it is (the `claimed` mapping is correct).
- The `claimed` Activity entry with `{ from: "todo", to: "in_progress" }` stays covered through the existing REST assertions; no new test is required.

## Follow these existing patterns
- `test/attention.test.ts` and `test/blockers.test.ts` test only via `createApp` / MCP client / CLI entry, never via `src/web/`.

## Do not
- Touch any file other than `test/claim.test.ts`.
- Add dependencies, reformat unrelated code, or commit.

## Done when
- `grep -rn "src/web" test/` prints nothing.
- `grep -n "formatActivityText" test/claim.test.ts` prints nothing.
- `pnpm test && pnpm typecheck && pnpm build` passes.
