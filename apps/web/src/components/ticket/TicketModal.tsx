import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { Actor, ColumnId, Priority } from "@awb/shared/types.ts";
import { COLUMNS } from "@awb/shared/columns.ts";
import { Modal } from "../Modal.tsx";
import { PriorityIcon } from "../PriorityIcon.tsx";
import { ActorAvatar } from "../ActorAvatar.tsx";
import { Markdown } from "../Markdown.tsx";
import { MarkdownEditor } from "../editor/MarkdownEditor.tsx";
import {
  useTicket,
  useUpdateTicket,
  useDeleteTicket,
  useMoveTicket,
  useAddComment,
  useAddBlocker,
  useRemoveBlocker,
  useSetNeedsAttention,
  useClearNeedsAttention,
} from "../../api/tickets.ts";
import { ActivityItem, formatRelativeTime } from "./activityText.ts";
import { useFeatures } from "../../api/features.ts";
import "../features/features.css";
import "./TicketModal.css";

const COLUMN_NAMES: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

for (const col of COLUMNS) {
  COLUMN_NAMES[col.id] = col.name;
}

const PRIORITIES: { id: Priority; name: string }[] = [
  { id: "highest", name: "Highest" },
  { id: "high", name: "High" },
  { id: "medium", name: "Medium" },
  { id: "low", name: "Low" },
  { id: "lowest", name: "Lowest" },
];

function LinkIcon() {
  return (
    <svg
      width="16"
      height="16"
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
  );
}

function buildTicketUrl(ticketKey: string): string {
  const url = new URL(window.location.href);
  const share = new URL(url.pathname, url.origin);
  share.searchParams.set("selectedIssue", ticketKey);
  return share.toString();
}

