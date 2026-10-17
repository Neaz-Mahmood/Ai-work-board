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

export class EventBus {
  private subscribers: Set<(e: BoardEvent) => void>;

  constructor() {
    this.subscribers = new Set();
  }

  emit(e: BoardEvent): void {
    for (const fn of this.subscribers) {
      try {
        fn(e);
      } catch (err) {
        console.error("Error in EventBus subscriber:", err);
      }
    }
  }

  subscribe(fn: (e: BoardEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }
}
