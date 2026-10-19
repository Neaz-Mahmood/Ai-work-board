export type ColumnId = "backlog" | "todo" | "in_progress" | "in_review" | "done";

export { COLUMNS } from "./columns.ts";

export type Priority = "highest" | "high" | "medium" | "low" | "lowest";

export type FeatureRef = { id: number; name: string; color: string };

export type Feature = {
  id: number;
  projectKey: string;
  name: string;
  description: string;
  color: string;
  progress: { done: number; total: number };
  createdAt: string;
  updatedAt: string;
};

export type FeatureWithTickets = Feature & { tickets: Card[] };

export type Card = {
  key: string;
  title: string;
  column: ColumnId;
  rank: number;
  priority: Priority;
  feature: FeatureRef | null;
  assignee: string | null;
  blocked: boolean;
  needsAttention: string | null;
};

export type TicketLink = { key: string; title: string; column: ColumnId };

export type ActivityEntry = {
  id: number;
  actor: string;
  at: string;
  kind: string;
  payload: Record<string, unknown>;
};

export type Comment = { id: number; actor: string; body: string; createdAt: string };

export type Ticket = Card & {
  projectKey: string;
  number: number;
  description: string;
  createdAt: string;
  updatedAt: string;
  blockers: TicketLink[];
  blocks: TicketLink[];
  comments: Comment[];
  activity: ActivityEntry[];
};

export type Actor = { name: string; color: string };

export type Project = {
  key: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  counts?: Record<ColumnId, number>;
};

export type Board = {
  project: Project;
  columns: { id: ColumnId; name: string; tickets: Card[] }[];
  features: Feature[];
  actors: Actor[];
};

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export type BoardFilters = {
  q?: string;
  feature?: string;
  assignee?: string;
};
