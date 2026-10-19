import fs from "node:fs";
import path from "node:path";
import type { CliIo, GlobalOptions } from "../client.ts";
import { apiRequest, CliDomainError } from "../client.ts";
import { resolveProjectKey } from "../project.ts";
import { parseColumn } from "../columns.ts";
import { COLUMNS } from "@awb/shared/columns.ts";
import type { Card, Comment, Ticket } from "@awb/shared/types.ts";

export type TicketListOptions = {
  column?: string;
  assignee?: string;
  query?: string;
  feature?: string;
};

export async function ticketListCommand(
  io: CliIo,
  opts: GlobalOptions,
  values: TicketListOptions
): Promise<number> {
  const projectKey = await resolveProjectKey(io, opts);
  const params = new URLSearchParams();
  if (values.column) {
    const colId = parseColumn(values.column);
    params.set("column", colId);
  }
  if (values.assignee) {
    params.set("assignee", values.assignee);
  }
  if (values.query) {
    params.set("q", values.query);
  }
  if (values.feature) {
    params.set("feature", values.feature);
  }

  const qs = params.toString();
  const endpoint = `/api/projects/${projectKey}/tickets${qs ? `?${qs}` : ""}`;
  const cards = await apiRequest<Card[]>(io, opts, "GET", endpoint);

  if (opts.json) {
    io.stdout(JSON.stringify(cards, null, 2) + "\n");
    return 0;
  }

  for (const card of cards) {
    const assigneeStr = card.assignee ? `  @${card.assignee}` : "";
    io.stdout(`${card.key}  [${card.priority}]  ${card.title}${assigneeStr}\n`);
  }

  return 0;
}

export async function ticketShowCommand(
  io: CliIo,
  opts: GlobalOptions,
  key: string | undefined
): Promise<number> {
  if (!key || key.trim().length === 0) {
    io.stderr("Error: Ticket key is required\n");
    return 2;
  }

  const ticketKey = key.trim();
  const ticket = await apiRequest<Ticket>(
    io,
    opts,
    "GET",
    `/api/tickets/${encodeURIComponent(ticketKey)}`
  );

  if (opts.json) {
    io.stdout(JSON.stringify(ticket, null, 2) + "\n");
    return 0;
  }

  io.stdout(`${ticket.key}: ${ticket.title}\n`);
  io.stdout(`Column: ${ticket.column}\n`);
  io.stdout(`Priority: ${ticket.priority}\n`);
  if (ticket.feature) {
    io.stdout(`Feature: #${ticket.feature.id} ${ticket.feature.name}\n`);
  }
  io.stdout(`Assignee: ${ticket.assignee ?? "none"}\n`);
  if (ticket.needsAttention) {
    io.stdout(`Needs attention: ${ticket.needsAttention}\n`);
  }
  if (ticket.blockers && ticket.blockers.length > 0) {
    io.stdout(`\nBlocked by:\n`);
    for (const b of ticket.blockers) {
      io.stdout(`  ${b.key}  [${b.column}]  ${b.title}\n`);
    }
  }
  if (ticket.blocks && ticket.blocks.length > 0) {
    io.stdout(`\nBlocks:\n`);
    for (const b of ticket.blocks) {
      io.stdout(`  ${b.key}  [${b.column}]  ${b.title}\n`);
    }
  }
  if (ticket.description) {
    io.stdout(`\n${ticket.description}\n`);
  }
  if (ticket.comments && ticket.comments.length > 0) {
    io.stdout(`\nComments:\n`);
    for (const comment of ticket.comments) {
      io.stdout(`--- ${comment.actor} at ${comment.createdAt}\n${comment.body.trimEnd()}\n`);
    }
  }
  if (ticket.activity && ticket.activity.length > 0) {
    io.stdout(`\nActivity:\n`);
    for (const act of ticket.activity) {
      io.stdout(`  ${act.at}  ${act.actor}  ${act.kind}\n`);
    }
  }

  return 0;
}

export type TicketCommentOptions = {
  file?: string;
};

export async function ticketCommentCommand(
  io: CliIo,
  opts: GlobalOptions,
  key: string | undefined,
  text: string | undefined,
  values: TicketCommentOptions
): Promise<number> {
  if (!key || key.trim().length === 0) {
    io.stderr("Error: Ticket key is required\n");
    return 2;
  }

  const ticketKey = key.trim();

  let body: string | undefined = undefined;
  if (values.file) {
    const filePath = path.resolve(io.cwd, values.file);
    if (!fs.existsSync(filePath)) {
      throw new CliDomainError(
        "VALIDATION",
        `Comment file not found: ${values.file}`
      );
    }
    body = fs.readFileSync(filePath, "utf-8");
  } else if (text !== undefined) {
    body = text;
  }

  if (body === undefined) {
    io.stderr("Error: Comment text or --file is required\n");
    return 2;
  }

  const comment = await apiRequest<Comment>(
    io,
    opts,
    "POST",
    `/api/tickets/${encodeURIComponent(ticketKey)}/comments`,
    { body }
  );

  if (opts.json) {
    io.stdout(JSON.stringify(comment, null, 2) + "\n");
    return 0;
  }

  io.stdout(`Commented on ${ticketKey.toUpperCase()}\n`);
  return 0;
}

