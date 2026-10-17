import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Ctx } from "../domain/context.ts";
import { registerProjectTools } from "./tools/projects.ts";
import { registerTicketTools } from "./tools/tickets.ts";
import { registerFeatureTools } from "./tools/features.ts";

const pkgPath = new URL("../../package.json", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const serverVersion = (pkg.version as string) || "0.1.0";

export function buildMcpServer(ctx: Ctx, urlActor: string | undefined): McpServer {
  const server = new McpServer({
    name: "ai-work-board",
    version: serverVersion,
  });

  registerProjectTools(server, ctx, urlActor);
  registerTicketTools(server, ctx, urlActor);
  registerFeatureTools(server, ctx, urlActor);

  return server;
}
