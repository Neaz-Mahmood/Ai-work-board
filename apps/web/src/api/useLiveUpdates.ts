import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardEvent, BoardEventType } from "@awb/shared/events.ts";
import { apiUrl } from "./client.ts";
import { qk } from "./queryKeys.ts";
import {
  isBoardDragActive,
  onBoardDragEnd,
} from "../components/board/dragActivity.ts";

const BOARD_EVENT_TYPES: BoardEventType[] = [
  "project.created",
  "project.updated",
  "project.deleted",
  "ticket.created",
  "ticket.updated",
  "ticket.moved",
  "ticket.deleted",
  "ticket.commented",
  "feature.created",
  "feature.updated",
  "feature.deleted",
];

export function useLiveUpdates(projectKey: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectKey) {
      return;
    }

    const pendingQueryKeys = new Set<string>();

    const invalidateFor = (type: string, ticketKey?: string) => {
      const keys: (readonly unknown[])[] = [];

      if (type.startsWith("project.")) {
        keys.push(qk.projects);
      } else if (type.startsWith("ticket.")) {
        keys.push(qk.board(projectKey));
        if (ticketKey) {
          keys.push(qk.ticket(ticketKey));
        }
        keys.push(qk.projects);
      } else if (type.startsWith("feature.")) {
        keys.push(qk.features(projectKey));
        keys.push(qk.board(projectKey));
      }

      if (isBoardDragActive()) {
        for (const key of keys) {
          pendingQueryKeys.add(JSON.stringify(key));
        }
      } else {
        for (const key of keys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
    };

    let hasOpened = false;
    const es = new EventSource(
      apiUrl(`/api/events?project=${encodeURIComponent(projectKey)}`),
      { withCredentials: true }
    );

    es.onopen = () => {
      if (hasOpened) {
        // Any open after the first is a reconnect: invalidate everything for this project
        queryClient.invalidateQueries({ queryKey: qk.board(projectKey) });
        queryClient.invalidateQueries({ queryKey: qk.features(projectKey) });
        queryClient.invalidateQueries({ queryKey: qk.project(projectKey) });
        queryClient.invalidateQueries({ queryKey: qk.projects });
        queryClient.invalidateQueries({ queryKey: ["ticket"] });
      } else {
        hasOpened = true;
      }
    };

    const handleMessage = (event: MessageEvent) => {
      try {
        const data: BoardEvent = JSON.parse(event.data);
        const type = data.type || (event.type as BoardEventType);
        invalidateFor(type, data.ticketKey);
      } catch (err) {
        console.error("Failed to handle SSE event:", err);
      }
    };

    es.onmessage = handleMessage;
    for (const type of BOARD_EVENT_TYPES) {
      es.addEventListener(type, handleMessage);
    }

    const unsubscribeDrag = onBoardDragEnd(() => {
      for (const serializedKey of pendingQueryKeys) {
        queryClient.invalidateQueries({ queryKey: JSON.parse(serializedKey) });
      }
      pendingQueryKeys.clear();
    });

    return () => {
      unsubscribeDrag();
      es.close();
    };
  }, [projectKey, queryClient]);
}
