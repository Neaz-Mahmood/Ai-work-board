import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, Actor } from "../../../shared/types.ts";
import { PriorityIcon } from "../PriorityIcon.tsx";
import { ActorAvatar } from "../ActorAvatar.tsx";
import { FeatureLabel } from "../FeatureLabel.tsx";

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
      className={`ticket-card ${isOverlay ? "is-overlay" : ""} ${className}`.trim()}
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

export type SortableTicketCardProps = TicketCardProps;

export function SortableTicketCard({
  card,
  actors,
  onClick,
}: SortableTicketCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.key,
    data: {
      type: "card",
      card,
      columnId: card.column,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className="ticket-card ticket-card-placeholder"
        data-ticket-key={card.key}
        aria-hidden="true"
      />
    );
  }

  return (
    <TicketCard
      ref={setNodeRef}
      style={style}
      card={card}
      actors={actors}
      onClick={onClick}
      {...attributes}
      {...listeners}
    />
  );
}
