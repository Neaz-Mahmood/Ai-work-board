import React, { useState, useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  pointerWithin,
  closestCorners,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Board as BoardType, Card, ColumnId } from "../../../shared/types.ts";
import { useMoveTicket, subscribeToast } from "../../api/tickets.ts";
import type { BoardFilters } from "../../api/board.ts";
import { Column } from "./Column.tsx";
import { TicketCard } from "./TicketCard.tsx";
import "./board.css";

export type BoardProps = {
  board: BoardType;
  onTicketClick?: (ticketKey: string) => void;
  isFiltered?: boolean;
  filters?: BoardFilters;
};

function computeUnfilteredPosition(
  activeCard: Card,
  targetColTickets: Card[],
  overIndex: number,
  isSameCol: boolean,
  activeIndex: number
): number | undefined {
  if (targetColTickets.length === 0) {
    return undefined;
  }

  // Dropped on column body or at the bottom
  if (overIndex >= targetColTickets.length) {
    const cardAbove = targetColTickets[targetColTickets.length - 1];
    if (isSameCol && activeCard.rank < cardAbove.rank) {
      return cardAbove.rank;
    }
    return cardAbove.rank + 1;
  }

  if (isSameCol) {
    if (activeIndex === overIndex) {
      return undefined; // no move
    }
    if (activeIndex < overIndex) {
      // Dragging downwards over card at overIndex: dropped under targetColTickets[overIndex]
      const cardAbove = targetColTickets[overIndex];
      return cardAbove.rank;
    } else {
      // Dragging upwards over card at overIndex: dropped before targetColTickets[overIndex]
      if (overIndex === 0) {
        // Dropped at the top: before the visible card above it
        return targetColTickets[0].rank;
      } else {
        // Dropped under targetColTickets[overIndex - 1]
        const cardAbove = targetColTickets[overIndex - 1];
        return cardAbove.rank + 1;
      }
    }
  } else {
    // From another column
    if (overIndex === 0) {
      // Dropped at the top: before targetColTickets[0]
      return targetColTickets[0].rank;
    } else {
      // Dropped before targetColTickets[overIndex] -> directly after targetColTickets[overIndex - 1]
      const cardAbove = targetColTickets[overIndex - 1];
      return cardAbove.rank + 1;
    }
  }
}

export function Board({ board, onTicketClick, isFiltered, filters }: BoardProps) {
  const [activeTicket, setActiveTicket] = useState<Card | null>(null);
  const [overColumnId, setOverColumnId] = useState<ColumnId | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 5,
    },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(pointerSensor, keyboardSensor);

  const moveTicket = useMoveTicket(board.project.key, filters);

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

  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    return closestCorners(args);
  };

  function findTicket(ticketKey: string): Card | null {
    for (const col of board.columns) {
      const card = col.tickets.find((t) => t.key === ticketKey);
      if (card) return card;
    }
    return null;
  }

  function findColumnIdForId(id: string): ColumnId | null {
    if (board.columns.some((c) => c.id === id)) {
      return id as ColumnId;
    }
    const col = board.columns.find((c) =>
      c.tickets.some((t) => t.key === id)
    );
    return col ? col.id : null;
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const card = findTicket(String(active.id));
    if (card) {
      setActiveTicket(card);
      setOverColumnId(card.column);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) {
      setOverColumnId(null);
      return;
    }
    const colId = findColumnIdForId(String(over.id));
    setOverColumnId(colId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTicket(null);
    setOverColumnId(null);

    if (!over) {
      return;
    }

    const activeKey = String(active.id);
    const activeCard = findTicket(activeKey);
    if (!activeCard) {
      return;
    }

    const sourceColId = activeCard.column;
    const sourceCol = board.columns.find((c) => c.id === sourceColId);
    if (!sourceCol) {
      return;
    }

    const activeIndex = sourceCol.tickets.findIndex((t) => t.key === activeKey);
    const overId = String(over.id);

    // Case 1: Dropped onto a column directly (e.g. empty column or column body)
    const targetColAsCol = board.columns.find((c) => c.id === overId);
    if (targetColAsCol) {
      const targetColId = targetColAsCol.id;
      const isSameCol = sourceColId === targetColId;
      if (isSameCol) {
        const bottomIndex = targetColAsCol.tickets.length - 1;
        if (activeIndex !== bottomIndex) {
          const pos = computeUnfilteredPosition(
            activeCard,
            targetColAsCol.tickets,
            targetColAsCol.tickets.length,
            true,
            activeIndex
          );
          if (pos !== undefined) {
            moveTicket.mutate({
              ticketKey: activeKey,
              column: targetColId,
              position: pos,
            });
          }
        }
      } else {
        const pos = computeUnfilteredPosition(
          activeCard,
          targetColAsCol.tickets,
          targetColAsCol.tickets.length,
          false,
          activeIndex
        );
        moveTicket.mutate({
          ticketKey: activeKey,
          column: targetColId,
          position: pos,
        });
      }
      return;
    }

    // Case 2: Dropped onto another ticket card
    const targetColWithCard = board.columns.find((c) =>
      c.tickets.some((t) => t.key === overId)
    );
    if (targetColWithCard) {
      const targetColId = targetColWithCard.id;
      const isSameCol = sourceColId === targetColId;
      const overIndex = targetColWithCard.tickets.findIndex(
        (t) => t.key === overId
      );

      if (isSameCol && activeIndex === overIndex) {
        return;
      }

      const pos = computeUnfilteredPosition(
        activeCard,
        targetColWithCard.tickets,
        overIndex,
        isSameCol,
        activeIndex
      );

      if (pos !== undefined) {
        moveTicket.mutate({
          ticketKey: activeKey,
          column: targetColId,
          position: pos,
        });
      }
      return;
    }
  }

  function handleDragCancel() {
    setActiveTicket(null);
    setOverColumnId(null);
  }

  const totalCards = board.columns.reduce(
    (sum, col) => sum + col.tickets.length,
    0
  );
  const showEmptyFilteredMessage = Boolean(isFiltered && totalCards === 0);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
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
              isHighlighted={overColumnId === column.id}
              onTicketClick={onTicketClick}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeTicket ? (
          <TicketCard
            card={activeTicket}
            actors={board.actors}
            isOverlay
          />
        ) : null}
      </DragOverlay>
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
    </DndContext>
  );
}