export type TicketCreateOptions = {
  title?: string;
  description?: string;
  "description-file"?: string;
  column?: string;
  priority?: string;
  assignee?: string;
  "blocked-by"?: string | string[];
  feature?: string;
};

export async function ticketCreateCommand(
  io: CliIo,
  opts: GlobalOptions,
  values: TicketCreateOptions
): Promise<number> {
  if (!values.title || values.title.trim().length === 0) {
    io.stderr("Error: Ticket title is required\n");
    return 2;
  }

  let description: string | undefined = values.description;
  if (values["description-file"]) {
    const filePath = path.resolve(io.cwd, values["description-file"]);
    if (!fs.existsSync(filePath)) {
      throw new CliDomainError(
        "VALIDATION",
        `Description file not found: ${values["description-file"]}`
      );
    }
    description = fs.readFileSync(filePath, "utf-8");
  }

  let column: string | undefined = undefined;
  if (values.column) {
    column = parseColumn(values.column);
  }

  let blockedBy: string[] | undefined = undefined;
  if (values["blocked-by"]) {
    blockedBy = Array.isArray(values["blocked-by"])
      ? values["blocked-by"]
      : [values["blocked-by"]];
  }

  let featureId: number | undefined = undefined;
  if (values.feature !== undefined && values.feature.trim().toLowerCase() !== "none") {
    const parsedId = parseInt(values.feature.trim(), 10);
    featureId = Number.isNaN(parsedId) ? (values.feature as any) : parsedId;
  }

  const projectKey = await resolveProjectKey(io, opts);
  const ticket = await apiRequest<Ticket>(
    io,
    opts,
    "POST",
    `/api/projects/${projectKey}/tickets`,
    {
      title: values.title.trim(),
      description,
      column,
      priority: values.priority,
      assignee: values.assignee,
      blockedBy,
      featureId,
    }
  );

  if (opts.json) {
    io.stdout(JSON.stringify(ticket, null, 2) + "\n");
    return 0;
  }

  io.stdout(`Created ${ticket.key}\n`);
  return 0;
}

export type TicketBlockOptions = {
  by?: string;
};

export async function ticketBlockCommand(
  io: CliIo,
  opts: GlobalOptions,
  key: string | undefined,
  values: TicketBlockOptions
): Promise<number> {
  if (!key || key.trim().length === 0) {
    io.stderr("Error: Ticket key is required\n");
    return 2;
  }
  if (!values.by || values.by.trim().length === 0) {
    io.stderr("Error: --by is required\n");
    return 2;
  }

  const ticketKey = key.trim();
  const blockerKey = values.by.trim();

  const ticket = await apiRequest<Ticket>(
    io,
    opts,
    "POST",
    `/api/tickets/${encodeURIComponent(ticketKey)}/blockers`,
    { blockerKey }
  );

  if (opts.json) {
    io.stdout(JSON.stringify(ticket, null, 2) + "\n");
    return 0;
  }

  io.stdout(`Blocked ${ticket.key} by ${blockerKey.toUpperCase()}\n`);
  return 0;
}

export type TicketUnblockOptions = {
  by?: string;
};

export async function ticketUnblockCommand(
  io: CliIo,
  opts: GlobalOptions,
  key: string | undefined,
  values: TicketUnblockOptions
): Promise<number> {
  if (!key || key.trim().length === 0) {
    io.stderr("Error: Ticket key is required\n");
    return 2;
  }
  if (!values.by || values.by.trim().length === 0) {
    io.stderr("Error: --by is required\n");
    return 2;
  }

  const ticketKey = key.trim();
  const blockerKey = values.by.trim();

  const ticket = await apiRequest<Ticket>(
    io,
    opts,
    "DELETE",
    `/api/tickets/${encodeURIComponent(ticketKey)}/blockers/${encodeURIComponent(blockerKey)}`
  );

  if (opts.json) {
    io.stdout(JSON.stringify(ticket, null, 2) + "\n");
    return 0;
  }

  io.stdout(`Unblocked ${ticket.key} from ${blockerKey.toUpperCase()}\n`);
  return 0;
}

export type TicketUpdateOptions = {
  title?: string;
  description?: string;
  "description-file"?: string;
  priority?: string;
  assignee?: string;
  feature?: string;
};

