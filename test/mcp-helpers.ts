import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Hono } from "hono";

export type CallToolResponse = {
  isError: boolean;
  data: any;
};

export async function connectMcp(
  appOrWrapper: Hono | { app: Hono },
  actor?: string,
  headers?: Record<string, string>
): Promise<Client> {
  const app =
    "app" in appOrWrapper && typeof appOrWrapper.app === "object"
      ? appOrWrapper.app
      : (appOrWrapper as Hono);

  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  const url = new URL("http://awb.test/mcp" + (actor ? "?actor=" + actor : ""));
  const transport = new StreamableHTTPClientTransport(url, {
    fetch: async (input, init) => {
      const mergedHeaders = new Headers(init?.headers);
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          mergedHeaders.set(k, v);
        }
      }
      return await app.fetch(
        new Request(input as any, {
          ...init,
          headers: mergedHeaders,
        })
      );
    },
  });

  await client.connect(transport);
  return client;
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<CallToolResponse> {
  try {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const isError = Boolean(result.isError);
    const textContent = result.content?.find((c) => c.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    const rawText = textContent ? textContent.text : "";

    if (isError) {
      return { isError: true, data: rawText };
    }

    try {
      return { isError: false, data: JSON.parse(rawText) };
    } catch {
      return { isError: false, data: rawText };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isError: true, data: msg };
  }
}
