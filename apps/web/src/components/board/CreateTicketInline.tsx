import React, { useState, useRef, useEffect } from "react";
import type { ColumnId } from "@awb/shared/types.ts";
import { useCreateTicket } from "../../api/tickets.ts";

export type CreateTicketInlineProps = {
  columnId: ColumnId;
  projectKey?: string;
};

export function CreateTicketInline({
  columnId,
  projectKey = "",
}: CreateTicketInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const createTicket = useCreateTicket(projectKey);

  useEffect(() => {
    if (isOpen) {
      textareaRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (createTicket.isPending) {
      return;
    }

    setServerError(null);
    createTicket.mutate(
      {
        title: title.trim(),
        column: columnId,
      },
      {
        onSuccess: () => {
          setTitle("");
          setServerError(null);
          textareaRef.current?.focus();
        },
        onError: (err) => {
          setServerError(err.message || "Failed to create ticket");
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // IME safety check for input composition
      if (e.nativeEvent.isComposing || (e as any).keyCode === 229) {
        return;
      }
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setTitle("");
      setServerError(null);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (formRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    // Escape or blur with empty text cancels
    if (title.trim() === "") {
      setIsOpen(false);
      setTitle("");
      setServerError(null);
    }
  };

  if (!isOpen) {
    return (
      <div className="create-ticket-inline">
        <button
          type="button"
          className="create-ticket-btn"
          onClick={() => {
            setIsOpen(true);
            setServerError(null);
          }}
          aria-label={`Create ticket in ${columnId}`}
        >
          <span className="create-ticket-plus" aria-hidden="true">+</span> Create
        </button>
      </div>
    );
  }

  return (
    <div className="create-ticket-inline">
      <form
        ref={formRef}
        className="create-ticket-form"
        onSubmit={handleSubmit}
        onBlur={handleBlur}
      >
        <label
          htmlFor={`create-ticket-input-${columnId}`}
          className="visually-hidden"
        >
          What needs to be done?
        </label>
        <textarea
          id={`create-ticket-input-${columnId}`}
          ref={textareaRef}
          className="create-ticket-textarea"
          placeholder="What needs to be done?"
          value={title}
          disabled={createTicket.isPending}
          onChange={(e) => {
            setTitle(e.target.value);
            if (serverError) {
              setServerError(null);
            }
          }}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        {serverError && (
          <div className="create-ticket-error" role="alert">
            {serverError}
          </div>
        )}
        <div className="create-ticket-actions">
          <button
            type="submit"
            className="create-ticket-submit-btn"
            disabled={createTicket.isPending}
            onMouseDown={(e) => e.preventDefault()}
          >
            {createTicket.isPending ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className="create-ticket-cancel-btn"
            disabled={createTicket.isPending}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setIsOpen(false);
              setTitle("");
              setServerError(null);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
