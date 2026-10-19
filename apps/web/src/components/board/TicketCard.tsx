import React, { useRef, useState, useEffect, useCallback, useContext } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  attachClosestEdge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { Card, Actor, ColumnId } from "@awb/shared/types.ts";
import { PriorityIcon } from "../PriorityIcon.tsx";
import { ActorAvatar } from "../ActorAvatar.tsx";
import { FeatureLabel } from "../FeatureLabel.tsx";
import { setCardDragPreview } from "./setCardDragPreview.ts";
import { BoardCardActionsContext, useBoardCardActions } from "./cardActions.ts";

type CardActionsProps = {
  cardKey: string;
  cardColumn: ColumnId;
};

function CardActions({ cardKey, cardColumn }: CardActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { moveCardToColumn, columns } = useBoardCardActions();

  const otherColumns = columns.filter((col) => col.id !== cardColumn);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const handleButtonKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      if (!isOpen) {
        e.preventDefault();
        setIsOpen(true);
      }
    }
  };

  const handleSelectColumn = (
    columnId: ColumnId,
    e: React.MouseEvent | React.KeyboardEvent
  ) => {
    e.stopPropagation();
    moveCardToColumn(cardKey, columnId);
    setIsOpen(false);
    buttonRef.current?.focus();
    requestAnimationFrame(() => {
      const btn = document.querySelector(
        `[data-ticket-key="${cardKey}"] [data-testid="card-actions"]`
      ) as HTMLElement | null;
      btn?.focus();
    });
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
      if (!items.length) return;
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex: number;
      if (e.key === "ArrowDown") {
        nextIndex =
          activeIndex >= 0 && activeIndex < items.length - 1 ? activeIndex + 1 : 0;
      } else {
        nextIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
      }
      items[nextIndex]?.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`card-actions-root ${isOpen ? "is-open" : ""}`.trim()}
      data-card-actions-root
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className="card-actions-button"
        data-testid="card-actions"
        aria-label={`Card actions for ${cardKey}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleButtonClick}
        onKeyDown={handleButtonKeyDown}
      >
        ⋯
      </button>

      {isOpen && (
        <div
          role="menu"
          className="card-actions-menu"
          aria-label={`Actions for ${cardKey}`}
          onKeyDown={handleMenuKeyDown}
        >
          {otherColumns.map((col) => (
            <button
              key={col.id}
              role="menuitem"
              type="button"
              className="card-actions-menu-item"
              onClick={(e) => handleSelectColumn(col.id, e)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectColumn(col.id, e);
                }
              }}
            >
              Move to {col.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const actions = useContext(BoardCardActionsContext);
  const hasMarkers = card.blocked || Boolean(card.needsAttention);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      actions?.moveCardByOffset(card.key, e.key === "ArrowUp" ? -1 : 1);
      requestAnimationFrame(() => {
        (
          document.querySelector(
            `[data-ticket-key="${card.key}"]`
          ) as HTMLElement | null
        )?.focus();
      });
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={`ticket-card ${className}`.trim()}
      data-ticket-key={card.key}
      style={style}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {!isOverlay && actions && (
        <CardActions cardKey={card.key} cardColumn={card.column} />
      )}

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
          canDrag: ({ input }) => {
            const el = document.elementFromPoint(
              input.clientX,
              input.clientY
            ) as HTMLElement | null;
            return !el?.closest("[data-card-actions-root]");
          },
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

