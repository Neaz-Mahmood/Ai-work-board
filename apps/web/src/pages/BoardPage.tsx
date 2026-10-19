import React, { useState, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Project } from "@awb/shared/types.ts";
import { useBoard, type BoardFilters as BoardFiltersType } from "../api/board.ts";
import { useLiveUpdates } from "../api/useLiveUpdates.ts";
import { Board } from "../components/board/Board.tsx";
import { BoardFilters } from "../components/board/BoardFilters.tsx";
import { TicketModal } from "../components/ticket/TicketModal.tsx";
import { FeaturesPanel } from "../components/features/FeaturesPanel.tsx";
import "./BoardPage.css";

export type BoardPageProps = {
  project?: Project;
};

export function BoardPage({ project: propProject }: BoardPageProps = {}) {
  const { key } = useParams<{ key: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIssue = searchParams.get("selectedIssue");
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);

  const projectKey = propProject?.key ?? key ?? "";
  useLiveUpdates(projectKey);

  const qParam = searchParams.get("q") || undefined;
  const featureParam = searchParams.get("feature") || undefined;
  const assigneeParam = searchParams.get("assignee") || undefined;

  const filters = useMemo<BoardFiltersType | undefined>(() => {
    if (!qParam && !featureParam && !assigneeParam) {
      return undefined;
    }
    return {
      q: qParam,
      feature: featureParam,
      assignee: assigneeParam,
    };
  }, [qParam, featureParam, assigneeParam]);

  const { data: board, isLoading, error } = useBoard(projectKey, filters);

  const projectName = board?.project.name ?? propProject?.name ?? projectKey;
  const displayKey = board?.project.key ?? projectKey;

  const handleTicketClick = (ticketKey: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("selectedIssue", ticketKey);
      return next;
    });
  };

  const handleCloseModal = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("selectedIssue");
      return next;
    });
  };

  const isFiltered = Boolean(qParam || featureParam || assigneeParam);

  return (
    <main className="board-page">
      <header className="board-header">
        <nav className="board-breadcrumb" aria-label="Breadcrumb">
          <Link to="/" className="board-breadcrumb-link">
            Projects
          </Link>
          <span className="board-breadcrumb-separator" aria-hidden="true">
            /
          </span>
          <span className="board-breadcrumb-name">{projectName}</span>
        </nav>

        <div className="board-header-main">
          <h1 className="board-title">{displayKey} board</h1>
          <div className="board-header-actions" aria-label="Filters">
            <BoardFilters
              actors={board?.actors ?? []}
              features={board?.features ?? []}
            />
            <button
              type="button"
              className="button-secondary features-button"
              onClick={() => setIsFeaturesOpen(true)}
            >
              Features
            </button>
          </div>
        </div>
      </header>

      <div className="board-content">
        {isLoading && (
          <div className="board-loading">Loading board...</div>
        )}
        {error && (
          <div className="board-error" role="alert">
            Failed to load board: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && board && (
          <Board
            board={board}
            onTicketClick={handleTicketClick}
            isFiltered={isFiltered}
            filters={filters}
          />
        )}
      </div>

      {selectedIssue && (
        <TicketModal
          ticketKey={selectedIssue}
          isOpen={Boolean(selectedIssue)}
          onClose={handleCloseModal}
          actors={board?.actors}
          projectKey={projectKey}
          onSelectTicket={handleTicketClick}
        />
      )}

      <FeaturesPanel
        isOpen={isFeaturesOpen}
        onClose={() => setIsFeaturesOpen(false)}
        projectKey={projectKey}
      />
    </main>
  );
}

