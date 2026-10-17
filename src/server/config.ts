import os from "node:os";
import path from "node:path";

export function defaultDataDir(env: Record<string, string | undefined> = process.env): string {
  if (env.AWB_HOME && env.AWB_HOME.trim() !== "") {
    return env.AWB_HOME;
  }
  return path.join(os.homedir(), ".ai-work-board");
}

export function defaultPort(env: Record<string, string | undefined> = process.env): number {
  if (env.AWB_PORT) {
    const parsed = Number(env.AWB_PORT);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 4747;
}
