import React from "react";
import "./EmptyState.css";

export type EmptyStateProps = {
  onAddProject: () => void;
};

export function EmptyState({ onAddProject }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-card">
        <div className="empty-state-icon" aria-hidden="true">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </div>
        <h2 className="empty-state-title">No projects yet</h2>
        <p className="empty-state-description">
          Projects are local repositories your agents work in
        </p>
        <button
          type="button"
          className="button button-primary empty-state-button"
          onClick={onAddProject}
        >
          Add project
        </button>
      </div>
    </div>
  );
}
