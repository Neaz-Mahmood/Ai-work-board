import path from "node:path";
import type { CliIo, GlobalOptions } from "../client.ts";
import { apiRequest } from "../client.ts";
import type { Project } from "../../shared/types.ts";

export type InitOptions = {
  key?: string;
  name?: string;
  path?: string;
};

export async function initCommand(
  io: CliIo,
  opts: GlobalOptions,
  values: InitOptions
): Promise<number> {
  const targetPath = values.path ? path.resolve(io.cwd, values.path) : io.cwd;

  const project = await apiRequest<Project>(io, opts, "POST", "/api/projects", {
    path: targetPath,
    name: values.name,
    key: values.key,
  });

  if (opts.json) {
    io.stdout(JSON.stringify(project, null, 2) + "\n");
  } else {
    io.stdout(`Registered ${project.key} (${project.name}) at ${project.path}\n`);
  }

  return 0;
}
