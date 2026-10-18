# Task 14: Rich text editor for Ticket descriptions

## Context
The AI Work Board (repo root `/Users/neazmahmood/Desktop/projects/practice/ai-work-board`; web app in `apps/web`, a Vite React SPA) stores Ticket descriptions as **markdown**. Agents write markdown through MCP and the CLI, and search matches it, so that must not change. Today the Ticket modal edits the description in a plain `<textarea>`.

This task adds a WYSIWYG editor (Tiptap 3 + `tiptap-markdown`) that loads markdown and saves markdown. It offers only formatting that round-trips through GitHub-flavoured markdown. The read-only view stays `react-markdown`.

The editor is a shared component; the next task reuses it for Feature descriptions.

## Do
- Add dependencies at the workspace root (all third-party deps are hoisted there):
  ```
  pnpm add -w @tiptap/react@3.27.1 @tiptap/pm@3.27.1 @tiptap/starter-kit@3.27.1 @tiptap/extension-task-list@3.27.1 @tiptap/extension-task-item@3.27.1 @tiptap/extension-table@3.27.1 @tiptap/extension-table-row@3.27.1 @tiptap/extension-table-cell@3.27.1 @tiptap/extension-table-header@3.27.1 tiptap-markdown@^0.9.0
  ```
- `apps/web/src/components/editor/MarkdownEditor.tsx` (new) + `MarkdownEditor.css`:
  - Props: `initialMarkdown: string`, `onChange?: (markdown: string) => void`, `onSave?: () => void`, `onCancel?: () => void`, `autoFocus?: boolean`, `placeholder?: string`, `ariaLabel?: string`.
  - Extensions:
    - `StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false, link: { openOnClick: false, autolink: true } })` (in Tiptap 3, StarterKit already includes Link and Underline; disable Underline);
    - `TaskList`;
    - `TaskItem.configure({ nested: true })`;
    - `Table.configure({ resizable: false })`, `TableRow`, `TableHeader`, `TableCell`;
    - `Markdown.configure({ html: false, tightLists: true, linkify: false, breaks: false, transformPastedText: true })`.
  - No images, underline, colours, fonts, text alignment or mentions.
  - Content is loaded from `initialMarkdown` once, at creation.
  - `onChange` fires **only** after a user edit, i.e. a transaction with `docChanged` after initial load, with `editor.storage.markdown.getMarkdown()`. If the user never edits, it is never called.
  - Keyboard: Cmd/Ctrl+Enter → `onSave`, Esc → `onCancel`. Markdown input rules (`## `, `- `, `1. `, `[] `, ```` ``` ````, `> `) come from the extensions.
  - Give the editable element `data-testid="markdown-editor"`.
- `apps/web/src/components/editor/EditorToolbar.tsx` (new): a compact fixed toolbar above the editor. Buttons, each with `aria-label` and `aria-pressed` for active marks:
  - Heading 1/2/3, Bold, Italic, Strikethrough, Inline code, Code block
  - Bullet list, Numbered list, Task list
  - Link (asks for the URL with `window.prompt`; empty removes it), Blockquote, Horizontal rule
  - Insert table (3×3 with a header row)
  - Use inline SVG or text glyphs, with no icon library.
- `apps/web/src/components/ticket/TicketModal.tsx`:
  - Replace the description `<textarea>` with `MarkdownEditor` + `EditorToolbar`. Keep the Save/Cancel buttons and the existing `description-actions` layout.
  - Track the latest markdown from `onChange` in `descDraft`, plus a `descDirty` flag. Save sends the PATCH only when `descDirty` is true and the markdown differs, so opening and saving without edits never rewrites what an agent wrote.
  - Clicking the rendered description (not a link inside it) also starts editing, the same as the Edit button and the placeholder.
- `apps/web/src/components/ticket/TicketModal.css`: style the editor like the old textarea (border, focus ring, min-height about 140px). Tables, task-list checkboxes and code blocks must look the same as the read-only `Markdown` rendering (see `apps/web/src/components/Markdown.tsx` and its CSS).
- E2E: `e2e/editor.spec.ts` (new). Create a Project and Ticket through the API helpers in `e2e/helpers.ts`, open the Ticket modal, then:
  1. Use the toolbar to make a heading, bold text and a bullet list, type text, and Save. `getTicket` via the API returns the expected markdown (e.g. contains `## `, `**…**`, `- `).
  2. Type `## Title`, Enter, `- [ ] todo` and Save. The stored markdown contains `## Title` and `- [ ] todo`.
  3. Create a Ticket whose description has a GFM table, a task list and a fenced code block. Open the editor, then Save without typing. The API description is byte-identical, and no PATCH request was sent (watch `page.on("request")`).
  4. Edit, then press Esc. Nothing is saved. Edit, then press Cmd/Ctrl+Enter. It is saved.
- Update `e2e/board.spec.ts` "4. Modal edit and comment" if it types into the old description textarea, so it uses the editor.

## Follow these existing patterns
- `/Users/neazmahmood/Desktop/projects/web/viva-os/viva-os-ui/packages/ui/src/components/tiptap/hooks/useTiptap.ts`: the extension setup with `tiptap-markdown` (`Markdown` extension; read via `editor.storage.markdown.getMarkdown()`). Mirror only the markdown-safe extensions listed above.
- `/Users/neazmahmood/Desktop/projects/web/viva-os/viva-os-ui/packages/ui/src/components/tiptap/ui/TiptapToolbar.tsx` and `ToolbarButton.tsx`: toolbar structure and active-state handling.
- `apps/web/src/components/ticket/TicketModal.tsx`: the existing title and description edit/save/cancel state handling.

## Do not
- Touch files outside: `apps/web/src/components/editor/`, `apps/web/src/components/ticket/`, `e2e/`, root `package.json`, `pnpm-lock.yaml`
- Change the comment composer, inline Ticket creation, the server, MCP or CLI
- Add dependencies beyond the list above, reformat unrelated code, or commit

## Done when
- The Ticket description is edited in the rich editor and stored as markdown; open-and-save without edits changes nothing.
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm test:e2e` passes
