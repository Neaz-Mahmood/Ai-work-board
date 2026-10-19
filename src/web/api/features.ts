import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Feature, Ticket } from "@awb/shared/types.ts";
import { api } from "./client.ts";
import { qk } from "./queryKeys.ts";

export const FEATURE_PALETTE = [
  "#0C66E4",
  "#1F845A",
  "#E2B203",
  "#C9372C",
  "#6E5DC6",
  "#227D9B",
  "#E56910",
  "#AE4787",
] as const;

export function useFeatures(projectKey: string) {
  return useQuery({
    queryKey: qk.features(projectKey),
    queryFn: () =>
      api<Feature[]>(
        "GET",
        `/api/projects/${encodeURIComponent(projectKey)}/features`
      ),
    enabled: Boolean(projectKey),
  });
}

export type CreateFeatureInput = {
  projectKey?: string;
  name: string;
  description?: string;
  color?: string;
  tickets?: Array<{
    title: string;
    description?: string;
    priority?: string;
    column?: string;
    blockedBy?: string[];
    blockedByIndexes?: number[];
    assignee?: string | null;
  }>;
};

export function useCreateFeature(propProjectKey?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFeatureInput) => {
      const key = input.projectKey ?? propProjectKey;
      if (!key) {
        throw new Error("projectKey is required to create a feature");
      }
      return api<{ feature: Feature; tickets: Ticket[] }>(
        "POST",
        `/api/projects/${encodeURIComponent(key)}/features`,
        {
          name: input.name,
          description: input.description,
          color: input.color,
          tickets: input.tickets,
        }
      );
    },
    onSuccess: (data, variables) => {
      const key = data?.feature?.projectKey || variables.projectKey || propProjectKey;
      if (key) {
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.features(key) }),
          queryClient.invalidateQueries({ queryKey: qk.board(key) }),
        ]);
      }
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["features"] }),
        queryClient.invalidateQueries({ queryKey: ["board"] }),
      ]);
    },
  });
}

export type UpdateFeatureInput = {
  id: number;
  projectKey?: string;
  patch?: {
    name?: string;
    description?: string;
    color?: string;
  };
  name?: string;
  description?: string;
  color?: string;
};

export function useUpdateFeature(propProjectKey?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch, name, description, color }: UpdateFeatureInput) => {
      const body = patch ?? { name, description, color };
      return api<Feature>(
        "PATCH",
        `/api/features/${encodeURIComponent(String(id))}`,
        body
      );
    },
    onSuccess: (feature, variables) => {
      const key = feature?.projectKey || variables.projectKey || propProjectKey;
      if (key) {
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.features(key) }),
          queryClient.invalidateQueries({ queryKey: qk.board(key) }),
        ]);
      }
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["features"] }),
        queryClient.invalidateQueries({ queryKey: ["board"] }),
      ]);
    },
  });
}

export type DeleteFeatureInput = {
  id: number;
  projectKey?: string;
};

export function useDeleteFeature(propProjectKey?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: number | DeleteFeatureInput) => {
      const id = typeof input === "number" ? input : input.id;
      return api<void>(
        "DELETE",
        `/api/features/${encodeURIComponent(String(id))}`
      );
    },
    onSuccess: (_data, input) => {
      const key =
        typeof input === "object" && input.projectKey
          ? input.projectKey
          : propProjectKey;
      if (key) {
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.features(key) }),
          queryClient.invalidateQueries({ queryKey: qk.board(key) }),
        ]);
      }
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["features"] }),
        queryClient.invalidateQueries({ queryKey: ["board"] }),
      ]);
    },
  });
}
