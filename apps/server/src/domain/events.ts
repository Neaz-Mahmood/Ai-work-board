import type { BoardEvent } from "@awb/shared/events.ts";

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
