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

## Clarifications (checked against the code)
- **No separate toolbar:** `MarkdownEditor` already renders `EditorToolbar` inside itself (see `MarkdownEditor.tsx`). Render only `<MarkdownEditor .../>`; adding `EditorToolbar` as well would show two toolbars. All toolbar buttons are already `type="button"`, so they won't submit the form.
- **Remount per form open:** the editor reads `initialMarkdown` once, at creation. Give it `key={formMode === "edit" ? \`edit-${editingFeature?.id}\` : "create"}` so opening create, or editing a different Feature, loads the right content.
- **Dirty flag:**
  - Add `const [descDirty, setDescDirty] = useState(false)`. Reset it to `false` in `handleStartCreate`, `handleStartEdit` and `handleCancelForm`.
  - `onChange={(md) => { setDescDraft(md); setDescDirty(true); }}`.
  - In edit mode, the `patch` includes `description: descDraft` only when `descDirty`; otherwise the `description` key is omitted entirely (the server leaves it unchanged when undefined).
  - Create mode sends `description: descDraft` as today.
- **Keyboard:**
  - Add `const formRef = useRef<HTMLFormElement>(null)` on the `<form>`.
  - `onSave={() => formRef.current?.requestSubmit()}`, so the existing name validation runs.
  - `onCancel={handleCancelForm}`.
  - The editor's container already stops Escape propagation, so the panel's window-level Escape handler (lines ~55–66) won't also fire. Leave that handler as is.
- **Label:** a `<label htmlFor>` can't point at a contenteditable. Replace the description `<label htmlFor="feature-desc-input">` with `<span className="feature-form-label">Description</span>`, and pass `ariaLabel="Feature description"` and `placeholder="Description (Markdown supported)"` to the editor.
- **CSS (`features.css`):** add a rule scoped to the form, e.g. `.feature-form-panel .markdown-editor-content { min-height: 100px; }`. Don't change `MarkdownEditor.css`.
- **E2E (`e2e/editor.spec.ts`, new test 5):**
  - Open the panel with the "Features" button on the Board page, then "Create feature".
  - Type a name, then type and format in `[aria-label="Feature description"]` using the toolbar buttons ("Bold", "Bullet list"), and click "Create".
  - Read back with `request.get("/api/features/<id>")`. Find the id via `GET /api/projects/<key>/features`. The description contains `**` and `- `.
  - Then open that Feature's edit form, change only the name, and Save. The stored description is byte-identical to before. Also check that the PATCH request body has no `description` key (capture it with `page.on("request")` and `request.postDataJSON()`).
- Don't touch `e2e/helpers.ts` or the drag helpers. Don't add sleeps, locks or mutexes. Only read files inside this repository.
