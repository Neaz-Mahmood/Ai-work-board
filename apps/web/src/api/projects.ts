import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@awb/shared/types.ts";
import { api } from "./client.ts";
import { qk } from "./queryKeys.ts";

export function useProjects() {
  return useQuery({
    queryKey: qk.projects,
    queryFn: () => api<Project[]>("GET", "/api/projects"),
  });
}

export function useProject(key: string) {
  return useQuery({
    queryKey: qk.project(key),
    queryFn: () => api<Project>("GET", `/api/projects/${encodeURIComponent(key)}`),
    enabled: Boolean(key),
  });
}

export type CreateProjectInput = {
  path: string;
  name?: string;
  key?: string;
};

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api<Project>("POST", "/api/projects", input),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

export type RenameProjectInput = {
  key: string;
  name: string;
};

export function useRenameProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, name }: RenameProjectInput) =>
      api<Project>("PATCH", `/api/projects/${encodeURIComponent(key)}`, { name }),
    onSuccess: (_data, variables) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.projects }),
        queryClient.invalidateQueries({ queryKey: qk.project(variables.key) }),
      ]);
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api<void>("DELETE", `/api/projects/${encodeURIComponent(key)}`),
    onSuccess: (_data, key) => {
      queryClient.removeQueries({ queryKey: qk.project(key) });
      return queryClient.invalidateQueries({ queryKey: qk.projects });
    },
  });
}
