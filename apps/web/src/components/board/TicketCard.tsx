import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  attachClosestEdge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { Card, Actor } from "@awb/shared/types.ts";
import { PriorityIcon } from "../PriorityIcon.tsx";
import { ActorAvatar } from "../ActorAvatar.tsx";
import { FeatureLabel } from "../FeatureLabel.tsx";
import { setCardDragPreview } from "./setCardDragPreview.ts";

export type TicketCardProps = {
  card: Card;
  actors?: Actor[];
  onClick?: () => void;
  isOverlay?: boolean;
  style?: React.CSSProperties;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
  [key: string]: unknown;
};

export function TicketCard({
  card,
  actors,
  onClick,
  isOverlay,
  style,
  className = "",
  ref,
  ...rest
}: TicketCardProps) {
  const hasMarkers = card.blocked || Boolean(card.needsAttention);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={`ticket-card ${className}`.trim()}
      data-ticket-key={card.key}
      style={style}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      {...rest}
    >
      <div className="ticket-card-title">{card.title}</div>

      {hasMarkers && (
        <div className="ticket-card-markers">
          {card.blocked && (
            <span
              className="lozenge lozenge-blocked"
              title="Blocked by unfinished tickets"
            >
              Blocked
            </span>
          )}
          {card.needsAttention && (
            <span
              className="lozenge lozenge-attention"
              title={card.needsAttention}
            >
              Needs attention
            </span>
          )}
        </div>
      )}

      <div className="ticket-card-footer">
        <div className="ticket-card-footer-left">
          {card.feature ? (
            <span className="ticket-card-feature">
              <FeatureLabel feature={card.feature} />
            </span>
          ) : null}
          <PriorityIcon priority={card.priority} />
          <span className="ticket-card-key">{card.key}</span>
        </div>
        <div className="ticket-card-footer-right">
          {card.assignee ? (
            <ActorAvatar name={card.assignee} actors={actors} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const setEdgeAttribute = (element: HTMLElement, edge: string | null) => {
  if (element.getAttribute("data-drop-edge") === edge) return;
  if (edge === null) element.removeAttribute("data-drop-edge");
  else element.setAttribute("data-drop-edge", edge);
};

export type DraggableTicketCardProps = {
  card: Card;
  actors?: Actor[];
  onTicketClick?: (ticketKey: string) => void;
};

export const DraggableTicketCard = React.memo(
  function DraggableTicketCard({
    card,
    actors,
    onTicketClick,
  }: DraggableTicketCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const didDragRef = useRef(false);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
      const element = ref.current;
      if (!element) return undefined;

      const cleanup = combine(
        draggable({
          element,
          getInitialData: () => ({
            type: "card" as const,
            cardKey: card.key,
            columnId: card.column,
          }),
          onGenerateDragPreview: setCardDragPreview,
          onDragStart: () => {
            didDragRef.current = true;
            setIsDragging(true);
          },
          onDrop: () => {
            setIsDragging(false);
            window.setTimeout(() => {
              didDragRef.current = false;
            }, 0);
          },
        }),
        dropTargetForElements({
          element,
          canDrop: ({ source }) =>
            source.data.type === "card" && source.data.cardKey !== card.key,
          getIsSticky: () => true,
          getData: ({ input, element: dropElement }) =>
            attachClosestEdge(
              { type: "card", cardKey: card.key, columnId: card.column },
              { input, element: dropElement, allowedEdges: ["top", "bottom"] }
            ),
          onDrag: ({ self }) => {
            const edge = extractClosestEdge(self.data);
            setEdgeAttribute(
              element,
              edge === "top" || edge === "bottom" ? edge : null
            );
          },
          onDragLeave: () => setEdgeAttribute(element, null),
          onDrop: () => setEdgeAttribute(element, null),
        })
      );

      return () => {
        setEdgeAttribute(element, null);
        cleanup();
      };
    }, [card.key, card.column]);

    const handleClick = useCallback(() => {
      if (didDragRef.current) return;
      onTicketClick?.(card.key);
    }, [card.key, onTicketClick]);

    return (
      <TicketCard
        ref={ref}
        card={card}
        actors={actors}
        onClick={handleClick}
        style={{ opacity: isDragging ? 0.4 : undefined }}
      />
    );
  }
);
