import type { CliIo, GlobalOptions } from "./client.ts";
import { apiRequest } from "./client.ts";
import type { Project } from "../shared/types.ts";

export async function resolveProjectKey(
  io: CliIo,
  opts: GlobalOptions
): Promise<string> {
  if (opts.project) {
    return opts.project;
  }
  const project = await apiRequest<Project>(
    io,
    opts,
    "GET",
    `/api/projects/resolve?cwd=${encodeURIComponent(io.cwd)}`
  );
  return project.key;
}
