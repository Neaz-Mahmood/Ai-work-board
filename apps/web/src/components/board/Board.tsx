import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { preventUnhandled } from "@atlaskit/pragmatic-drag-and-drop/prevent-unhandled";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { useQueryClient } from "@tanstack/react-query";
import type { Board as BoardType, Card, ColumnId } from "@awb/shared/types.ts";
import { COLUMNS } from "@awb/shared/columns.ts";
import { useMoveTicket, subscribeToast } from "../../api/tickets.ts";
import { qk } from "../../api/queryKeys.ts";
import type { BoardFilters } from "../../api/board.ts";
import { Column } from "./Column.tsx";
import { getDropDestination, type DropTarget } from "./boardDnd.ts";
import { markBoardDragStarted, markBoardDragEnded } from "./dragActivity.ts";
import { announce, useAnnouncement } from "./announcer.ts";
import { BoardCardActionsProvider, type BoardCardActions } from "./cardActions.ts";
import "./board.css";

export type BoardProps = {
  board: BoardType;
  onTicketClick?: (ticketKey: string) => void;
  isFiltered?: boolean;
  filters?: BoardFilters;
};

export function Board({ board, onTicketClick, isFiltered, filters }: BoardProps) {
  const [toastError, setToastError] = useState<string | null>(null);
  const announcement = useAnnouncement();
  const queryClient = useQueryClient();

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

  const announceMove = useCallback((cardKey: string, targetColId: ColumnId) => {
    let col = boardRef.current.columns.find((c) => c.id === targetColId);
    let index = col ? col.tickets.findIndex((t) => t.key === cardKey) : -1;
    let total = col ? col.tickets.length : 0;

    if (index === -1) {
      const cachedBoard = queryClient.getQueryData<BoardType>(qk.board(boardRef.current.project.key));
      const cachedCol = cachedBoard?.columns.find((c) => c.id === targetColId);
      if (cachedCol) {
        const cachedIdx = cachedCol.tickets.findIndex((t) => t.key === cardKey);
        if (cachedIdx !== -1) {
          col = cachedCol;
          index = cachedIdx;
          total = cachedCol.tickets.length;
        }
      }
    }

    if (!col || index === -1) return;
    const position = index + 1;
    announce(`${cardKey} moved to ${col.name}, position ${position} of ${total}.`);
  }, [queryClient]);

  const performMove = useCallback(
    (activeCard: Card, target: DropTarget) => {
      const dest = getDropDestination({
        activeCard,
        columns: boardRef.current.columns,
        target,
      });

      if (!dest) return;

      moveTicketRef.current.mutate(
        {
          ticketKey: activeCard.key,
          column: dest.column,
          position: dest.position,
        },
        {
          onSuccess: () => {
            announceMove(activeCard.key, dest.column);
          },
        }
      );
    },
    [announceMove]
  );

  const moveCardByOffset = useCallback(
    (cardKey: string, offset: -1 | 1) => {
      let activeCard: Card | undefined;
      let activeCol: (typeof boardRef.current.columns)[number] | undefined;

      for (const col of boardRef.current.columns) {
        const card = col.tickets.find((t) => t.key === cardKey);
        if (card) {
          activeCard = card;
          activeCol = col;
          break;
        }
      }

      if (!activeCard || !activeCol) return;

      const currentIndex = activeCol.tickets.findIndex((t) => t.key === cardKey);
      if (currentIndex === -1) return;

      const targetIndex = currentIndex + offset;
      if (targetIndex < 0 || targetIndex >= activeCol.tickets.length) {
        return;
      }

      const neighbour = activeCol.tickets[targetIndex];
      if (!neighbour) return;

      const target: DropTarget = {
        kind: "card",
        cardKey: neighbour.key,
        edge: offset === -1 ? "top" : "bottom",
      };

      performMove(activeCard, target);
      requestAnimationFrame(() => {
        (document.querySelector(`[data-ticket-key="${cardKey}"]`) as HTMLElement | null)?.focus();
      });
    },
    [performMove]
  );

  const moveCardToColumn = useCallback(
    (cardKey: string, columnId: ColumnId) => {
      let activeCard: Card | undefined;
      for (const col of boardRef.current.columns) {
        const card = col.tickets.find((t) => t.key === cardKey);
        if (card) {
          activeCard = card;
          break;
        }
      }
      if (!activeCard) return;

      const target: DropTarget = {
        kind: "column",
        columnId,
      };

      performMove(activeCard, target);
    },
    [performMove]
  );

  const cardActionsValue = useMemo<BoardCardActions>(
    () => ({
      moveCardByOffset,
      moveCardToColumn,
      columns: COLUMNS,
    }),
    [moveCardByOffset, moveCardToColumn]
  );

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

        performMove(activeCard, target);
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
  }, [performMove]);

  const totalCards = board.columns.reduce(
    (sum, col) => sum + col.tickets.length,
    0
  );
  const showEmptyFilteredMessage = Boolean(isFiltered && totalCards === 0);

  return (
    <BoardCardActionsProvider value={cardActionsValue}>
      <div className="board-area">
        <div
          role="status"
          aria-live="polite"
          data-testid="board-announcer"
          className="board-announcer"
        >
          {announcement}
        </div>
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
    </BoardCardActionsProvider>
  );
}

