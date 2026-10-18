import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Ctx } from "../../domain/context.ts";
import { resolveProject } from "../../domain/projects.ts";
import {
  createFeature,
  getFeature,
  listFeatures,
  updateFeature,
} from "../../domain/features.ts";
import { actorFor, withToolResult } from "../result.ts";

export function registerFeatureTools(
  server: McpServer,
  ctx: Ctx,
  urlActor: string | undefined
): void {
  server.tool(
    "list_features",
    "List all features in a project with their progress metrics (completed and total ticket counts) and visual badge colors.",
    {
      project: z.string().optional().describe("Optional project key. If omitted, the project is resolved from cwd or the nearest registered parent directory"),
      cwd: z.string().optional().describe("Optional absolute, symlink-resolved path of the repository on the agent's machine used to resolve the project when project key is omitted (deepest match wins)"),
    },
    async (args) => {
      return withToolResult(() => {
        const project = resolveProject(ctx, { key: args.project, cwd: args.cwd });
        return listFeatures(ctx, project.key);
      });
    }
  );

  server.tool(
    "get_feature",
    "Fetch a feature by its numerical ID along with its progress metrics, description, and list of associated tickets.",
    {
      featureId: z.number().int().describe("Numerical ID of the feature to fetch"),
    },
    async (args) => {
      return withToolResult(() => {
        return getFeature(ctx, args.featureId);
      });
    }
  );

  server.tool(
    "create_feature",
    "Planning step: create a Feature and its ordered Tickets in one call. Tickets land in Backlog for the user to approve. Use blockedByIndexes to order work within the list.",
    {
      project: z.string().optional().describe("Optional project key. If omitted, the project is resolved from cwd or the nearest registered parent directory"),
      cwd: z.string().optional().describe("Optional absolute, symlink-resolved path of the repository on the agent's machine used to resolve the project when project key is omitted (deepest match wins)"),
      name: z.string().describe("Unique feature name within this project (1-100 characters)"),
      description: z.string().optional().describe("Optional markdown description outlining feature architecture, requirements, or scope"),
      color: z.string().optional().describe("Optional hex color code (#RRGGBB) for the feature card badge (auto-selected from palette if omitted)"),
      tickets: z
        .array(
          z.object({
            title: z.string().describe("Ticket title summary (1-200 characters)"),
            description: z.string().optional().describe("Optional markdown description detailing ticket requirements or acceptance criteria"),
            priority: z
              .string()
              .optional()
              .describe("Optional priority level ('highest', 'high', 'medium', 'low', 'lowest'; default: 'medium')"),
            column: z
              .string()
              .optional()
              .describe("Optional initial column (default: 'backlog'; user approves and moves to 'todo')"),
            blockedBy: z.array(z.string()).optional().describe("Optional array of existing ticket keys in the project that block this ticket"),
            blockedByIndexes: z
              .array(z.number().int())
              .optional()
              .describe("Optional array of 0-based indices pointing to earlier tickets in this list that must be completed first"),
          })
        )
        .optional()
        .describe("Optional array of ordered tickets to create with this feature in a single transaction (default column: backlog)"),
      actor: z.string().optional().describe("Optional actor name creating the feature (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(() => {
        const actor = actorFor(args.actor, urlActor);
        const project = resolveProject(ctx, { key: args.project, cwd: args.cwd });
        return createFeature(ctx, actor, project.key, {
          name: args.name,
          description: args.description,
          color: args.color,
          tickets: args.tickets as any,
        });
      });
    }
  );

  server.tool(
    "update_feature",
    "Update feature properties such as name, markdown description, or badge color. Does not modify linked tickets.",
    {
      featureId: z.number().int().describe("Numerical ID of the feature to update"),
      name: z.string().optional().describe("Optional updated name for the feature (unique within project, 1-100 characters)"),
      description: z.string().optional().describe("Optional updated markdown description for the feature"),
      color: z.string().optional().describe("Optional updated hex color code (#RRGGBB) for the feature badge"),
      actor: z.string().optional().describe("Optional actor name performing the update (e.g. agent name; 'you' is reserved for UI)"),
    },
    async (args) => {
      return withToolResult(() => {
        const actor = actorFor(args.actor, urlActor);
        const patch: Record<string, unknown> = {};
        if (args.name !== undefined) patch.name = args.name;
        if (args.description !== undefined) patch.description = args.description;
        if (args.color !== undefined) patch.color = args.color;
        return updateFeature(ctx, actor, args.featureId, patch);
      });
    }
  );
}
