import fs from "node:fs";
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
  const rawPath = values.path ? path.resolve(io.cwd, values.path) : io.cwd;

  if (!fs.existsSync(rawPath)) {
    io.stderr(`Path does not exist: ${rawPath}\n`);
    return 2;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(rawPath);
  } catch {
    io.stderr(`Path does not exist: ${rawPath}\n`);
    return 2;
  }

  if (!stat.isDirectory()) {
    io.stderr(`Path is not a directory: ${rawPath}\n`);
    return 2;
  }

  let resolvedPath: string;
  try {
    resolvedPath = fs.realpathSync(rawPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`Failed to resolve path: ${message}\n`);
    return 2;
  }

  const project = await apiRequest<Project>(io, opts, "POST", "/api/projects", {
    path: resolvedPath,
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
