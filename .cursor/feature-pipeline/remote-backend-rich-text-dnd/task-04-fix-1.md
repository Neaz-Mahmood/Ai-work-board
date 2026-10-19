# Task 04 fix 1: remove the claim-only mutex, drop the two-instance Claim test

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`) is converting its domain core from sync `ctx.db` to async `ctx.adb`. Task 04 is done and must be kept: the REST/MCP adapters await domain calls, and `setNeedsAttention`, `clearNeedsAttention`, `claimNextTicket` and `addComment` are async on `ctx.adb`.

One part is wrong. `src/domain/claim.ts` added a module-level `const claimMutex = createWriteMutex()` and wraps the whole of `claimNextTicket` in `claimMutex.run(...)`. It exists only to make the test "interleaving claims across two createApp instances opened on the same dataDir" in `test/claim.test.ts` pass. That test checks something the design rules out: ADR 0006 and ADR 0010 (`docs/adr/`) allow exactly one backend instance, and writes are serialized by that instance's write mutex inside `ctx.adb.tx`. Two instances on one data dir are unsupported, and the PGlite storage coming in task 07 cannot open the same data dir twice anyway. A mutex that covers only Claim also gives no real guarantee for other writes.

## Do
1. `src/domain/claim.ts`:
   - Remove the `createWriteMutex` import and the `claimMutex` constant.
   - Remove the `claimMutex.run(async () => { ... })` wrapper so `claimNextTicket` is again: validation, then `const claimedTicket = await ctx.adb.tx(async () => { ... })`, then the `ctx.events.emit` when a ticket was claimed, then `return claimedTicket;`.
   - Keep everything else agy wrote (async signature, `ctx.adb` calls, `lower(key) = lower(?)`), and keep the function body's indentation consistent (2 spaces per level, like the rest of the file).
2. `test/claim.test.ts`: delete the whole test `"interleaving claims across two createApp instances opened on the same dataDir -> no duplicates"`. Keep the single-app test `"20 parallel claims via Promise.all ..."`, which covers concurrency for the supported setup. Remove any imports that become unused (e.g. `createApp`), but only if nothing else in the file uses them.

## Do not
- Touch files other than `src/domain/claim.ts` and `test/claim.test.ts`
- Change `src/server/db.ts` or `src/server/writeMutex.ts`
- Add dependencies, reformat unrelated code, or commit

## Done when
- `grep -n claimMutex src/` finds nothing
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm test:e2e` passes
