import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Ctx } from "../../domain/context.ts";
import { createProject, listProjects } from "../../domain/projects.ts";
import { actorFor, withToolResult } from "../result.ts";

export function registerProjectTools(
  server: McpServer,
  ctx: Ctx,
  urlActor: string | undefined
): void {
  server.tool(
    "list_projects",
    "List all registered projects on the AI Work Board with their keys, repository paths, and ticket counts across columns.",
    {},
    async () => {
      return withToolResult(async () => await listProjects(ctx));
    }
  );

  server.tool(
    "create_project",
    "Register a repository directory as a new project on the AI Work Board to begin tracking boards, tickets, and features.",
    {
      path: z.string().describe("Absolute, symlink-resolved path of the repository on the agent's machine"),
      name: z.string().optional().describe("Optional display name for the project (defaults to directory name if omitted)"),
      key: z.string().optional().describe("Optional project key of 2-5 uppercase letters (derived from directory name if omitted)"),
      actor: z.string().optional().describe("Optional actor name performing this action (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(async () => {
        const actor = actorFor(args.actor, urlActor);
        return await createProject(
          ctx,
          {
            path: args.path,
            name: args.name,
            key: args.key,
          },
          actor
        );
      });
    }
  );
}
