import React from "react";
import { Link } from "react-router-dom";
import type { Project } from "@awb/shared/types.ts";
import "./Sidebar.css";

const PROJECT_PALETTE = [
  "#0052CC", // Blue
  "#00875A", // Green
  "#DE350B", // Red
  "#FF991F", // Orange / Amber
  "#5243AA", // Purple
  "#00A3BF", // Teal
  "#403294", // Indigo
  "#00B8D9", // Cyan
  "#42526E", // Charcoal
  "#E56910", // Rust
];

export function getProjectColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PROJECT_PALETTE[hash % PROJECT_PALETTE.length];
}

function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export type SidebarProps = {
  projects: Project[];
  activeProjectKey?: string;
  onAddProject: () => void;
  onOpenSettings: (project: Project) => void;
};

export function Sidebar({
  projects,
  activeProjectKey,
  onAddProject,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-app-name">AI Work Board</h1>
      </div>

      <div className="sidebar-section-title">Projects</div>

      <nav className="sidebar-projects-list" aria-label="Projects">
        {projects.map((project) => {
          const isActive = project.key === activeProjectKey;
          const color = getProjectColor(project.key);

          return (
            <div
              key={project.key}
              className={`sidebar-project-item ${isActive ? "active" : ""}`}
            >
              <Link
                to={`/projects/${project.key}`}
                className="sidebar-project-link"
              >
                <div
                  className="sidebar-project-avatar"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                >
                  {project.key.charAt(0).toUpperCase()}
                </div>
                <div className="sidebar-project-info">
                  <span className="sidebar-project-name" title={project.name}>
                    {project.name}
                  </span>
                  <span className="sidebar-project-key">{project.key}</span>
                </div>
              </Link>
              {isActive && (
                <button
                  type="button"
                  className="sidebar-settings-button"
                  title="Project settings"
                  aria-label="Project settings"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenSettings(project);
                  }}
                >
                  <GearIcon />
                </button>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-add-button"
          onClick={onAddProject}
        >
          + Add project
        </button>
      </div>
    </aside>
  );
}
