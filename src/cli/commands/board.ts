import type { CliIo, GlobalOptions } from "../client.ts";
import { apiRequest } from "../client.ts";
import { resolveProjectKey } from "../project.ts";
import type { Board } from "../../shared/types.ts";

export async function boardCommand(
  io: CliIo,
  opts: GlobalOptions
): Promise<number> {
  const projectKey = await resolveProjectKey(io, opts);
  const board = await apiRequest<Board>(
    io,
    opts,
    "GET",
    `/api/projects/${projectKey}/board`
  );

  if (opts.json) {
    io.stdout(JSON.stringify(board, null, 2) + "\n");
    return 0;
  }

  for (const col of board.columns) {
    io.stdout(`== ${col.name} (${col.tickets.length}) ==\n`);
    for (const t of col.tickets) {
      const assigneeStr = t.assignee ? `  @${t.assignee}` : "";
      io.stdout(`${t.key}  [${t.priority}]  ${t.title}${assigneeStr}\n`);
    }
  }

  return 0;
}
