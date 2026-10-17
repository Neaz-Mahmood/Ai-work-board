import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateProject } from "../api/projects.ts";
import { ApiFailure } from "../api/client.ts";
import { Modal } from "./Modal.tsx";
import "./AddProjectDialog.css";

export type AddProjectDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AddProjectDialog({ isOpen, onClose }: AddProjectDialogProps) {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setError(null);
    setPath("");
    setName("");
    setKey("");
    onClose();
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uppercased = e.target.value.toUpperCase();
    const filtered = uppercased.replace(/[^A-Z]/g, "").slice(0, 5);
    setKey(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setError("Path is required");
      return;
    }

    try {
      const payload: { path: string; name?: string; key?: string } = {
        path: trimmedPath,
      };
      if (name.trim()) {
        payload.name = name.trim();
      }
      if (key.trim()) {
        payload.key = key.trim();
      }

      const created = await createProject.mutateAsync(payload);
      handleClose();
      navigate(`/projects/${created.key}`);
    } catch (err: unknown) {
      if (err instanceof ApiFailure) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create project");
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Project">
      <form className="dialog-form" onSubmit={handleSubmit}>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="project-path">
            Path <span className="form-required">*</span>
          </label>
          <input
            id="project-path"
            type="text"
            required
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/Users/username/projects/my-repo"
            autoFocus
          />
          <p className="form-help">Absolute path to your local repository directory.</p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="project-name">
            Name (optional)
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Project"
          />
          <p className="form-help">Display name. Defaults to folder name if omitted.</p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="project-key">
            Key (optional)
          </label>
          <input
            id="project-key"
            type="text"
            value={key}
            onChange={handleKeyChange}
            placeholder="e.g. AWB"
            maxLength={5}
          />
          <p className="form-help">2–5 uppercase letters. Derived automatically if omitted.</p>
        </div>

        <div className="dialog-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={handleClose}
            disabled={createProject.isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={createProject.isPending}
          >
            {createProject.isPending ? "Adding..." : "Add project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
