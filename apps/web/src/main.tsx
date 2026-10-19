import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { App } from "./App.tsx";
import { ApiFailure } from "./api/client.ts";
import { qk } from "./api/queryKeys.ts";
import "./styles/theme.css";

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error instanceof ApiFailure && error.status === 401) {
        if (query.queryKey[0] !== "session") {
          void queryClient.invalidateQueries({ queryKey: qk.session });
        }
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (error instanceof ApiFailure && error.status === 401) {
        if (!mutation.meta?.skipAuthInvalidate) {
          void queryClient.invalidateQueries({ queryKey: qk.session });
        }
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}