function DetailsMenu({
  id,
  listboxId,
  label,
  value,
  options,
  onChange,
  menuClassName = "column-picker-menu",
  optionClassName = "column-picker-option",
}: {
  id: string;
  listboxId: string;
  label: string;
  value: string;
  options: { value: string; label: string; content: React.ReactNode }[];
  onChange: (value: string) => void;
  menuClassName?: string;
  optionClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    const selected = rootRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    selected?.focus();
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const moveFocus = (currentEl: HTMLElement, direction: 1 | -1) => {
    const items = [
      ...currentEl.parentElement!.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    const index = items.indexOf(currentEl as HTMLButtonElement);
    const next = items[index + direction] ?? items[direction === 1 ? 0 : items.length - 1];
    next?.focus();
  };

  return (
    <div className="column-picker" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="column-picker-trigger"
        aria-label={`${label}: ${current?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="details-menu-value">{current?.content}</span>
        <svg className="column-picker-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 6.5 8 10.5 12 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div id={listboxId} className={menuClassName} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value || "none"}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={optionClassName}
              onClick={() => {
                if (option.value !== value) onChange(option.value);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  e.stopPropagation();
                  moveFocus(e.currentTarget, 1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  e.stopPropagation();
                  moveFocus(e.currentTarget, -1);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  rootRef.current?.querySelector<HTMLButtonElement>(".column-picker-trigger")?.focus();
                }
              }}
            >
              {option.content}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnPicker({
  value,
  onChange,
}: {
  value: ColumnId;
  onChange: (column: ColumnId) => void;
}) {
  return (
    <DetailsMenu
      id="ticket-column-select"
      listboxId="ticket-column-listbox"
      label="Column"
      value={value}
      onChange={(column) => onChange(column as ColumnId)}
      options={COLUMNS.map((col) => ({
        value: col.id,
        label: col.name,
        content: <span className={`column-chip column-chip--${col.id}`}>{col.name}</span>,
      }))}
    />
  );
}

export type TicketModalProps = {
  ticketKey?: string | null;
  isOpen: boolean;
  onClose: () => void;
  actors?: Actor[];
  projectKey?: string;
  onSelectTicket?: (ticketKey: string) => void;
};

export function TicketModal({
  ticketKey,
  isOpen,
  onClose,
  actors = [],
  projectKey: propProjectKey,
  onSelectTicket,
}: TicketModalProps) {
  const { data: ticket, isLoading, error } = useTicket(ticketKey);
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();
  const addBlocker = useAddBlocker();
  const removeBlocker = useRemoveBlocker();
  const setNeedsAttention = useSetNeedsAttention();
  const clearNeedsAttention = useClearNeedsAttention();
  const [searchParams, setSearchParams] = useSearchParams();

  const [blockerDraft, setBlockerDraft] = useState("");
  const [isFlagFormOpen, setIsFlagFormOpen] = useState(false);
  const [attentionDraft, setAttentionDraft] = useState("");

  const resolvedProjectKey = ticket?.projectKey ?? propProjectKey ?? "";
  const moveTicket = useMoveTicket(resolvedProjectKey);
  const { data: features } = useFeatures(resolvedProjectKey);

  // Menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In-place title edit
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const cancellingTitleRef = useRef(false);

  // Description edit
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [descDirty, setDescDirty] = useState(false);

  // Assignee draft
  const [assigneeDraft, setAssigneeDraft] = useState("");

  // Comments and Activity tabs & composer state
  const [activeTab, setActiveTab] = useState<"comments" | "activity">("comments");
  const [commentDraft, setCommentDraft] = useState("");
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const addComment = useAddComment(ticket?.key ?? "");

  useEffect(() => {
    setActiveTab("comments");
    setCommentDraft("");
    setIsComposerFocused(false);
    setBlockerDraft("");
    setIsFlagFormOpen(false);
    setAttentionDraft("");
    setIsEditingDesc(false);
    setDescDirty(false);
    setLinkCopied(false);
  }, [ticketKey]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyTicketUrl = async (key: string) => {
    const url = buildTicketUrl(key);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setLinkCopied(true);
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = setTimeout(() => {
      setLinkCopied(false);
      copyResetTimeoutRef.current = null;
    }, 1500);
  };

  const handleResolveAttention = () => {
    if (!ticket || clearNeedsAttention.isPending) return;
    clearNeedsAttention.mutate(ticket.key);
  };

  const handleSetAttention = () => {
    const trimmed = attentionDraft.trim();
    if (!trimmed || !ticket || setNeedsAttention.isPending) return;
    setNeedsAttention.mutate(
      { ticketKey: ticket.key, reason: trimmed },
      {
        onSuccess: () => {
          setIsFlagFormOpen(false);
          setAttentionDraft("");
        },
      }
    );
  };

  const handleOpenTicket = (key: string) => {
    if (onSelectTicket) {
      onSelectTicket(key);
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("selectedIssue", key);
        return next;
      });
    }
  };

  const handleAddBlocker = () => {
    const trimmed = blockerDraft.trim();
    if (!trimmed || !ticket || addBlocker.isPending) return;
    addBlocker.mutate(
      { ticketKey: ticket.key, blockerKey: trimmed },
      {
        onSuccess: () => {
          setBlockerDraft("");
        },
      }
    );
  };

  const handleRemoveBlocker = (bKey: string) => {
    if (!ticket || removeBlocker.isPending) return;
    removeBlocker.mutate({ ticketKey: ticket.key, blockerKey: bKey });
  };

  useEffect(() => {
    if (ticket) {
      setTitleDraft(ticket.title);
      if (!isEditingDesc) {
        setDescDraft(ticket.description ?? "");
      }
      setAssigneeDraft(ticket.assignee ?? "");
    }
  }, [ticket?.title, ticket?.description, ticket?.assignee, isEditingDesc]);

  // Click outside menu listener
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  if (!isOpen) {
    return null;
  }

  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} maxWidth="960px" ariaLabel="Loading ticket">
        <div className="ticket-modal-loading">Loading {ticketKey}...</div>
      </Modal>
    );
  }

  if (error || !ticket) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} maxWidth="960px" ariaLabel="Ticket not found">
        <div className="ticket-modal-header">
          <span className="ticket-modal-key">{ticketKey}</span>
          <div className="ticket-modal-header-actions">
            {ticketKey && (
              <button
                type="button"
                className="ticket-modal-copy-link"
                onClick={() => handleCopyTicketUrl(ticketKey)}
                aria-label={linkCopied ? "Ticket link copied" : "Copy ticket link"}
                title={linkCopied ? "Copied!" : "Copy ticket link"}
              >
                <LinkIcon />
              </button>
            )}
            <button
              type="button"
              className="modal-close-button"
              onClick={onClose}
              aria-label="Close dialog"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="ticket-modal-error">
          {error instanceof Error ? error.message : `Ticket ${ticketKey} not found`}
        </div>
      </Modal>
    );
  }

  const handleSaveTitle = () => {
    if (cancellingTitleRef.current) {
      cancellingTitleRef.current = false;
      return;
    }
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== ticket.title) {
      updateTicket.mutate({
        ticketKey: ticket.key,
        patch: { title: trimmed },
      });
    } else {
      setTitleDraft(ticket.title);
    }
  };

  const handleCancelTitle = () => {
    cancellingTitleRef.current = true;
    setTitleDraft(ticket.title);
    setIsEditingTitle(false);
  };

  const handleStartEditDesc = () => {
    setDescDraft(ticket.description ?? "");
    setDescDirty(false);
    setIsEditingDesc(true);
  };

  const handleSaveDesc = () => {
    setIsEditingDesc(false);
    if (descDirty && descDraft !== (ticket.description ?? "")) {
      updateTicket.mutate({
        ticketKey: ticket.key,
        patch: { description: descDraft },
      });
    }
    setDescDirty(false);
  };

  const handleCancelDesc = () => {
    setDescDraft(ticket.description ?? "");
    setDescDirty(false);
    setIsEditingDesc(false);
  };

  const handleSaveAssignee = () => {
    const trimmed = assigneeDraft.trim();
    const current = ticket.assignee ?? "";
    if (trimmed !== current) {
      updateTicket.mutate({
        ticketKey: ticket.key,
        patch: { assignee: trimmed.length > 0 ? trimmed : null },
      });
    }
  };

  const handleSaveComment = () => {
    const trimmed = commentDraft.trim();
    if (!trimmed || addComment.isPending || !ticket) return;
    addComment.mutate(trimmed, {
      onSuccess: () => {
        setCommentDraft("");
        setIsComposerFocused(false);
      },
    });
  };

  const handleCancelComment = () => {
    setCommentDraft("");
    setIsComposerFocused(false);
  };

  const handleConfirmDelete = () => {
    deleteTicket.mutate(ticket.key, {
      onSuccess: () => {
        setIsConfirmDeleteOpen(false);
        onClose();
      },
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="960px"
        ariaLabel={`Ticket details for ${ticket.key}`}
      >
        <div className="ticket-modal">
          {/* Header */}
          <div className="ticket-modal-header">
            <span className="ticket-modal-key">{ticket.key}</span>
            <div className="ticket-modal-header-actions">
              <div className="ticket-modal-menu" ref={menuRef}>
                <button
                  type="button"
                  className="ticket-modal-menu-trigger"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  aria-label="More actions"
                  aria-haspopup="true"
                  aria-expanded={isMenuOpen}
                >
                  ⋯
                </button>
                {isMenuOpen && (
                  <div className="ticket-modal-menu-dropdown" role="menu">
                    <button
                      type="button"
                      className="ticket-modal-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsConfirmDeleteOpen(true);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="ticket-modal-copy-link"
                onClick={() => handleCopyTicketUrl(ticket.key)}
                aria-label={linkCopied ? "Ticket link copied" : "Copy ticket link"}
                title={linkCopied ? "Copied!" : "Copy ticket link"}
              >
                <LinkIcon />
              </button>
              <button
                type="button"
                className="modal-close-button"
                onClick={onClose}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Two-column Body */}
          <div className="ticket-modal-body">
            {/* Left Column */}
            <div className="ticket-modal-main">
              {ticket.needsAttention && (
                <div className="ticket-modal-attention-banner">
                  <div className="ticket-modal-attention-text">
                    Needs attention: {ticket.needsAttention}
                  </div>
                  <button
                    type="button"
                    className="ticket-modal-attention-resolve-btn"
                    onClick={handleResolveAttention}
                    disabled={clearNeedsAttention.isPending}
                  >
                    Resolve
                  </button>
                </div>
              )}

              {/* In-place Editable Title */}
              <div className="ticket-modal-title-wrapper">
                {isEditingTitle ? (
                  <input
                    type="text"
                    className="ticket-modal-title-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveTitle();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCancelTitle();
                      }
                    }}
                    onBlur={handleSaveTitle}
                    autoFocus
                  />
                ) : (
                  <div
                    className="ticket-modal-title-display"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setTitleDraft(ticket.title);
                      setIsEditingTitle(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setTitleDraft(ticket.title);
                        setIsEditingTitle(true);
                      }
                    }}
                    title="Click to edit title"
                  >
                    <h1 className="ticket-modal-title-text">{ticket.title}</h1>
                  </div>
                )}
              </div>

              {/* Description Section */}
              <div className="ticket-modal-section">
                <div className="ticket-modal-section-header">
                  <h3 className="ticket-modal-section-title">Description</h3>
                  {!isEditingDesc && (
                    <button
                      type="button"
                      className="button-subtle description-edit-btn"
                      onClick={handleStartEditDesc}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingDesc ? (
                  <div>
                    <MarkdownEditor
                      initialMarkdown={descDraft}
                      onChange={(markdown) => {
                        setDescDraft(markdown);
                        setDescDirty(true);
                      }}
                      onSave={handleSaveDesc}
                      onCancel={handleCancelDesc}
                      autoFocus
                      placeholder="Add a description..."
                      ariaLabel="Description"
                    />
                    <div className="description-actions">
                      <button
                        type="button"
                        className="button-primary"
                        onClick={handleSaveDesc}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={handleCancelDesc}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : ticket.description ? (
                  <div
                    className="description-rendered"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a")) {
                        return;
                      }
                      handleStartEditDesc();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleStartEditDesc();
                      }
                    }}
                  >
                    <Markdown>{ticket.description}</Markdown>
                  </div>
                ) : (
                  <div
                    className="description-placeholder"
                    role="button"
                    tabIndex={0}
                    onClick={handleStartEditDesc}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleStartEditDesc();
                      }
                    }}
                  >
                    Add a description...
                  </div>
                )}
              </div>

              {/* Tabs Section */}
              <div className="ticket-modal-section">
                <div className="ticket-modal-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "comments"}
                    className={`ticket-tab-button ${activeTab === "comments" ? "active" : ""}`}
                    onClick={() => setActiveTab("comments")}
                  >
                    Comments
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "activity"}
                    className={`ticket-tab-button ${activeTab === "activity" ? "active" : ""}`}
                    onClick={() => setActiveTab("activity")}
                  >
                    Activity
                  </button>
                </div>

                {activeTab === "comments" && (
                  <div className="comments-tab-content">
                    <div className="comment-composer">
                      <textarea
                        className={`comment-composer-textarea ${isComposerFocused || commentDraft.length > 0 ? "expanded" : ""}`}
                        placeholder="Add a comment…"
                        value={commentDraft}
                        rows={isComposerFocused || commentDraft.length > 0 ? 4 : 1}
                        onFocus={() => setIsComposerFocused(true)}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            handleSaveComment();
                          }
                        }}
                      />
                      {(isComposerFocused || commentDraft.length > 0) && (
                        <div className="comment-composer-actions">
                          <button
                            type="button"
                            className="button-primary"
                            disabled={addComment.isPending || !commentDraft.trim()}
                            onClick={handleSaveComment}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={addComment.isPending}
                            onClick={handleCancelComment}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="comments-list">
                      {ticket.comments && ticket.comments.length > 0 ? (
                        [...ticket.comments].reverse().map((comment) => (
                          <div key={comment.id} className="comment-item">
                            <ActorAvatar name={comment.actor} actors={actors} />
                            <div className="comment-item-content">
                              <div className="comment-item-header">
                                <span className="comment-actor-name">{comment.actor}</span>
                                <span className="comment-time" title={comment.createdAt}>
                                  {formatRelativeTime(comment.createdAt)}
                                </span>
                              </div>
                              <div className="comment-item-body">
                                <Markdown>{comment.body}</Markdown>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="comments-empty">No comments yet</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "activity" && (
                  <div className="activity-list">
                    {ticket.activity && ticket.activity.length > 0 ? (
                      ticket.activity.map((entry) => (
                        <ActivityItem
                          key={entry.id}
                          entry={entry}
                          actors={actors}
                        />
                      ))
                    ) : (
                      <div className="activity-empty">No activity yet</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side Panel: Details */}
            <div className="ticket-modal-details">
              <h3 className="details-panel-title">Details</h3>

              {/* Column Select */}
              <div className="details-field">
                <label htmlFor="ticket-column-select" className="details-label">
                  Column
                </label>
                <ColumnPicker
                  key={ticket.key}
                  value={ticket.column}
                  onChange={(column) => {
                    moveTicket.mutate({
                      ticketKey: ticket.key,
                      column,
                    });
                  }}
                />
              </div>

              {/* Assignee Input */}
              <div className="details-field">
                <label htmlFor="ticket-assignee-input" className="details-label">
                  Assignee
                </label>
                <div className="assignee-input-container">
                  {assigneeDraft.trim() && (
                    <ActorAvatar name={assigneeDraft.trim()} actors={actors} />
                  )}
                  <input
                    id="ticket-assignee-input"
                    type="text"
                    list="assignee-suggestions"
                    value={assigneeDraft}
                    placeholder="Unassigned"
                    onChange={(e) => setAssigneeDraft(e.target.value)}
                    onBlur={handleSaveAssignee}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <datalist id="assignee-suggestions">
                    {actors.map((a) => (
                      <option key={a.name} value={a.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Priority Select */}
              <div className="details-field">
                <label htmlFor="ticket-priority-select" className="details-label">
                  Priority
                </label>
                <DetailsMenu
                  id="ticket-priority-select"
                  listboxId="ticket-priority-listbox"
                  label="Priority"
                  value={ticket.priority}
                  menuClassName="column-picker-menu details-menu"
                  optionClassName="details-menu-option"
                  onChange={(priority) => {
                    if (priority !== ticket.priority) {
                      updateTicket.mutate({
                        ticketKey: ticket.key,
                        patch: { priority: priority as Priority },
                      });
                    }
                  }}
                  options={PRIORITIES.map((priority) => ({
                    value: priority.id,
                    label: priority.name,
                    content: (
                      <>
                        <PriorityIcon priority={priority.id} />
                        <span className="details-menu-label">{priority.name}</span>
                      </>
                    ),
                  }))}
                />
              </div>

              {/* Feature Select */}
              <div className="details-field">
                <label htmlFor="ticket-feature-select" className="details-label">
                  Feature
                </label>
                <DetailsMenu
                  id="ticket-feature-select"
                  listboxId="ticket-feature-listbox"
                  label="Feature"
                  value={ticket.feature?.id ? String(ticket.feature.id) : ""}
                  menuClassName="column-picker-menu details-menu"
                  optionClassName="details-menu-option"
                  onChange={(val) => {
                    const current = ticket.feature?.id ? String(ticket.feature.id) : "";
                    if (val === current) return;
                    updateTicket.mutate({
                      ticketKey: ticket.key,
                      projectKey: resolvedProjectKey,
                      patch: { featureId: val === "" ? null : parseInt(val, 10) },
                    });
                  }}
                  options={[
                    {
                      value: "",
                      label: "None",
                      content: (
                        <>
                          <span className="feature-color-swatch feature-color-swatch--none" aria-hidden />
                          <span className="details-menu-label">None</span>
                        </>
                      ),
                    },
                    ...(ticket.feature && !features?.some((f) => f.id === ticket.feature?.id)
                      ? [{
                          value: String(ticket.feature.id),
                          label: ticket.feature.name,
                          content: (
                            <>
                              <span
                                className="feature-color-swatch"
                                style={{ backgroundColor: ticket.feature.color }}
                                aria-hidden
                              />
                              <span className="details-menu-label">{ticket.feature.name}</span>
                            </>
                          ),
                        }]
                      : []),
                    ...(features ?? []).map((feature) => ({
                      value: String(feature.id),
                      label: feature.name,
                      content: (
                        <>
                          <span
                            className="feature-color-swatch"
                            style={{ backgroundColor: feature.color }}
                            aria-hidden
                          />
                          <span className="details-menu-label">{feature.name}</span>
                        </>
                      ),
                    })),
                  ]}
                />
              </div>

              {/* Needs Attention Section */}
              <div className="details-field">
                <span className="details-label">Attention</span>
                {isFlagFormOpen ? (
                  <form
                    className="attention-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSetAttention();
                    }}
                  >
                    <textarea
                      className="attention-form-textarea"
                      placeholder="Why does this need attention?"
                      value={attentionDraft}
                      onChange={(e) => setAttentionDraft(e.target.value)}
                      maxLength={500}
                      rows={3}
                      autoFocus
                    />
                    <div className="attention-form-actions">
                      <button
                        type="submit"
                        className="button-primary"
                        disabled={!attentionDraft.trim() || setNeedsAttention.isPending}
                      >
                        Flag
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          setIsFlagFormOpen(false);
                          setAttentionDraft("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="button-secondary flag-attention-button"
                    onClick={() => {
                      setAttentionDraft(ticket.needsAttention ?? "");
                      setIsFlagFormOpen(true);
                    }}
                  >
                    Flag as needs attention
                  </button>
                )}
              </div>

              {/* Blocked by Section */}
              <div className="details-field">
                <span className="details-label">Blocked by</span>
                <div className="blockers-list">
                  {ticket.blockers && ticket.blockers.length > 0 ? (
                    ticket.blockers.map((b) => (
                      <div key={b.key} className="blocker-item">
                        <button
                          type="button"
                          className="blocker-link-button"
                          onClick={() => handleOpenTicket(b.key)}
                          title={`Open ${b.key}`}
                        >
                          <span className="blocker-key">{b.key}</span>
                          <span className="blocker-title">{b.title}</span>
                          <span className="lozenge lozenge-column">
                            {COLUMN_NAMES[b.column] ?? b.column}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="blocker-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveBlocker(b.key);
                          }}
                          aria-label={`Remove blocker ${b.key}`}
                          title="Remove blocker"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="blockers-empty">None</div>
                  )}
                </div>
                <form
                  className="add-blocker-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddBlocker();
                  }}
                >
                  <input
                    type="text"
                    className="add-blocker-input"
                    placeholder="Add blocker (e.g. AWB-2)"
                    value={blockerDraft}
                    onChange={(e) => setBlockerDraft(e.target.value)}
                  />
                </form>
              </div>

              {/* Blocks Section */}
              <div className="details-field">
                <span className="details-label">Blocks</span>
                <div className="blocks-list">
                  {ticket.blocks && ticket.blocks.length > 0 ? (
                    ticket.blocks.map((b) => (
                      <div key={b.key} className="blocker-item">
                        <button
                          type="button"
                          className="blocker-link-button"
                          onClick={() => handleOpenTicket(b.key)}
                          title={`Open ${b.key}`}
                        >
                          <span className="blocker-key">{b.key}</span>
                          <span className="blocker-title">{b.title}</span>
                          <span className="lozenge lozenge-column">
                            {COLUMN_NAMES[b.column] ?? b.column}
                          </span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="blockers-empty">None</div>
                  )}
                </div>
              </div>

              {/* Created Relative Time */}
              <div className="details-field">
                <span className="details-label">Created</span>
                <span className="details-date" title={ticket.createdAt}>
                  {formatRelativeTime(ticket.createdAt)}
                </span>
              </div>

              {/* Updated Relative Time */}
              <div className="details-field">
                <span className="details-label">Updated</span>
                <span className="details-date" title={ticket.updatedAt}>
                  {formatRelativeTime(ticket.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirmation Dialog for Delete */}
      <Modal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        title={`Delete ${ticket.key}?`}
      >
        <div className="delete-dialog-content">
          <p className="delete-dialog-message">
            Delete {ticket.key}? This can't be undone.
          </p>
          <div className="delete-dialog-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setIsConfirmDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleConfirmDelete}
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
