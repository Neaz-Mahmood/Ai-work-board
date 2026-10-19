import type { CliIo, GlobalOptions } from "../client.ts";
import { apiRequest, CliDomainError } from "../client.ts";
import { resolveProjectKey } from "../project.ts";
import type { Ticket } from "@awb/shared/types.ts";

export type ClaimOptions = {
  feature?: string;
};

export async function claimCommand(
  io: CliIo,
  opts: GlobalOptions,
  values: ClaimOptions
): Promise<number> {
  const projectKey = await resolveProjectKey(io, opts);

  let featureId: number | undefined = undefined;
  if (values.feature !== undefined) {
    featureId = parseInt(values.feature, 10);
    if (Number.isNaN(featureId)) {
      throw new CliDomainError("VALIDATION", "Feature ID must be a number");
    }
  }

  const body: { featureId?: number } = {};
  if (featureId !== undefined) {
    body.featureId = featureId;
  }

  const res = await apiRequest<{ ticket: Ticket | null }>(
    io,
    opts,
    "POST",
    `/api/projects/${encodeURIComponent(projectKey)}/claim`,
    body
  );

  const ticket = res.ticket;

  if (opts.json) {
    io.stdout(JSON.stringify({ ticket }, null, 2) + "\n");
    return 0;
  }

  if (!ticket) {
    io.stdout("Nothing to claim\n");
    return 0;
  }

  io.stdout(`Claimed ${ticket.key}: ${ticket.title}\n`);
  if (ticket.description && ticket.description.trim().length > 0) {
    io.stdout(`${ticket.description.trimEnd()}\n`);
  }

  return 0;
}
