import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Board } from "../../shared/types.ts";
import { api } from "./client.ts";
import { qk } from "./queryKeys.ts";

export type BoardFilters = {
  q?: string;
  feature?: string;
  assignee?: string;
};

export function useBoard(projectKey: string, filters?: BoardFilters) {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.feature) params.set("feature", filters.feature);
  if (filters?.assignee) params.set("assignee", filters.assignee);
  const qs = params.toString();
  const url = `/api/projects/${encodeURIComponent(projectKey)}/board${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: [...qk.board(projectKey), filters],
    queryFn: () => api<Board>("GET", url),
    enabled: Boolean(projectKey),
    placeholderData: keepPreviousData,
  });
}
