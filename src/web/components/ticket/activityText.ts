import React from "react";
import type { ActivityEntry, Actor } from "../../../shared/types.ts";
import { COLUMNS } from "../../../shared/columns.ts";
import { ActorAvatar } from "../ActorAvatar.tsx";

const COLUMN_NAMES: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

for (const col of COLUMNS) {
  COLUMN_NAMES[col.id] = col.name;
}

export function formatRelativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour === 1) return "1 hour ago";
  if (diffHour < 24) return `${diffHour} hours ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "1 day ago";
  if (diffDay < 30) return `${diffDay} days ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth === 1) return "1 month ago";
  if (diffMonth < 12) return `${diffMonth} months ago`;
  const diffYear = Math.floor(diffDay / 365);
  if (diffYear === 1) return "1 year ago";
  return `${diffYear} years ago`;
}

export function formatActivityText(entry: ActivityEntry): string {
  const { kind, payload } = entry;
  switch (kind) {
    case "created": {
      const colId = (payload?.column as string) ?? "backlog";
      const colName = COLUMN_NAMES[colId] ?? colId;
      return `created the ticket in ${colName}`;
    }
    case "updated": {
      const field = payload?.field as string | undefined;
      if (field === "description") {
        return "updated the Description";
      }
      if (field === "feature") {
        if (payload?.to) {
          return `set the Feature to ${payload.to}`;
        }
        if (payload?.from) {
          return `removed the Feature ${payload.from}`;
        }
        return "updated the Feature";
      }
      if (field) {
        const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
        return `changed the ${fieldName} from "${payload?.from ?? ""}" to "${payload?.to ?? ""}"`;
      }
      return "updated the ticket";
    }
    case "moved": {
      const fromId = payload?.from as string;
      const toId = payload?.to as string;
      const fromName = COLUMN_NAMES[fromId] ?? fromId;
      const toName = COLUMN_NAMES[toId] ?? toId;
      return `moved this from ${fromName} to ${toName}`;
    }
    case "reranked": {
      return "changed the rank";
    }
    case "assigned": {
      if (payload?.to) {
        return `assigned this to ${payload.to}`;
      }
      if (payload?.from) {
        return `unassigned ${payload.from}`;
      }
      return "unassigned this";
    }
    case "commented": {
      return "added a comment";
    }
    case "blocker_added": {
      return `added blocker ${payload?.blockerKey ?? ""}`;
    }
    case "blocker_removed": {
      return `removed blocker ${payload?.blockerKey ?? ""}`;
    }
    case "attention_flagged": {
      return `flagged this as needing attention: ${payload?.reason ?? ""}`;
    }
    case "attention_cleared": {
      return "cleared the needs-attention flag";
    }
    case "claimed": {
      return "claimed this and started work";
    }
    default:
      return kind;
  }
}

export const activityText = formatActivityText;

export type ActivityItemProps = {
  entry: ActivityEntry;
  actors?: Actor[];
  className?: string;
};

export function ActivityItem({ entry, actors, className = "" }: ActivityItemProps) {
  const text = formatActivityText(entry);
  const relative = formatRelativeTime(entry.at);

  return React.createElement(
    "div",
    { className: `activity-item ${className}`.trim() },
    React.createElement(ActorAvatar, { name: entry.actor, actors }),
    React.createElement(
      "div",
      { className: "activity-item-content" },
      React.createElement("span", { className: "activity-actor-name" }, entry.actor),
      " ",
      React.createElement("span", { className: "activity-text" }, text),
      " ",
      React.createElement(
        "span",
        { className: "activity-time", title: entry.at },
        relative
      )
    )
  );
}
