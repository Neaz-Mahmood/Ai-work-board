import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Board, Card, ColumnId, Comment, Priority, Ticket } from "@awb/shared/types.ts";
import type { BoardFilters } from "./board.ts";
import { api } from "./client.ts";
import { qk } from "./queryKeys.ts";

export type MoveTicketInput = {
  ticketKey: string;
  column: ColumnId;
  position?: number;
};

export type CreateTicketInput = {
  title: string;
  column?: ColumnId;
  description?: string;
  priority?: Priority;
  assignee?: string | null;
  featureId?: number | null;
};

type ToastListener = (message: string) => void;
const toastListeners = new Set<ToastListener>();

export function showToast(message: string) {
  for (const listener of toastListeners) {
    listener(message);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("awb:toast", { detail: message }));
  }
}

export function subscribeToast(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

function applyMoveToBoard(
  board: Board,
  ticketKey: string,
  targetColId: ColumnId,
  targetPosition?: number
): Board {
  let sourceCard: Card | null = null;
  let sourceColId: ColumnId | null = null;

  for (const col of board.columns) {
    const found = col.tickets.find((t) => t.key === ticketKey);
    if (found) {
      sourceCard = found;
      sourceColId = col.id;
      break;
    }
  }

  if (!sourceCard || !sourceColId) {
    return board;
  }

  const oldRank = sourceCard.rank;
  const isSameCol = sourceColId === targetColId;

  const newColumns = board.columns.map((col) => {
    // Reorder within the same column
    if (isSameCol && col.id === sourceColId) {
      const withoutCard = col.tickets.filter((t) => t.key !== ticketKey);
      const afterRemoval = withoutCard.map((t) =>
        t.rank > oldRank ? { ...t, rank: t.rank - 1 } : t
      );

      let insertIndex: number;
      let insertionRank: number;

      if (targetPosition !== undefined && targetPosition !== null) {
        insertionRank = Math.max(0, targetPosition);
        const idx = afterRemoval.findIndex((t) => t.rank >= insertionRank);
        insertIndex = idx !== -1 ? idx : afterRemoval.length;
      } else {
        const lastCard = afterRemoval[afterRemoval.length - 1];
        insertionRank = lastCard ? lastCard.rank + 1 : 0;
        insertIndex = afterRemoval.length;
      }

      const cardToInsert: Card = {
        ...sourceCard!,
        column: targetColId,
        rank: insertionRank,
      };

      const updatedTickets = [
        ...afterRemoval.slice(0, insertIndex).map((t) =>
          t.rank >= insertionRank ? { ...t, rank: t.rank + 1 } : t
        ),
        cardToInsert,
        ...afterRemoval.slice(insertIndex).map((t) =>
          t.rank >= insertionRank ? { ...t, rank: t.rank + 1 } : t
        ),
      ];

      return {
        ...col,
        tickets: updatedTickets,
      };
    }

    // Remove from source column in cross-column move
    if (!isSameCol && col.id === sourceColId) {
      const withoutCard = col.tickets.filter((t) => t.key !== ticketKey);
      const updatedTickets = withoutCard.map((t) =>
        t.rank > oldRank ? { ...t, rank: t.rank - 1 } : t
      );
      return {
        ...col,
        tickets: updatedTickets,
      };
    }

    // Insert into target column in cross-column move
    if (!isSameCol && col.id === targetColId) {
      let insertIndex: number;
      let insertionRank: number;

      if (targetPosition !== undefined && targetPosition !== null) {
        insertionRank = Math.max(0, targetPosition);
        const idx = col.tickets.findIndex((t) => t.rank >= insertionRank);
        insertIndex = idx !== -1 ? idx : col.tickets.length;
      } else {
        const lastCard = col.tickets[col.tickets.length - 1];
        insertionRank = lastCard ? lastCard.rank + 1 : 0;
        insertIndex = col.tickets.length;
      }

      const cardToInsert: Card = {
        ...sourceCard!,
        column: targetColId,
        rank: insertionRank,
      };

      const updatedTickets = [
        ...col.tickets.slice(0, insertIndex).map((t) =>
          t.rank >= insertionRank ? { ...t, rank: t.rank + 1 } : t
        ),
        cardToInsert,
        ...col.tickets.slice(insertIndex).map((t) =>
          t.rank >= insertionRank ? { ...t, rank: t.rank + 1 } : t
        ),
      ];

      return {
        ...col,
        tickets: updatedTickets,
      };
    }

    return col;
  });

  return {
    ...board,
    columns: newColumns,
  };
}

export function useMoveTicket(projectKey: string, filters?: BoardFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketKey, column, position }: MoveTicketInput) =>
      api<Ticket>(
        "POST",
        `/api/tickets/${encodeURIComponent(ticketKey)}/move`,
        { column, position }
      ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: qk.board(projectKey) });

      const previousQueries = queryClient.getQueriesData<Board>({
        queryKey: qk.board(projectKey),
      });

      queryClient.setQueriesData<Board>(
        { queryKey: qk.board(projectKey) },
        (oldBoard) => {
          if (!oldBoard) return oldBoard;
          return applyMoveToBoard(
            oldBoard,
            variables.ticketKey,
            variables.column,
            variables.position
          );
        }
      );

      return { previousQueries };
    },
    onError: (err: unknown, _variables, context) => {
      if (context?.previousQueries) {
        for (const [key, oldBoard] of context.previousQueries) {
          queryClient.setQueryData(key, oldBoard);
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      showToast(message);
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.board(projectKey) });
      if (variables?.ticketKey) {
        queryClient.invalidateQueries({ queryKey: qk.ticket(variables.ticketKey) });
      }
      queryClient.invalidateQueries({ queryKey: qk.projects });
      queryClient.invalidateQueries({ queryKey: qk.features(projectKey) });
    },
  });
}

