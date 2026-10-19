import React, { useState, useEffect, useRef } from "react";
import type { Feature } from "@awb/shared/types.ts";
import {
  useFeatures,
  useCreateFeature,
  useUpdateFeature,
  useDeleteFeature,
  FEATURE_PALETTE,
} from "../../api/features.ts";
import { Modal } from "../Modal.tsx";
import { Markdown } from "../Markdown.tsx";
import { MarkdownEditor } from "../editor/MarkdownEditor.tsx";
import "./features.css";

export type FeaturesPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  projectKey: string;
};

export function FeaturesPanel({ isOpen, onClose, projectKey }: FeaturesPanelProps) {
  const { data: features = [], isLoading, error } = useFeatures(projectKey);
  const createFeature = useCreateFeature(projectKey);
  const updateFeature = useUpdateFeature(projectKey);
  const deleteFeature = useDeleteFeature(projectKey);

  // Expanded feature descriptions
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Form mode: "closed" | "create" | "edit"
  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [descDirty, setDescDirty] = useState(false);
  const [colorDraft, setColorDraft] = useState<string>(FEATURE_PALETTE[0]);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [featureToDelete, setFeatureToDelete] = useState<Feature | null>(null);

  const drawerRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFormMode("closed");
      setEditingFeature(null);
      setFeatureToDelete(null);
      setDescDirty(false);
      return;
    }

    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (featureToDelete) {
          setFeatureToDelete(null);
          return;
        }
        if (formMode !== "closed") {
          setFormMode("closed");
          return;
        }
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [isOpen, featureToDelete, formMode, onClose]);

  if (!isOpen) {
    return null;
  }

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStartCreate = () => {
    setEditingFeature(null);
    setNameDraft("");
    setDescDraft("");
    setDescDirty(false);
    setColorDraft(FEATURE_PALETTE[0]);
    setFormError(null);
    setFormMode("create");
  };

  const handleStartEdit = (feat: Feature) => {
    setEditingFeature(feat);
    setNameDraft(feat.name);
    setDescDraft(feat.description ?? "");
    setDescDirty(false);
    setColorDraft(feat.color ?? FEATURE_PALETTE[0]);
    setFormError(null);
    setFormMode("edit");
  };

  const handleCancelForm = () => {
    setFormMode("closed");
    setEditingFeature(null);
    setDescDirty(false);
    setFormError(null);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = nameDraft.trim();
    if (!trimmedName) {
      setFormError("Feature name is required");
      return;
    }

    if (formMode === "create") {
      createFeature.mutate(
        {
          projectKey,
          name: trimmedName,
          description: descDraft,
          color: colorDraft,
        },
        {
          onSuccess: () => {
            setFormMode("closed");
            setDescDirty(false);
            setFormError(null);
          },
          onError: (err) => {
            setFormError(err instanceof Error ? err.message : String(err));
          },
        }
      );
    } else if (formMode === "edit" && editingFeature) {
      const patch: { name: string; color: string; description?: string } = {
        name: trimmedName,
        color: colorDraft,
      };
      if (descDirty) {
        patch.description = descDraft;
      }
      updateFeature.mutate(
        {
          id: editingFeature.id,
          projectKey,
          patch,
        },
        {
          onSuccess: () => {
            setFormMode("closed");
            setEditingFeature(null);
            setDescDirty(false);
            setFormError(null);
          },
          onError: (err) => {
            setFormError(err instanceof Error ? err.message : String(err));
          },
        }
      );
    }
  };

  const handleConfirmDelete = () => {
    if (!featureToDelete) return;
    deleteFeature.mutate(
      { id: featureToDelete.id, projectKey },
      {
        onSuccess: () => {
          setFeatureToDelete(null);
        },
      }
    );
  };

  const isSubmitting = createFeature.isPending || updateFeature.isPending;

  return (
    <>
      <div className="features-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        ref={drawerRef}
        className="features-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Features"
        tabIndex={-1}
      >
        <header className="features-header">
          <h2 className="features-title">Features</h2>
          <button
            type="button"
            className="features-close-btn"
            onClick={onClose}
            aria-label="Close features"
          >
            ✕
          </button>
        </header>

        <div className="features-content">
          {formMode === "closed" && (
            <div className="features-top-bar">
              <button
                type="button"
                className="button-primary create-feature-btn"
                onClick={handleStartCreate}
              >
                Create feature
              </button>
            </div>
          )}

          {formMode !== "closed" && (
            <form ref={formRef} className="feature-form-panel" onSubmit={handleSubmitForm}>
              <h3 className="feature-form-title">
                {formMode === "create" ? "Create feature" : "Edit feature"}
              </h3>

              {formError && (
                <div className="features-error" role="alert">
                  {formError}
                </div>
              )}

              <div className="feature-form-field">
                <label htmlFor="feature-name-input" className="feature-form-label">
                  Name
                </label>
                <input
                  id="feature-name-input"
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Feature name"
                  maxLength={100}
                  autoFocus
                  required
                />
              </div>

              <div className="feature-form-field">
                <span className="feature-form-label">Description</span>
                <MarkdownEditor
                  key={formMode === "edit" ? `edit-${editingFeature?.id}` : "create"}
                  initialMarkdown={descDraft}
                  onChange={(md) => {
                    setDescDraft(md);
                    setDescDirty(true);
                  }}
                  onSave={() => formRef.current?.requestSubmit()}
                  onCancel={handleCancelForm}
                  placeholder="Description (Markdown supported)"
                  ariaLabel="Feature description"
                />
              </div>

              <div className="feature-form-field">
                <span className="feature-form-label">Colour</span>
                <div className="feature-color-picker" role="radiogroup" aria-label="Colour picker">
                  {FEATURE_PALETTE.map((c) => {
                    const isSelected = colorDraft === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`color-swatch-btn ${isSelected ? "is-selected" : ""}`}
                        style={{ backgroundColor: c }}
                        title={c}
                        aria-label={`Colour ${c}`}
                        onClick={() => setColorDraft(c)}
                      >
                        {isSelected && <span className="color-swatch-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="feature-form-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleCancelForm}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={!nameDraft.trim() || isSubmitting}
                >
                  {formMode === "create" ? "Create" : "Save"}
                </button>
              </div>
            </form>
          )}

          {isLoading && <div className="features-loading">Loading features...</div>}
          {error && (
            <div className="features-error" role="alert">
              Failed to load features: {(error as Error).message}
            </div>
          )}

          {!isLoading && !error && features.length === 0 && formMode === "closed" && (
            <div className="features-empty">
              No features yet. Create one to organize tickets.
            </div>
          )}

          {!isLoading && !error && features.length > 0 && (
            <div className="features-list">
              {features.map((feat) => {
                const isExpanded = expandedIds.has(feat.id);
                const done = feat.progress.done;
                const total = feat.progress.total;
                const percent =
                  total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

                return (
                  <div key={feat.id} className="feature-item" data-feature-id={feat.id}>
                    <div className="feature-item-header">
                      <div className="feature-item-title-row">
                        <span
                          className="feature-color-swatch"
                          style={{ backgroundColor: feat.color }}
                          title={`Colour ${feat.color}`}
                        />
                        <button
                          type="button"
                          className="feature-name-btn"
                          onClick={() => toggleExpand(feat.id)}
                          aria-expanded={isExpanded}
                          title={isExpanded ? "Collapse description" : "Expand description"}
                        >
                          {feat.name}
                        </button>
                      </div>

                      <div className="feature-item-actions">
                        <button
                          type="button"
                          className="feature-action-btn feature-edit-btn"
                          onClick={() => handleStartEdit(feat)}
                          aria-label={`Edit feature ${feat.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="feature-action-btn feature-delete-btn"
                          onClick={() => setFeatureToDelete(feat)}
                          aria-label={`Delete feature ${feat.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="feature-description-expanded">
                        {feat.description ? (
                          <Markdown>{feat.description}</Markdown>
                        ) : (
                          <span className="feature-description-empty">
                            No description provided.
                          </span>
                        )}
                      </div>
                    )}

                    <div className="feature-progress-section">
                      <div className="feature-progress-track">
                        <div
                          className="feature-progress-fill"
                          style={{ width: `${percent}%` }}
                          aria-valuenow={percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                      <div className="feature-progress-meta">
                        <span className="feature-progress-done-total">
                          {done}/{total}
                        </span>
                        <span className="feature-ticket-count">
                          {total} {total === 1 ? "ticket" : "tickets"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Delete Confirmation Modal */}
      {featureToDelete && (
        <Modal
          isOpen={Boolean(featureToDelete)}
          onClose={() => setFeatureToDelete(null)}
          title={`Delete ${featureToDelete.name}?`}
        >
          <div className="delete-dialog-content">
            <p className="delete-dialog-message">
              Delete feature {featureToDelete.name}? Its tickets stay on the board.
            </p>
            <div className="delete-dialog-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setFeatureToDelete(null)}
                disabled={deleteFeature.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-danger"
                onClick={handleConfirmDelete}
                disabled={deleteFeature.isPending}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
