import React, { useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
  Link,
} from "react-router-dom";
import type { Project } from "@awb/shared/types.ts";
import { useProjects } from "./api/projects.ts";
import { useSession } from "./api/auth.ts";
import { LoginPage } from "./pages/LoginPage.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { AddProjectDialog } from "./components/AddProjectDialog.tsx";
import { ProjectSettingsDialog } from "./components/ProjectSettingsDialog.tsx";
import { EmptyState } from "./components/EmptyState.tsx";
import { BoardPage } from "./pages/BoardPage.tsx";
import "./App.css";

const STORAGE_LAST_PROJECT_KEY = "awb:lastProject";

function getLastProjectKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

function setLastProjectKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_LAST_PROJECT_KEY, key);
  } catch {
    // Ignore localStorage errors
  }
}

function HomeRoute({
  projects,
  isLoading,
  onAddProject,
}: {
  projects: Project[] | undefined;
  isLoading: boolean;
  onAddProject: () => void;
}) {
  if (isLoading) {
    return <div className="app-loading">Loading projects...</div>;
  }

  if (!projects || projects.length === 0) {
    return <EmptyState onAddProject={onAddProject} />;
  }

  const lastKey = getLastProjectKey();
  const targetKey =
    lastKey && projects.some((p) => p.key === lastKey)
      ? lastKey
      : projects[0].key;

  return <Navigate to={`/projects/${targetKey}`} replace />;
}

function ProjectRoute({
  projects,
  isLoading,
}: {
  projects: Project[] | undefined;
  isLoading: boolean;
}) {
  const { key } = useParams<{ key: string }>();

  const project = projects?.find((p) => p.key === key);

  useEffect(() => {
    if (project) {
      setLastProjectKey(project.key);
    }
  }, [project]);

  if (isLoading) {
    return <div className="app-loading">Loading project...</div>;
  }

  if (!project) {
    return (
      <div className="not-found-page">
        <h2 className="not-found-title">Project not found</h2>
        <p className="not-found-message">
          The project with key "{key}" does not exist.
        </p>
        <Link to="/" className="not-found-link">
          Go home
        </Link>
      </div>
    );
  }

  return <BoardPage project={project} />;
}

function BoardApp() {
  const { data: projects = [], isLoading } = useProjects();
  const location = useLocation();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [settingsProjectKey, setSettingsProjectKey] = useState<string | null>(null);

  // Extract active project key from /projects/:key
  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  const activeProjectKey = match ? decodeURIComponent(match[1]) : undefined;

  const settingsProject = settingsProjectKey
    ? projects.find((p) => p.key === settingsProjectKey) ?? null
    : null;

  return (
    <div className="app-container">
      <Sidebar
        projects={projects}
        activeProjectKey={activeProjectKey}
        onAddProject={() => setIsAddOpen(true)}
        onOpenSettings={(proj) => setSettingsProjectKey(proj.key)}
      />

      <div className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <HomeRoute
                projects={projects}
                isLoading={isLoading}
                onAddProject={() => setIsAddOpen(true)}
              />
            }
          />
          <Route
            path="/projects/:key"
            element={
              <ProjectRoute projects={projects} isLoading={isLoading} />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <AddProjectDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
      />

      <ProjectSettingsDialog
        project={settingsProject}
        isOpen={Boolean(settingsProject)}
        onClose={() => setSettingsProjectKey(null)}
      />
    </div>
  );
}

export function App() {
  const { data: session, isLoading } = useSession();

  if (isLoading) {
    return null;
  }

  if (session?.authEnabled && !session.signedIn) {
    return <LoginPage />;
  }

  return <BoardApp />;
}