export async function ticketUpdateCommand(
  io: CliIo,
  opts: GlobalOptions,
  key: string | undefined,
  values: TicketUpdateOptions
): Promise<number> {
  if (!key || key.trim().length === 0) {
    io.stderr("Error: Ticket key is required\n");
    return 2;
  }

  const ticketKey = key.trim();

  let description: string | undefined = values.description;
  if (values["description-file"]) {
    const filePath = path.resolve(io.cwd, values["description-file"]);
    if (!fs.existsSync(filePath)) {
      throw new CliDomainError(
        "VALIDATION",
        `Description file not found: ${values["description-file"]}`
      );
    }
    description = fs.readFileSync(filePath, "utf-8");
  }

  const patch: Record<string, unknown> = {};
  if (values.title !== undefined) {
    patch.title = values.title;
  }
  if (description !== undefined) {
    patch.description = description;
  }
  if (values.priority !== undefined) {
    patch.priority = values.priority;
  }
  if (values.assignee !== undefined) {
    if (values.assignee.trim().toLowerCase() === "none") {
      patch.assignee = null;
    } else {
      patch.assignee = values.assignee.trim();
    }
  }
  if (values.feature !== undefined) {
    if (values.feature.trim().toLowerCase() === "none") {
      patch.featureId = null;
    } else {
      const parsedId = parseInt(values.feature.trim(), 10);
      patch.featureId = Number.isNaN(parsedId) ? (values.feature as any) : parsedId;
    }
  }

  const ticket = await apiRequest<Ticket>(
    io,
    opts,
    "PATCH",
    `/api/tickets/${encodeURIComponent(ticketKey)}`,
    patch
  );

  if (opts.json) {
    io.stdout(JSON.stringify(ticket, null, 2) + "\n");
    return 0;
  }

  io.stdout(`Updated ${ticket.key}\n`);
  return 0;
}

export type TicketMoveOptions = {
  position?: string;
};

export async function ticketMoveCommand(
  io: CliIo,
  opts: GlobalOptions,
  key: string | undefined,
  columnRaw: string | undefined,
  values: TicketMoveOptions
): Promise<number> {
  if (!key || key.trim().length === 0) {
    io.stderr("Error: Ticket key is required\n");
    return 2;
  }
  if (!columnRaw || columnRaw.trim().length === 0) {
    io.stderr("Error: Column is required\n");
    return 2;
  }

  const ticketKey = key.trim();
  const column = parseColumn(columnRaw);

  let position: number | undefined = undefined;
  if (values.position !== undefined) {
    const pos = parseInt(values.position, 10);
    if (Number.isNaN(pos)) {
      throw new CliDomainError("VALIDATION", "Position must be a number");
    }
    position = pos;
  }

  const body: Record<string, unknown> = { column };
  if (position !== undefined) {
    body.position = position;
  }

  const ticket = await apiRequest<Ticket>(
    io,
    opts,
    "POST",
    `/api/tickets/${encodeURIComponent(ticketKey)}/move`,
    body
  );

  if (opts.json) {
    io.stdout(JSON.stringify(ticket, null, 2) + "\n");
    return 0;
  }

  const colName = COLUMNS.find((c) => c.id === ticket.column)?.name ?? ticket.column;
  io.stdout(`Moved ${ticket.key} to ${colName}\n`);
  return 0;
}

export type TicketAttentionOptions = {
  clear?: boolean;
};

export async function ticketAttentionCommand(
  io: CliIo,
  opts: GlobalOptions,
  key: string | undefined,
  reason: string | undefined,
  values: TicketAttentionOptions
): Promise<number> {
  if (!key || key.trim().length === 0) {
    io.stderr("Error: Ticket key is required\n");
    return 2;
  }

  const ticketKey = key.trim();

  if (values.clear) {
    const ticket = await apiRequest<Ticket>(
      io,
      opts,
      "DELETE",
      `/api/tickets/${encodeURIComponent(ticketKey)}/attention`
    );

    if (opts.json) {
      io.stdout(JSON.stringify(ticket, null, 2) + "\n");
      return 0;
    }

    io.stdout(`Cleared ${ticket.key}\n`);
    return 0;
  }

  if (!reason || reason.trim().length === 0) {
    io.stderr("Error: Attention reason is required\n");
    return 2;
  }

  const ticket = await apiRequest<Ticket>(
    io,
    opts,
    "PUT",
    `/api/tickets/${encodeURIComponent(ticketKey)}/attention`,
    { reason: reason.trim() }
  );

  if (opts.json) {
    io.stdout(JSON.stringify(ticket, null, 2) + "\n");
    return 0;
  }

  io.stdout(`Flagged ${ticket.key}\n`);
  return 0;
}
