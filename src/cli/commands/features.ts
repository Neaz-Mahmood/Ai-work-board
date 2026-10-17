import fs from "node:fs";
import path from "node:path";
import type { CliIo, GlobalOptions } from "../client.ts";
import { apiRequest, CliDomainError } from "../client.ts";
import { resolveProjectKey } from "../project.ts";
import type { Feature, FeatureWithTickets, Ticket } from "../../shared/types.ts";

export async function featureListCommand(
  io: CliIo,
  opts: GlobalOptions
): Promise<number> {
  const projectKey = await resolveProjectKey(io, opts);
  const features = await apiRequest<Feature[]>(
    io,
    opts,
    "GET",
    `/api/projects/${projectKey}/features`
  );

  if (opts.json) {
    io.stdout(JSON.stringify(features, null, 2) + "\n");
    return 0;
  }

  for (const f of features) {
    io.stdout(`#${f.id}  ${f.name}  ${f.progress.done}/${f.progress.total}\n`);
  }

  return 0;
}

export async function featureShowCommand(
  io: CliIo,
  opts: GlobalOptions,
  idRaw: string | undefined
): Promise<number> {
  if (!idRaw || idRaw.trim().length === 0) {
    io.stderr("Error: Feature ID is required\n");
    return 2;
  }

  const id = parseInt(idRaw.trim(), 10);
  if (Number.isNaN(id)) {
    throw new CliDomainError("VALIDATION", "Feature ID must be a number");
  }

  const feature = await apiRequest<FeatureWithTickets>(
    io,
    opts,
    "GET",
    `/api/features/${id}`
  );

  if (opts.json) {
    io.stdout(JSON.stringify(feature, null, 2) + "\n");
    return 0;
  }

  io.stdout(`#${feature.id}  ${feature.name}  ${feature.progress.done}/${feature.progress.total}\n`);
  if (feature.color) {
    io.stdout(`Color: ${feature.color}\n`);
  }
  if (feature.description) {
    io.stdout(`\n${feature.description}\n`);
  }
  if (feature.tickets && feature.tickets.length > 0) {
    io.stdout(`\nTickets:\n`);
    for (const t of feature.tickets) {
      const assigneeStr = t.assignee ? `  @${t.assignee}` : "";
      io.stdout(`  ${t.key}  [${t.column}]  [${t.priority}]  ${t.title}${assigneeStr}\n`);
    }
  }

  return 0;
}

export type FeatureCreateOptions = {
  description?: string;
  color?: string;
  "tickets-file"?: string;
};

export async function featureCreateCommand(
  io: CliIo,
  opts: GlobalOptions,
  name: string | undefined,
  values: FeatureCreateOptions
): Promise<number> {
  if (!name || name.trim().length === 0) {
    io.stderr("Error: Feature name is required\n");
    return 2;
  }

  let tickets: unknown[] | undefined = undefined;
  if (values["tickets-file"]) {
    const filePath = path.resolve(io.cwd, values["tickets-file"]);
    if (!fs.existsSync(filePath)) {
      throw new CliDomainError(
        "VALIDATION",
        `Tickets file not found: ${values["tickets-file"]}`
      );
    }
    const content = fs.readFileSync(filePath, "utf-8");
    try {
      tickets = JSON.parse(content);
    } catch {
      throw new CliDomainError("VALIDATION", "Tickets file must contain valid JSON");
    }
  }

  const projectKey = await resolveProjectKey(io, opts);
  const result = await apiRequest<{ feature: Feature; tickets: Ticket[] }>(
    io,
    opts,
    "POST",
    `/api/projects/${projectKey}/features`,
    {
      name: name.trim(),
      description: values.description,
      color: values.color,
      tickets,
    }
  );

  if (opts.json) {
    io.stdout(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  const createdTickets = result.tickets || [];
  if (createdTickets.length > 0) {
    const keysStr = createdTickets.map((t) => t.key).join(", ");
    io.stdout(`Created #${result.feature.id} (${keysStr})\n`);
  } else {
    io.stdout(`Created #${result.feature.id}\n`);
  }

  return 0;
}

export type FeatureUpdateOptions = {
  name?: string;
  description?: string;
  color?: string;
};

export async function featureUpdateCommand(
  io: CliIo,
  opts: GlobalOptions,
  idRaw: string | undefined,
  values: FeatureUpdateOptions
): Promise<number> {
  if (!idRaw || idRaw.trim().length === 0) {
    io.stderr("Error: Feature ID is required\n");
    return 2;
  }

  const id = parseInt(idRaw.trim(), 10);
  if (Number.isNaN(id)) {
    throw new CliDomainError("VALIDATION", "Feature ID must be a number");
  }

  const patch: Record<string, unknown> = {};
  if (values.name !== undefined) {
    patch.name = values.name;
  }
  if (values.description !== undefined) {
    patch.description = values.description;
  }
  if (values.color !== undefined) {
    patch.color = values.color;
  }

  const feature = await apiRequest<Feature>(
    io,
    opts,
    "PATCH",
    `/api/features/${id}`,
    patch
  );

  if (opts.json) {
    io.stdout(JSON.stringify(feature, null, 2) + "\n");
    return 0;
  }

  io.stdout(`Updated #${feature.id}\n`);
  return 0;
}
