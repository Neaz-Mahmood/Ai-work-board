export type BoardEventType =
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "ticket.created"
  | "ticket.updated"
  | "ticket.moved"
  | "ticket.deleted"
  | "ticket.commented"
  | "feature.created"
  | "feature.updated"
  | "feature.deleted";

export type BoardEvent = {
  type: BoardEventType;
  projectKey: string;
  ticketKey?: string;
  featureId?: number;
  actor: string;
  at: string;
};
