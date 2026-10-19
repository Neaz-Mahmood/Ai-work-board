import { describe, expect, test } from "vitest";
import type { Card, ColumnId } from "@awb/shared/types.ts";
import { getDropDestination } from "./boardDnd.ts";

function card(key: string, column: ColumnId, rank: number): Card {
  return {
    key,
    title: key,
    column,
    rank,
    priority: "medium",
    feature: null,
    assignee: null,
    blocked: false,
    needsAttention: null,
  };
}

describe("getDropDestination", () => {
  test("same Column moving down, top and bottom edges", () => {
    const c0 = card("T-0", "todo", 0);
    const c1 = card("T-1", "todo", 1);
    const c2 = card("T-2", "todo", 2);
    const columns = [{ id: "todo" as ColumnId, tickets: [c0, c1, c2] }];

    // Moving down onto card immediately below (c1), top edge:
    // Server move semantics: dropping before c1 leaves c0 in its existing position (rank 0), so it's a no-op.
    // Rule 1: P.key === A.key -> null
    expect(
      getDropDestination({
        activeCard: c0,
        columns,
        target: { kind: "card", cardKey: c1.key, edge: "top" },
      })
    ).toBeNull();

    // Moving down onto card immediately below (c1), bottom edge:
    // Server move semantics: c0 is removed from rank 0, c1 shifts to rank 0. Inserting at position 1 places c0 after c1.
    // dnd-kit equivalent: activeIndex 0 < overIndex 1 -> bottom edge -> computeUnfilteredPosition: targetColTickets[1].rank = 1
    expect(
      getDropDestination({
        activeCard: c0,
        columns,
        target: { kind: "card", cardKey: c1.key, edge: "bottom" },
      })
    ).toEqual({ column: "todo", position: 1 });

    // Moving down onto c2 (2 positions down), top edge:
    // Server move semantics: moving to top of c2 inserts after c1. c0 is removed from above so c1 is at rank 0; inserting at position 1 places c0 before c2.
    // dnd-kit equivalent: dropping above c2 with c0 removed places under c1 -> computeUnfilteredPosition = targetColTickets[1].rank = 1
    expect(
      getDropDestination({
        activeCard: c0,
        columns,
        target: { kind: "card", cardKey: c2.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 1 });

    // Moving down onto c2 (2 positions down), bottom edge:
    // Server move semantics: c0 is removed from rank 0, c1 and c2 shift up to ranks 0 and 1. Inserting at position 2 places c0 after c2.
    // dnd-kit equivalent: activeIndex 0 < overIndex 2 -> bottom edge -> computeUnfilteredPosition: targetColTickets[2].rank = 2
    expect(
      getDropDestination({
        activeCard: c0,
        columns,
        target: { kind: "card", cardKey: c2.key, edge: "bottom" },
      })
    ).toEqual({ column: "todo", position: 2 });
  });

  test("same Column moving up, top and bottom edges", () => {
    const c0 = card("T-0", "todo", 0);
    const c1 = card("T-1", "todo", 1);
    const c2 = card("T-2", "todo", 2);
    const columns = [{ id: "todo" as ColumnId, tickets: [c0, c1, c2] }];

    // Moving up onto top card (c0), top edge:
    // Server move semantics: inserting before first card places c2 at rank 0, shifting c0 and c1 down.
    // dnd-kit equivalent: activeIndex 2 > overIndex 0 -> top edge -> computeUnfilteredPosition: targetColTickets[0].rank = 0
    expect(
      getDropDestination({
        activeCard: c2,
        columns,
        target: { kind: "card", cardKey: c0.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 0 });

    // Moving up onto top card (c0), bottom edge:
    // Server move semantics: inserting after c0 (rank 0) without removal from above places c2 at position 0 + 1 = 1.
    // Rule 2: same Column and A.rank (2) < c0.rank (0) is false -> position = c0.rank + 1 = 1
    expect(
      getDropDestination({
        activeCard: c2,
        columns,
        target: { kind: "card", cardKey: c0.key, edge: "bottom" },
      })
    ).toEqual({ column: "todo", position: 1 });

    // Moving up onto middle card (c1), top edge:
    // Server move semantics: inserting before c1 means inserting after c0 (rank 0); since c2 is below, c0's rank is unchanged -> position 0 + 1 = 1.
    // dnd-kit equivalent: activeIndex 2 > overIndex 1 -> top edge -> computeUnfilteredPosition: targetColTickets[0].rank + 1 = 1
    expect(
      getDropDestination({
        activeCard: c2,
        columns,
        target: { kind: "card", cardKey: c1.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 1 });

    // Moving up onto card immediately above (c1), bottom edge:
    // Server move semantics: inserting after c1 (rank 1) gives rank 1 + 1 = 2, which equals c2.rank (no-op).
    // Rule 5: isSameCol && position === A.rank -> null
    expect(
      getDropDestination({
        activeCard: c2,
        columns,
        target: { kind: "card", cardKey: c1.key, edge: "bottom" },
      })
    ).toBeNull();
  });

  test("cross-Column on top of the first card, on the bottom of the last card, and in the middle", () => {
    const a = card("A", "backlog", 0);
    const t0 = card("T-0", "todo", 0);
    const t1 = card("T-1", "todo", 1);
    const t2 = card("T-2", "todo", 2);
    const columns = [
      { id: "backlog" as ColumnId, tickets: [a] },
      { id: "todo" as ColumnId, tickets: [t0, t1, t2] },
    ];

    // Cross-column on top of the first card (t0):
    // Server move semantics: insertTicketAtRank with position 0 inserts card at rank 0, shifting existing cards down.
    // dnd-kit equivalent: cross-column drop on overIndex 0 -> computeUnfilteredPosition: targetColTickets[0].rank = 0
    expect(
      getDropDestination({
        activeCard: a,
        columns,
        target: { kind: "card", cardKey: t0.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 0 });

    // Cross-column on the bottom of the last card (t2):
    // Server move semantics: inserting after t2 (rank 2) places card at rank 2 + 1 = 3 at the bottom of the target column.
    // Rule 2: !isSameCol -> position = t2.rank + 1 = 3
    expect(
      getDropDestination({
        activeCard: a,
        columns,
        target: { kind: "card", cardKey: t2.key, edge: "bottom" },
      })
    ).toEqual({ column: "todo", position: 3 });

    // Cross-column in the middle (top of t1):
    // Server move semantics: inserting before t1 means inserting after t0 (rank 0), giving position 0 + 1 = 1.
    // dnd-kit equivalent: cross-column drop on overIndex 1 -> computeUnfilteredPosition: targetColTickets[0].rank + 1 = 1
    expect(
      getDropDestination({
        activeCard: a,
        columns,
        target: { kind: "card", cardKey: t1.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 1 });

    // Cross-column in the middle (bottom of t1):
    // Server move semantics: inserting after t1 (rank 1) places card at position 1 + 1 = 2.
    // Rule 2: !isSameCol -> position = t1.rank + 1 = 2
    expect(
      getDropDestination({
        activeCard: a,
        columns,
        target: { kind: "card", cardKey: t1.key, edge: "bottom" },
      })
    ).toEqual({ column: "todo", position: 2 });
  });

  test("Column body, both empty and non-empty", () => {
    const a = card("A", "backlog", 0);
    const t0 = card("T-0", "todo", 0);
    const t1 = card("T-1", "todo", 1);
    const columns = [
      { id: "backlog" as ColumnId, tickets: [a] },
      { id: "todo" as ColumnId, tickets: [t0, t1] },
      { id: "in_progress" as ColumnId, tickets: [] },
    ];

    // Column body, empty:
    // Server move semantics: insertTicketAtRank with position undefined appends to bottom (targetPos = count = 0).
    // dnd-kit equivalent: targetColTickets.length === 0 -> computeUnfilteredPosition returned undefined
    expect(
      getDropDestination({
        activeCard: a,
        columns,
        target: { kind: "column", columnId: "in_progress" },
      })
    ).toEqual({ column: "in_progress", position: undefined });

    // Column body, non-empty (cross-column):
    // Server move semantics: active card placed after last visible card t1 (rank 1) at position 1 + 1 = 2.
    // dnd-kit equivalent: overIndex >= targetColTickets.length -> computeUnfilteredPosition returned lastCard.rank + 1 = 2
    expect(
      getDropDestination({
        activeCard: a,
        columns,
        target: { kind: "column", columnId: "todo" },
      })
    ).toEqual({ column: "todo", position: 2 });

    // Column body, non-empty (same Column when card is not last):
    // Server move semantics: t0 is removed from rank 0 (t1 shifts to 0), inserting at position 1 puts t0 at the bottom.
    // dnd-kit equivalent: overIndex >= targetColTickets.length, isSameCol && activeCard.rank < cardAbove.rank -> computeUnfilteredPosition returned cardAbove.rank = 1
    expect(
      getDropDestination({
        activeCard: t0,
        columns,
        target: { kind: "column", columnId: "todo" },
      })
    ).toEqual({ column: "todo", position: 1 });
  });

  test("same-Column body when the card is already last", () => {
    const t0 = card("T-0", "todo", 0);
    const t1 = card("T-1", "todo", 1);
    const columns = [{ id: "todo" as ColumnId, tickets: [t0, t1] }];

    // Server move semantics: t1 is already the last card in the column, so moving to the column body does not change rank (no-op).
    // dnd-kit equivalent: handleDragEnd checked activeIndex !== bottomIndex (1 !== 1), skipping moveTicket.mutate
    expect(
      getDropDestination({
        activeCard: t1,
        columns,
        target: { kind: "column", columnId: "todo" },
      })
    ).toBeNull();
  });

  test("dropping on itself", () => {
    const t0 = card("T-0", "todo", 0);
    const t1 = card("T-1", "todo", 1);
    const columns = [{ id: "todo" as ColumnId, tickets: [t0, t1] }];

    // Server move semantics: dropping a card onto itself does not change its order in the column (no-op).
    // dnd-kit equivalent: isSameCol && activeIndex === overIndex -> skipped move
    expect(
      getDropDestination({
        activeCard: t0,
        columns,
        target: { kind: "card", cardKey: t0.key, edge: "top" },
      })
    ).toBeNull();

    expect(
      getDropDestination({
        activeCard: t0,
        columns,
        target: { kind: "card", cardKey: t0.key, edge: "bottom" },
      })
    ).toBeNull();
  });

  test("filtered list with rank gaps within and across Columns", () => {
    const g0 = card("G-0", "todo", 0);
    const g1 = card("G-1", "todo", 3);
    const g2 = card("G-2", "todo", 7);
    const other = card("OTHER", "backlog", 5);
    const columns = [
      { id: "backlog" as ColumnId, tickets: [other] },
      { id: "todo" as ColumnId, tickets: [g0, g1, g2] },
    ];

    // Gap case 1: within same Column, active card at rank 3 moving to bottom edge of rank 7 -> 7
    // Server move semantics: removing g1 (rank 3) shifts g2 (rank 7) to rank 6; inserting at position 7 puts active card after g2.
    // dnd-kit equivalent: activeIndex 1 < overIndex 2 -> bottom edge -> computeUnfilteredPosition: targetColTickets[2].rank = 7
    expect(
      getDropDestination({
        activeCard: g1,
        columns,
        target: { kind: "card", cardKey: g2.key, edge: "bottom" },
      })
    ).toEqual({ column: "todo", position: 7 });

    // Gap case 2: from another Column onto top edge of rank-7 card -> 3 + 1 = 4
    // Server move semantics: inserting before g2 (rank 7) inserts after the preceding visible card g1 (rank 3), giving rank 3 + 1 = 4.
    // dnd-kit equivalent: cross-column drop on overIndex 2 -> computeUnfilteredPosition: targetColTickets[1].rank + 1 = 3 + 1 = 4
    expect(
      getDropDestination({
        activeCard: other,
        columns,
        target: { kind: "card", cardKey: g2.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 4 });

    // Gap case 3: within same Column, active card at rank 7 moving to top edge of rank 3 -> 0 + 1 = 1
    // Server move semantics: inserting before g1 (rank 3) inserts after g0 (rank 0); since g2 is removed from below, g0 is unchanged -> position 1.
    // dnd-kit equivalent: activeIndex 2 > overIndex 1 -> top edge -> computeUnfilteredPosition: targetColTickets[0].rank + 1 = 1
    expect(
      getDropDestination({
        activeCard: g2,
        columns,
        target: { kind: "card", cardKey: g1.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 1 });

    // Gap case 4: within same Column, active card at rank 7 moving to bottom edge of rank 3 -> 3 + 1 = 4
    // Server move semantics: inserting after g1 (rank 3) without removing from above places active card at position 3 + 1 = 4.
    // Rule 2: same Column and A.rank (7) < g1.rank (3) is false -> position = g1.rank + 1 = 4
    expect(
      getDropDestination({
        activeCard: g2,
        columns,
        target: { kind: "card", cardKey: g1.key, edge: "bottom" },
      })
    ).toEqual({ column: "todo", position: 4 });

    // Gap case 5: within same Column, active card at rank 3 moving to top edge of rank 7 -> null
    // Server move semantics: g1 is immediately above g2 in visible order; dropping on top of g2 is a no-op.
    // Rule 1: P.key === A.key -> null
    expect(
      getDropDestination({
        activeCard: g1,
        columns,
        target: { kind: "card", cardKey: g2.key, edge: "top" },
      })
    ).toBeNull();

    // Gap case 6: within same Column, active card at rank 3 moving to top edge of rank 0 -> 0
    // Server move semantics: inserting before first visible card places active card at rank 0.
    // dnd-kit equivalent: activeIndex 1 > overIndex 0 -> top edge -> computeUnfilteredPosition: targetColTickets[0].rank = 0
    expect(
      getDropDestination({
        activeCard: g1,
        columns,
        target: { kind: "card", cardKey: g0.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 0 });

    // Gap case 7: across Column, active card moving onto top edge of rank 0 -> 0
    // Server move semantics: inserting before first card in target column gives rank 0.
    // dnd-kit equivalent: cross-column drop on overIndex 0 -> computeUnfilteredPosition: targetColTickets[0].rank = 0
    expect(
      getDropDestination({
        activeCard: other,
        columns,
        target: { kind: "card", cardKey: g0.key, edge: "top" },
      })
    ).toEqual({ column: "todo", position: 0 });
  });

  test("returns null when target card or column is not found", () => {
    const t0 = card("T-0", "todo", 0);
    const columns = [{ id: "todo" as ColumnId, tickets: [t0] }];

    expect(
      getDropDestination({
        activeCard: t0,
        columns,
        target: { kind: "card", cardKey: "NONEXISTENT", edge: "top" },
      })
    ).toBeNull();

    expect(
      getDropDestination({
        activeCard: t0,
        columns,
        target: { kind: "column", columnId: "done" as ColumnId },
      })
    ).toBeNull();
  });
});
