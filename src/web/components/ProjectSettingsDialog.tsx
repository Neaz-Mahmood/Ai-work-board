import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project } from "../../shared/types.ts";
import { useRenameProject, useDeleteProject } from "../api/projects.ts";
import { ApiFailure } from "../api/client.ts";
import { Modal } from "./Modal.tsx";
import "./ProjectSettingsDialog.css";

export type ProjectSettingsDialogProps = {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
};

export function ProjectSettingsDialog({
  project,
  isOpen,
  onClose,
}: ProjectSettingsDialogProps) {
  const navigate = useNavigate();
  const renameMutation = useRenameProject();
  const deleteMutation = useDeleteProject();

  const [name, setName] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSuccess, setRenameSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setConfirmKey("");
      setRenameError(null);
      setRenameSuccess(false);
      setDeleteError(null);
    }
  }, [project, isOpen]);

  if (!project) {
    return null;
  }

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    setRenameError(null);
    setRenameSuccess(false);

    const trimmed = name.trim();
    if (!trimmed) {
      setRenameError("Project name cannot be empty");
      return;
    }

    try {
      await renameMutation.mutateAsync({
        key: project.key,
        name: trimmed,
      });
      setRenameSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiFailure) {
        setRenameError(err.message);
      } else if (err instanceof Error) {
        setRenameError(err.message);
      } else {
        setRenameError("Failed to rename project");
      }
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    if (confirmKey !== project.key) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(project.key);

      try {
        if (localStorage.getItem("awb:lastProject") === project.key) {
          localStorage.removeItem("awb:lastProject");
        }
      } catch {
        // Ignore localStorage error
      }

      onClose();
      navigate("/");
    } catch (err: unknown) {
      if (err instanceof ApiFailure) {
        setDeleteError(err.message);
      } else if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete project");
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Project Settings: ${project.key}`}
    >
      <div className="settings-dialog-content">
        <div className="settings-meta-item">
          <span className="settings-meta-label">Path:</span>
          <span title={project.path}>{project.path}</span>
        </div>

        {/* Rename section */}
        <section className="settings-section">
          <h3 className="settings-section-title">General</h3>
          <form className="dialog-form" onSubmit={handleRename}>
            {renameError && (
              <div className="form-error" role="alert">
                {renameError}
              </div>
            )}
            {renameSuccess && (
              <div
                style={{
                  color: "var(--color-brand)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                Project name updated.
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="project-rename-input">
                Project Name
              </label>
              <input
                id="project-rename-input"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setRenameSuccess(false);
                }}
                required
              />
            </div>

            <div className="dialog-actions">
              <button
                type="submit"
                className="button button-primary"
                disabled={
                  renameMutation.isPending ||
                  !name.trim() ||
                  name.trim() === project.name
                }
              >
                {renameMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </section>

        {/* Danger zone */}
        <section className="settings-section danger-zone">
          <h3 className="settings-section-title">Danger Zone</h3>
          <p className="danger-description">
            Deleting a project removes it from the board along with all tickets,
            features, comments, and activity history. This action cannot be
            undone.
          </p>

          <form className="dialog-form" onSubmit={handleDelete}>
            {deleteError && (
              <div className="form-error" role="alert">
                {deleteError}
              </div>
            )}

            <div className="form-group">
              <label className="danger-confirm-prompt" htmlFor="delete-confirm-input">
                To confirm deletion, type{" "}
                <span className="danger-key-badge">{project.key}</span> below:
              </label>
              <input
                id="delete-confirm-input"
                type="text"
                value={confirmKey}
                onChange={(e) => setConfirmKey(e.target.value)}
                placeholder={project.key}
                autoComplete="off"
              />
            </div>

            <div className="dialog-actions">
              <button
                type="submit"
                className="button button-danger"
                disabled={
                  confirmKey !== project.key || deleteMutation.isPending
                }
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete project"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Modal>
  );
}
