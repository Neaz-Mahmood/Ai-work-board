import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client.ts";
import { qk } from "./queryKeys.ts";

export type Session = {
  authEnabled: boolean;
  signedIn: boolean;
};

export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: () => api<Session>("GET", "/api/auth/session"),
    retry: false,
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { password: string }) =>
      api<{ signedIn: boolean }>("POST", "/api/auth/login", body),
    meta: { skipAuthInvalidate: true },
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: qk.session });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      return api<{ signedIn: boolean }>("POST", "/api/auth/logout");
    },
    onSuccess: async () => {
      // Drop every cached board query but keep the session query, so the
      // login screen renders immediately instead of an empty loading state.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
      queryClient.setQueryData<Session>(qk.session, { authEnabled: true, signedIn: false });
      await queryClient.invalidateQueries({ queryKey: qk.session });
    },
  });
}
