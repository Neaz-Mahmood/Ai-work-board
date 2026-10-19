import fs from "node:fs";
import type { CliIo, GlobalOptions } from "./client.ts";
import { apiRequest } from "./client.ts";
import type { Project } from "@awb/shared/types.ts";

export async function resolveProjectKey(
  io: CliIo,
  opts: GlobalOptions
): Promise<string> {
  if (opts.project) {
    return opts.project;
  }
  let cwdToSend = io.cwd;
  if (fs.existsSync(io.cwd)) {
    try {
      cwdToSend = fs.realpathSync(io.cwd);
    } catch {
      cwdToSend = io.cwd;
    }
  }
  const project = await apiRequest<Project>(
    io,
    opts,
    "GET",
    `/api/projects/resolve?cwd=${encodeURIComponent(cwdToSend)}`
  );
  return project.key;
}
