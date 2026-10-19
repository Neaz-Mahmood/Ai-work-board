import React, { useRef, useEffect } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import type { Card, ColumnId, Actor } from "@awb/shared/types.ts";
import { DraggableTicketCard } from "./TicketCard.tsx";
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
  onTicketClick?: (ticketKey: string) => void;
};

export const Column = React.memo(function Column({
  column,
  actors,
  projectKey,
  onTicketClick,
}: ColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = bodyRef.current;
    const columnEl = columnRef.current;
    if (!element || !columnEl) return undefined;

    const cleanup = combine(
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.type === "card",
        getData: () => ({ type: "column" as const, columnId: column.id }),
        getIsSticky: () => true,
        onDragEnter: () => columnEl.classList.add("is-over"),
        onDragLeave: () => columnEl.classList.remove("is-over"),
        onDrop: () => columnEl.classList.remove("is-over"),
      }),
      autoScrollForElements({
        element,
        canScroll: ({ source }) => source.data.type === "card",
        getAllowedAxis: () => "vertical",
      })
    );

    return () => {
      columnEl.classList.remove("is-over");
      cleanup();
    };
  }, [column.id]);

  return (
    <div
      ref={columnRef}
      className="board-column"
      data-testid={`column-${column.id}`}
      data-column-id={column.id}
    >
      <div className="column-header">
        <span className="column-name">{column.name.toUpperCase()}</span>{" "}
        <span className="column-count">{column.tickets.length}</span>
      </div>
      <div ref={bodyRef} className="column-body">
        {column.tickets.map((card) => (
          <DraggableTicketCard
            key={card.key}
            card={card}
            actors={actors}
            onTicketClick={onTicketClick}
          />
        ))}
      </div>
      <div className="column-footer">
        <CreateTicketInline columnId={column.id} projectKey={projectKey} />
      </div>
    </div>
  );
});
