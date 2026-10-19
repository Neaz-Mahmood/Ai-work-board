import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardEvent, BoardEventType } from "@awb/shared/events.ts";
import { qk } from "./queryKeys.ts";

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

    let hasOpened = false;
    const es = new EventSource(`/api/events?project=${encodeURIComponent(projectKey)}`);

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

        if (type.startsWith("project.")) {
          queryClient.invalidateQueries({ queryKey: qk.projects });
        } else if (type.startsWith("ticket.")) {
          queryClient.invalidateQueries({ queryKey: qk.board(projectKey) });
          if (data.ticketKey) {
            queryClient.invalidateQueries({ queryKey: qk.ticket(data.ticketKey) });
          }
          queryClient.invalidateQueries({ queryKey: qk.projects });
        } else if (type.startsWith("feature.")) {
          queryClient.invalidateQueries({ queryKey: qk.features(projectKey) });
          queryClient.invalidateQueries({ queryKey: qk.board(projectKey) });
        }
      } catch (err) {
        console.error("Failed to handle SSE event:", err);
      }
    };

    es.onmessage = handleMessage;
    for (const type of BOARD_EVENT_TYPES) {
      es.addEventListener(type, handleMessage);
    }

    return () => {
      es.close();
    };
  }, [projectKey, queryClient]);
}
