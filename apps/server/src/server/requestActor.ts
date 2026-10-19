import type { Context } from "hono";
import { restActor, assertAgentActor } from "../domain/actors.ts";

declare module "hono" {
  interface ContextVariableMap {
    principal: "owner" | "agent";
  }
}

export function requestActor(c: Context): string {
  const principal = c.get("principal");
  if (principal === "owner") {
    return "you";
  }
  if (principal === "agent") {
    const a = restActor(c.req.header("X-AWB-Actor"));
    assertAgentActor(a);
    return a;
  }
  return restActor(c.req.header("X-AWB-Actor"));
}