export function useCreateTicket(projectKey: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTicketInput) =>
      api<Ticket>(
        "POST",
        `/api/projects/${encodeURIComponent(projectKey)}/tickets`,
        input
      ),
    onSuccess: () => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.board(projectKey) }),
        queryClient.invalidateQueries({ queryKey: qk.projects }),
        queryClient.invalidateQueries({ queryKey: qk.features(projectKey) }),
      ]);
    },
  });
}

export function useTicket(ticketKey?: string | null) {
  return useQuery({
    queryKey: qk.ticket(ticketKey ?? ""),
    queryFn: () =>
      api<Ticket>("GET", `/api/tickets/${encodeURIComponent(ticketKey!)}`),
    enabled: Boolean(ticketKey),
  });
}

export type UpdateTicketInput = {
  ticketKey: string;
  patch: {
    title?: string;
    description?: string;
    priority?: Priority;
    assignee?: string | null;
    featureId?: number | null;
  };
  projectKey?: string;
};

export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketKey, patch }: UpdateTicketInput) =>
      api<Ticket>(
        "PATCH",
        `/api/tickets/${encodeURIComponent(ticketKey)}`,
        patch
      ),
    onSuccess: (ticket, variables) => {
      const key = ticket?.key || variables.ticketKey;
      const projKey = ticket?.projectKey || variables.projectKey || key.split("-")[0];
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.ticket(key) }),
        queryClient.invalidateQueries({ queryKey: qk.board(projKey) }),
        queryClient.invalidateQueries({ queryKey: qk.projects }),
        queryClient.invalidateQueries({ queryKey: qk.features(projKey) }),
      ]);
    },
  });
}

export type DeleteTicketInput = {
  ticketKey: string;
  projectKey?: string;
};

export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: string | DeleteTicketInput) => {
      const ticketKey = typeof input === "string" ? input : input.ticketKey;
      return api<void>(
        "DELETE",
        `/api/tickets/${encodeURIComponent(ticketKey)}`
      );
    },
    onSuccess: (_data, input) => {
      const ticketKey = typeof input === "string" ? input : input.ticketKey;
      const projectKey =
        typeof input === "object" && input.projectKey
          ? input.projectKey
          : ticketKey.split("-")[0];
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.ticket(ticketKey) }),
        queryClient.invalidateQueries({ queryKey: qk.board(projectKey) }),
        queryClient.invalidateQueries({ queryKey: qk.projects }),
        queryClient.invalidateQueries({ queryKey: qk.features(projectKey) }),
      ]);
    },
  });
}

export function useAddComment(ticketKey: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string | { body: string }) => {
      const payload = typeof body === "string" ? { body } : body;
      return api<Comment>(
        "POST",
        `/api/tickets/${encodeURIComponent(ticketKey)}/comments`,
        payload
      );
    },
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: qk.ticket(ticketKey) });
    },
  });
}

export function useAddBlocker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketKey, blockerKey }: { ticketKey: string; blockerKey: string }) =>
      api<Ticket>(
        "POST",
        `/api/tickets/${encodeURIComponent(ticketKey)}/blockers`,
        { blockerKey }
      ),
    onSuccess: (ticket, variables) => {
      const key = ticket?.key || variables.ticketKey;
      const projKey = ticket?.projectKey || key.split("-")[0];
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.ticket(key) }),
        queryClient.invalidateQueries({ queryKey: qk.ticket(variables.blockerKey) }),
        queryClient.invalidateQueries({ queryKey: qk.board(projKey) }),
        queryClient.invalidateQueries({ queryKey: qk.projects }),
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message);
    },
  });
}

export function useRemoveBlocker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketKey, blockerKey }: { ticketKey: string; blockerKey: string }) =>
      api<Ticket>(
        "DELETE",
        `/api/tickets/${encodeURIComponent(ticketKey)}/blockers/${encodeURIComponent(blockerKey)}`
      ),
    onSuccess: (ticket, variables) => {
      const key = ticket?.key || variables.ticketKey;
      const projKey = ticket?.projectKey || key.split("-")[0];
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.ticket(key) }),
        queryClient.invalidateQueries({ queryKey: qk.ticket(variables.blockerKey) }),
        queryClient.invalidateQueries({ queryKey: qk.board(projKey) }),
        queryClient.invalidateQueries({ queryKey: qk.projects }),
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message);
    },
  });
}

export function useSetNeedsAttention() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketKey, reason }: { ticketKey: string; reason: string }) =>
      api<Ticket>(
        "PUT",
        `/api/tickets/${encodeURIComponent(ticketKey)}/attention`,
        { reason }
      ),
    onSuccess: (ticket, variables) => {
      const key = ticket?.key || variables.ticketKey;
      const projKey = ticket?.projectKey || key.split("-")[0];
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.ticket(key) }),
        queryClient.invalidateQueries({ queryKey: qk.board(projKey) }),
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message);
    },
  });
}

export function useClearNeedsAttention() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketKey: string) =>
      api<Ticket>(
        "DELETE",
        `/api/tickets/${encodeURIComponent(ticketKey)}/attention`
      ),
    onSuccess: (ticket, variables) => {
      const key = ticket?.key || variables;
      const projKey = ticket?.projectKey || key.split("-")[0];
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.ticket(key) }),
        queryClient.invalidateQueries({ queryKey: qk.board(projKey) }),
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message);
    },
  });
}


