import type { CliIo, GlobalOptions } from "../client.ts";
import { apiRequest } from "../client.ts";
import type { Project } from "@awb/shared/types.ts";

export async function projectsCommand(
  io: CliIo,
  opts: GlobalOptions
): Promise<number> {
  const projects = await apiRequest<Project[]>(io, opts, "GET", "/api/projects");

  if (opts.json) {
    io.stdout(JSON.stringify(projects, null, 2) + "\n");
  } else {
    for (const p of projects) {
      io.stdout(`${p.key}  ${p.name}  ${p.path}\n`);
    }
  }

  return 0;
}
