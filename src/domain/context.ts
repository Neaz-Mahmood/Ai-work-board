import type { Db } from "../server/db.ts";
import type { Clock } from "../server/clock.ts";
import type { EventBus } from "./events.ts";

export type Ctx = {
  db: Db;
  clock: Clock;
  events: EventBus;
};
