import { createContext, useContext } from "react";
import type { ColumnId } from "@awb/shared/types.ts";

export type BoardCardActions = {
  moveCardByOffset(cardKey: string, offset: -1 | 1): void;
  moveCardToColumn(cardKey: string, columnId: ColumnId): void;
  columns: { id: ColumnId; name: string }[];
};

export const BoardCardActionsContext = createContext<BoardCardActions | null>(null);
export const BoardCardActionsProvider = BoardCardActionsContext.Provider;

export const useBoardCardActions = (): BoardCardActions => {
  const a = useContext(BoardCardActionsContext);
  if (!a) {
    throw new Error("useBoardCardActions must be used inside BoardCardActionsProvider");
  }
  return a;
};

export const useCardActions = useBoardCardActions;
