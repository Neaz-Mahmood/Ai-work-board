# Task 15: Feature descriptions use the rich text editor

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`; web app in `apps/web`) stores Feature descriptions as markdown, like Ticket descriptions. The previous task built a shared rich text editor, `apps/web/src/components/editor/MarkdownEditor.tsx` + `EditorToolbar.tsx`. It loads markdown and calls `onChange(markdown)` only after a real user edit; Cmd/Ctrl+Enter calls `onSave`, Esc calls `onCancel`. The Ticket modal already uses it. This task uses the same editor in the Feature create/edit form.

## Do
- `apps/web/src/components/features/FeaturesPanel.tsx`: replace the description `<textarea id="feature-desc-input">` with `EditorToolbar` + `MarkdownEditor`:
  - `initialMarkdown` = the current draft;
  - `onChange` updates `descDraft` and sets a dirty flag;
  - `ariaLabel="Feature description"`.
  - On form submit, send `description` only when it was edited (for edits), so an untouched description is never rewritten. Creation sends the draft as today.
  - Cmd/Ctrl+Enter in the editor submits the form, and Esc cancels the form, matching the form's existing Save/Cancel.
- `apps/web/src/components/features/features.css`: size the editor for the form (min-height about 100px), reusing the editor's styles.
- E2E: in `e2e/editor.spec.ts`, add a case. Open the Features panel, create or edit a Feature, use the toolbar to bold a word and add a bullet list, and Save. The Feature's description via the API (`GET /api/features/:id`) contains `**` and `- `. Then reopen the form and save without touching the description: the stored description is unchanged.

## Follow these existing patterns
- `apps/web/src/components/ticket/TicketModal.tsx`: how the Ticket modal wires `MarkdownEditor`, `EditorToolbar` and the dirty flag.
- `e2e/editor.spec.ts`: the existing Ticket editor cases and how they read back via the API.

## Do not
- Touch files outside: `apps/web/src/components/features/`, `apps/web/src/components/editor/` (only if a small prop is genuinely missing), `e2e/`
- Change the server, comments or Ticket modal behaviour
- Add dependencies, reformat unrelated code, or commit

## Done when
- Feature descriptions are created and edited in the rich editor and stored as markdown.
- `pnpm typecheck` passes
- `pnpm test:e2e` passes
