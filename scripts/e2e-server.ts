import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "../src/server/app.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const staticDir = path.join(repoRoot, "dist/web");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-e2e-"));

const appInstance = await createApp({ dataDir, staticDir });

const server = serve({
  fetch: appInstance.app.fetch,
  port: 4799,
  hostname: "127.0.0.1",
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
  console.log("E2E server listening on http://127.0.0.1:4799");
});
