import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "../apps/server/src/server/app.ts";
import { hashPassword } from "../apps/server/src/server/auth.ts";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-e2e-hosted-"));

const appInstance = await createApp({
  dataDir,
  database: { kind: "pglite" },
  allowedOrigins: ["http://localhost:4800"],
  auth: {
    ownerPasswordHash: hashPassword("e2e-password"),
    sessionSecret: "e2e-secret",
    apiTokens: ["e2e-token"],
    secureCookies: false,
  },
});

const server = serve({
  fetch: appInstance.app.fetch,
  port: 4801,
  hostname: "localhost",
});

let cleanedUp = false;
async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    server.close();
  } catch {
    // Ignore error closing server
  }
  try {
    await appInstance.close();
  } catch {
    // Ignore error closing app
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Ignore error removing directory
  }
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

process.on("exit", () => {
  void cleanup();
});

server.on("listening", () => {
  console.log("Hosted E2E server listening on http://localhost:4801");
});
