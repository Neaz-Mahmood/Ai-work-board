import React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Card, ColumnId, Actor } from "../../../shared/types.ts";
import { SortableTicketCard } from "./TicketCard.tsx";
import { CreateTicketInline } from "./CreateTicketInline.tsx";

export type ColumnData = {
  id: ColumnId;
  name: string;
  tickets: Card[];
};

export type ColumnProps = {
  column: ColumnData;
  actors?: Actor[];
  projectKey?: string;
  isHighlighted?: boolean;
  onTicketClick?: (ticketKey: string) => void;
};

export function Column({
  column,
  actors,
  projectKey,
  isHighlighted,
  onTicketClick,
}: ColumnProps) {
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      columnId: column.id,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`board-column ${isHighlighted ? "is-over" : ""}`.trim()}
      data-testid={`column-${column.id}`}
      data-column-id={column.id}
    >
      <div className="column-header">
        <span className="column-name">{column.name.toUpperCase()}</span>{" "}
        <span className="column-count">{column.tickets.length}</span>
      </div>
      <SortableContext
        id={column.id}
        items={column.tickets.map((t) => t.key)}
        strategy={verticalListSortingStrategy}
      >
        <div className="column-body">
          {column.tickets.map((card) => (
            <SortableTicketCard
              key={card.key}
              card={card}
              actors={actors}
              onClick={onTicketClick ? () => onTicketClick(card.key) : undefined}
            />
          ))}
        </div>
      </SortableContext>
      <div className="column-footer">
        <CreateTicketInline columnId={column.id} projectKey={projectKey} />
      </div>
    </div>
  );
}
