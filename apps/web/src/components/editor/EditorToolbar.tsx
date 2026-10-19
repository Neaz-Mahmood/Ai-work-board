import React from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

export type EditorToolbarProps = {
  editor: Editor | null;
};

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) {
    return null;
  }

  return <EditorToolbarInner editor={editor} />;
}

function EditorToolbarInner({ editor }: { editor: Editor }) {
  const activeStates = useEditorState({
    editor,
    selector: (ctx) => ({
      h1: ctx.editor.isActive("heading", { level: 1 }),
      h2: ctx.editor.isActive("heading", { level: 2 }),
      h3: ctx.editor.isActive("heading", { level: 3 }),
      bold: ctx.editor.isActive("bold"),
      italic: ctx.editor.isActive("italic"),
      strike: ctx.editor.isActive("strike"),
      code: ctx.editor.isActive("code"),
      codeBlock: ctx.editor.isActive("codeBlock"),
      bulletList: ctx.editor.isActive("bulletList"),
      orderedList: ctx.editor.isActive("orderedList"),
      taskList: ctx.editor.isActive("taskList"),
      link: ctx.editor.isActive("link"),
      blockquote: ctx.editor.isActive("blockquote"),
      table: ctx.editor.isActive("table"),
    }),
  });

  const handleLink = () => {
    const previousUrl = (editor.getAttributes("link").href as string | undefined) || "";
    const url = window.prompt("URL", previousUrl);
    if (url === null) {
      return;
    }
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  const handleInsertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting options">
      <div className="editor-toolbar-group">
        <button
          type="button"
          aria-label="Heading 1"
          aria-pressed={activeStates?.h1 ?? false}
          className={`editor-toolbar-btn ${activeStates?.h1 ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </button>
        <button
          type="button"
          aria-label="Heading 2"
          aria-pressed={activeStates?.h2 ?? false}
          className={`editor-toolbar-btn ${activeStates?.h2 ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          aria-label="Heading 3"
          aria-pressed={activeStates?.h3 ?? false}
          className={`editor-toolbar-btn ${activeStates?.h3 ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>
      </div>

      <div className="editor-toolbar-separator" />

      <div className="editor-toolbar-group">
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={activeStates?.bold ?? false}
          className={`editor-toolbar-btn ${activeStates?.bold ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={activeStates?.italic ?? false}
          className={`editor-toolbar-btn ${activeStates?.italic ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          aria-label="Strikethrough"
          aria-pressed={activeStates?.strike ?? false}
          className={`editor-toolbar-btn ${activeStates?.strike ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </button>
        <button
          type="button"
          aria-label="Inline code"
          aria-pressed={activeStates?.code ?? false}
          className={`editor-toolbar-btn ${activeStates?.code ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <code>&lt;&gt;</code>
        </button>
        <button
          type="button"
          aria-label="Code block"
          aria-pressed={activeStates?.codeBlock ?? false}
          className={`editor-toolbar-btn ${activeStates?.codeBlock ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
      </div>

      <div className="editor-toolbar-separator" />

      <div className="editor-toolbar-group">
        <button
          type="button"
          aria-label="Bullet list"
          aria-pressed={activeStates?.bulletList ?? false}
          className={`editor-toolbar-btn ${activeStates?.bulletList ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Numbered list"
          aria-pressed={activeStates?.orderedList ?? false}
          className={`editor-toolbar-btn ${activeStates?.orderedList ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="10" y1="6" x2="21" y2="6" />
            <line x1="10" y1="12" x2="21" y2="12" />
            <line x1="10" y1="18" x2="21" y2="18" />
            <path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Task list"
          aria-pressed={activeStates?.taskList ?? false}
          className={`editor-toolbar-btn ${activeStates?.taskList ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </button>
      </div>

      <div className="editor-toolbar-separator" />

      <div className="editor-toolbar-group">
        <button
          type="button"
          aria-label="Link"
          aria-pressed={activeStates?.link ?? false}
          className={`editor-toolbar-btn ${activeStates?.link ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleLink}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Blockquote"
          aria-pressed={activeStates?.blockquote ?? false}
          className={`editor-toolbar-btn ${activeStates?.blockquote ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h2c0 3-1 5-3 6v2zm13 0c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h2c0 3-1 5-3 6v2z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Horizontal rule"
          aria-pressed={false}
          className="editor-toolbar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Insert table"
          aria-pressed={activeStates?.table ?? false}
          className={`editor-toolbar-btn ${activeStates?.table ? "is-active" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleInsertTable}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
