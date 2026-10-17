import type { ColumnId } from "../shared/types.ts";
import { CliDomainError } from "./client.ts";

export function parseColumn(raw: string): ColumnId {
  const normalized = raw.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "backlog") return "backlog";
  if (normalized === "todo" || normalized === "to_do") return "todo";
  if (normalized === "in_progress" || normalized === "inprogress") return "in_progress";
  if (normalized === "in_review" || normalized === "inreview") return "in_review";
  if (normalized === "done") return "done";

  throw new CliDomainError(
    "VALIDATION",
    `Invalid column "${raw}". Must be one of: backlog, todo, in-progress, in-review, done`
  );
}
