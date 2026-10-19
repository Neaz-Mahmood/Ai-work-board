import React, { useRef } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import { InputRule, type Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Markdown } from "tiptap-markdown";
import { EditorToolbar } from "./EditorToolbar.tsx";
import "./MarkdownEditor.css";

const CustomTaskItem = TaskItem.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*(?:[-+*]\s+)?(\[([( |x])?\])\s$/,
        handler: ({ state, range, match, chain }) => {
          const checked = match[match.length - 1] === "x";
          const $from = state.doc.resolve(range.from);
          let inListItem = false;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "listItem") {
              inListItem = true;
              break;
            }
          }
          const c = chain().deleteRange(range);
          if (inListItem) c.liftListItem("listItem");
          c.toggleList("taskList", "taskItem").updateAttributes("taskItem", { checked }).run();
        },
      }),
    ];
  },
});

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

export type MarkdownEditorProps = {
  initialMarkdown: string;
  onChange?: (markdown: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  ariaLabel?: string;
};

export function MarkdownEditor({
  initialMarkdown,
  onChange,
  onSave,
  onCancel,
  autoFocus,
  placeholder,
  ariaLabel,
}: MarkdownEditorProps) {
  const isCreatedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          underline: false,
          link: { openOnClick: false, autolink: true },
        }),
        TaskList,
        CustomTaskItem.configure({ nested: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        Markdown.configure({
          html: false,
          tightLists: true,
          linkify: false,
          breaks: false,
          transformPastedText: true,
        }),
      ],
      content: initialMarkdown,
      autofocus: autoFocus ?? false,
      editorProps: {
        attributes: {
          class: "markdown-content markdown-editor-content",
          "data-testid": "markdown-editor",
          ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
          ...(placeholder ? { "data-placeholder": placeholder } : {}),
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSaveRef.current?.();
            return true;
          }
          return false;
        },
      },
      onCreate: () => {
        isCreatedRef.current = true;
      },
      onUpdate: ({ editor: currentEditor, transaction }) => {
        if (!isCreatedRef.current) return;
        if (!transaction.docChanged) return;
        if (transaction.getMeta("addToHistory") === false) return;
        onChangeRef.current?.(getMarkdown(currentEditor));
      },
    },
    []
  );

  const isEmpty =
    useEditorState({
      editor,
      selector: (ctx) => ctx.editor.isEmpty,
    }) ?? false;

  return (
    <div
      className="markdown-editor-container"
      onKeyDownCapture={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          e.preventDefault();
          onCancelRef.current?.();
        }
      }}
    >
      <EditorToolbar editor={editor} />
      <div className="markdown-editor-body">
        <EditorContent editor={editor} className="markdown-editor-content-wrapper" />
        {placeholder && isEmpty && (
          <div className="markdown-editor-placeholder" aria-hidden="true">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
