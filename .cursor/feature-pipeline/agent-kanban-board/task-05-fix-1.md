# Task 05 fix 1: Modal steals focus on every keystroke; delete redirects to a stale Project

## Context
Task 05 (App shell UI) builds, typechecks and passes tests, but review found two behaviour bugs that break the "Done when" ("adding a Project via the dialog ... rename and delete work").

1. **Modal focus jumps on every re-render.** `src/web/components/Modal.tsx` lines 25–91: the single `useEffect` has deps `[isOpen, onClose]`. Callers pass a new `onClose` on every render (`AddProjectDialog.tsx` line 22 `handleClose` is recreated each render; `App.tsx` lines 149 and 155 pass inline arrows). Each keystroke in the Add project dialog calls `setPath`/`setName`/`setKey`, which re-renders, gives a new `onClose`, and re-runs the effect. The cleanup focuses the previously active element (line 89), and the new run's `setTimeout` focuses the first focusable in document order (lines 34–45). That is the header "✕" close button, which comes before the inputs. So after one typed character, focus leaves the field and the next keystrokes are lost. The same thing happens in `ProjectSettingsDialog` whenever `App` re-renders, for example after the projects refetch that a rename triggers.

2. **Deleting a Project can land on "Project not found" and re-save the deleted key.** In `src/web/api/projects.ts` lines 60–63, `useDeleteProject`'s `onSuccess` calls `invalidateQueries` but neither returns nor awaits it, so `mutateAsync` resolves before the projects list refetches. `ProjectSettingsDialog.tsx` line 92 then calls `navigate("/")`. `HomeRoute` (`App.tsx` lines 54–60) still sees the stale list, which contains the deleted Project, and may redirect to it (always, when it is the first or only Project). `ProjectRoute` (`App.tsx` lines 74–78) then writes the deleted key back into `awb:lastProject`. Once the refetch lands, the user sees "Project not found" instead of the next Project or the empty state. The same not-awaited pattern in `useCreateProject` (lines 32–34) and `useRenameProject` (lines 48–51) should be fixed the same way. Create is fine today only because `ProjectRoute` happens to show a loading state.

## Do
- `src/web/components/Modal.tsx`: make the focus and keyboard effect depend only on `isOpen`. Keep the latest `onClose` in a ref (`const onCloseRef = useRef(onClose); onCloseRef.current = onClose;` or update it in a separate effect) and call `onCloseRef.current()` from the Escape handler. Initial focus must go to the first focusable element **inside `.modal-content`** (fall back to the dialog itself), not the header close button, so that the Path field in Add project is focused when the dialog opens. Focus must be moved in only once per open, and returned to the previous element only on close or unmount.
- `src/web/api/projects.ts`: in `useCreateProject`, `useRenameProject` and `useDeleteProject`, make `onSuccess` return or await the `invalidateQueries` promise(s), so `mutateAsync` resolves only after `qk.projects` has refetched. Keep the `removeQueries` for `qk.project(key)` on delete.
- Keep everything else as is.

## Follow these existing patterns
- `src/web/components/Modal.tsx`: the existing Escape, overlay-click and Tab-trap logic stays; only the dependency and initial-focus handling change.
- `src/web/api/projects.ts`: the existing hook shapes and `qk` keys.

## Do not
- Touch files outside `src/web/`.
- Add dependencies.
- Implement the Board, cards or Ticket UI.

## Done when
- `grep -nE "\[isOpen, ?onClose\]" src/web/components/Modal.tsx` prints nothing, and `grep -n "onCloseRef\|useRef" src/web/components/Modal.tsx` shows the latest `onClose` is held in a ref.
- `grep -n "modal-content" src/web/components/Modal.tsx` shows the initial-focus query is scoped to the content area. For example, the `querySelector` for initial focus runs on the `.modal-content` element or a ref to it.
- `grep -nE "return queryClient.invalidateQueries|await queryClient.invalidateQueries|return Promise.all" src/web/api/projects.ts` matches in all three mutation hooks (at least 3 matches).
- Manual, with `pnpm build` and then `AWB_HOME=<tmp> AWB_PORT=<port> node bin/awb.js start`: in the Add project dialog, typing a multi-character path, name and key keeps focus in each field, and every character is kept. Deleting the only Project shows the empty state at `/`, not "Project not found".
- `pnpm test && pnpm typecheck && pnpm build` passes.
