import React, { useState, useEffect, useRef, useCallback } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { preventUnhandled } from "@atlaskit/pragmatic-drag-and-drop/prevent-unhandled";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { Board as BoardType, Card, ColumnId } from "@awb/shared/types.ts";
import { useMoveTicket, subscribeToast } from "../../api/tickets.ts";
import type { BoardFilters } from "../../api/board.ts";
import { Column } from "./Column.tsx";
import { getDropDestination, type DropTarget } from "./boardDnd.ts";
import { markBoardDragStarted, markBoardDragEnded } from "./dragActivity.ts";
import "./board.css";

export type BoardProps = {
  board: BoardType;
  onTicketClick?: (ticketKey: string) => void;
  isFiltered?: boolean;
  filters?: BoardFilters;
};

export function Board({ board, onTicketClick, isFiltered, filters }: BoardProps) {
  const [toastError, setToastError] = useState<string | null>(null);

  const moveTicket = useMoveTicket(board.project.key, filters);

  const boardRef = useRef(board);
  boardRef.current = board;
  const moveTicketRef = useRef(moveTicket);
  moveTicketRef.current = moveTicket;
  const onTicketClickRef = useRef(onTicketClick);
  onTicketClickRef.current = onTicketClick;

  const handleTicketClick = useCallback((ticketKey: string) => {
    onTicketClickRef.current?.(ticketKey);
  }, []);

  useEffect(() => {
    return subscribeToast((msg) => {
      setToastError(msg);
    });
  }, []);

  useEffect(() => {
    if (toastError) {
      const timer = setTimeout(() => setToastError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastError]);

  useEffect(() => {
    let dragging = false;

    const cleanup = monitorForElements({
      canMonitor: ({ source }) => source.data.type === "card",
      onDragStart: () => {
        dragging = true;
        markBoardDragStarted();
        preventUnhandled.start();
      },
      onDrop: ({ source, location }) => {
        markBoardDragEnded();
        preventUnhandled.stop();
        dragging = false;

        const innermost = location.current.dropTargets[0];
        if (!innermost) return;

        const cardKey = source.data.cardKey;
        if (typeof cardKey !== "string") return;

        let activeCard: Card | undefined;
        for (const col of boardRef.current.columns) {
          activeCard = col.tickets.find((t) => t.key === cardKey);
          if (activeCard) break;
        }
        if (!activeCard) return;

        let target: DropTarget | null = null;
        if (
          innermost.data.type === "card" &&
          typeof innermost.data.cardKey === "string"
        ) {
          const rawEdge = extractClosestEdge(innermost.data);
          target = {
            kind: "card",
            cardKey: innermost.data.cardKey,
            edge: rawEdge === "top" || rawEdge === "bottom" ? rawEdge : "bottom",
          };
        } else if (
          innermost.data.type === "column" &&
          typeof innermost.data.columnId === "string"
        ) {
          target = {
            kind: "column",
            columnId: innermost.data.columnId as ColumnId,
          };
        }

        if (!target) return;

        const dest = getDropDestination({
          activeCard,
          columns: boardRef.current.columns,
          target,
        });

        if (dest) {
          moveTicketRef.current.mutate({
            ticketKey: activeCard.key,
            column: dest.column,
            position: dest.position,
          });
        }
      },
    });

    return () => {
      cleanup();
      if (dragging) {
        dragging = false;
        markBoardDragEnded();
        preventUnhandled.stop();
      }
    };
  }, []);

  const totalCards = board.columns.reduce(
    (sum, col) => sum + col.tickets.length,
    0
  );
  const showEmptyFilteredMessage = Boolean(isFiltered && totalCards === 0);

  return (
    <div className="board-area">
      {showEmptyFilteredMessage && (
        <div className="board-empty-filters-message" role="status">
          No tickets match these filters
        </div>
      )}
      <div className="board-columns">
        {board.columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            actors={board.actors}
            projectKey={board.project.key}
            onTicketClick={handleTicketClick}
          />
        ))}
      </div>
      {toastError && (
        <div className="board-toast-error" role="alert">
          <span>{toastError}</span>
          <button
            type="button"
            className="board-toast-close"
            onClick={() => setToastError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
