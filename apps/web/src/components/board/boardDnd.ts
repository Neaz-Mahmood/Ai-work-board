import type { Card, ColumnId } from "@awb/shared/types.ts";

export type DropTarget =
  | { kind: "card"; cardKey: string; edge: "top" | "bottom" }
  | { kind: "column"; columnId: ColumnId };

export function getDropDestination(args: {
  activeCard: Card;
  columns: { id: ColumnId; tickets: Card[] }[];
  target: DropTarget;
}): { column: ColumnId; position: number | undefined } | null {
  const { activeCard, columns, target } = args;

  let targetColumnId: ColumnId;
  let vis: Card[];

  if (target.kind === "column") {
    targetColumnId = target.columnId;
    const col = columns.find((c) => c.id === targetColumnId);
    if (!col) return null;
    vis = col.tickets;
  } else {
    const col = columns.find((c) =>
      c.tickets.some((t) => t.key === target.cardKey)
    );
    if (!col) return null;
    targetColumnId = col.id;
    vis = col.tickets;
  }

  const isSameCol = targetColumnId === activeCard.column;

  // Rule 2: "After C": position = C.rank if same Column and A.rank < C.rank; otherwise C.rank + 1
  function afterCard(c: Card): number {
    if (isSameCol && activeCard.rank < c.rank) {
      return c.rank;
    }
    return c.rank + 1;
  }

  let position: number | undefined;

  if (target.kind === "card") {
    const xIndex = vis.findIndex((t) => t.key === target.cardKey);
    if (xIndex === -1) return null;
    const X = vis[xIndex];

    // Rule 1: X.key === A.key -> null
    if (X.key === activeCard.key) {
      return null;
    }

    if (target.edge === "bottom") {
      // Rule 1: Bottom edge -> "after X"
      position = afterCard(X);
    } else {
      // Rule 1: Top edge
      if (xIndex === 0) {
        // Rule 3: "Before first" (F = vis[0]): position = F.rank
        position = X.rank;
      } else {
        const P = vis[xIndex - 1];
        // Rule 1: If P.key === A.key (dropping on the top edge of the card right below you), -> null
        if (P.key === activeCard.key) {
          return null;
        }
        position = afterCard(P);
      }
    }
  } else {
    // Rule 4: Column-body target
    if (vis.length === 0) {
      // vis empty -> { column, position: undefined } (bottom)
      return { column: targetColumnId, position: undefined };
    }
    // Same Column and A is the last card of vis -> null
    if (isSameCol && vis[vis.length - 1].key === activeCard.key) {
      return null;
    }
    // Otherwise -> "after last card of vis" (rule 2)
    position = afterCard(vis[vis.length - 1]);
  }

  // Rule 5: Final no-op check: same Column and computed position === A.rank -> null
  if (isSameCol && position === activeCard.rank) {
    return null;
  }

  return { column: targetColumnId, position };
}
