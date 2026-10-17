import { DomainError } from "../server/errors.ts";
import { resolveActorName, assertAgentActor } from "../domain/actors.ts";

export type McpToolTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: McpToolTextContent[];
  isError?: boolean;
};

export function success(value: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

export function errorResult(err: unknown): McpToolResult {
  if (err instanceof DomainError) {
    return {
      isError: true,
      content: [{ type: "text", text: `${err.code}: ${err.message}` }],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: `INTERNAL: ${message}` }],
  };
}

export function actorFor(paramActor?: string, urlActor?: string): string {
  const resolved = resolveActorName(paramActor, urlActor);
  assertAgentActor(resolved);
  return resolved;
}

export async function withToolResult<T>(fn: () => Promise<T> | T): Promise<McpToolResult> {
  try {
    const res = await fn();
    return success(res);
  } catch (err) {
    return errorResult(err);
  }
}
