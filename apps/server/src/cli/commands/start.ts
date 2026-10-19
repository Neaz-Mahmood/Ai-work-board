import path from "node:path";
import { fileURLToPath } from "node:url";
import cp from "node:child_process";
import { serve } from "@hono/node-server";
import { createApp } from "../../server/app.ts";
import { resolveServerConfig, ConfigError } from "../../server/config.ts";
import type { CliIo } from "../client.ts";

export type StartOptions = {
  host?: string;
  port?: string;
  "data-dir"?: string;
  open?: boolean;
};

export async function startCommand(io: CliIo, values: StartOptions): Promise<number> {
  let config;
  try {
    config = resolveServerConfig(io.env, {
      host: values.host,
      port: values.port,
      dataDir: values["data-dir"],
    });
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      io.stderr(`${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const database = config.databaseUrl
    ? { kind: "postgres" as const, url: config.databaseUrl }
    : { kind: "pglite" as const, dir: path.join(config.dataDir, "pgdata") };

  const staticDir =
    config.mode === "local"
      ? fileURLToPath(new URL("../../../../web/dist", import.meta.url))
      : undefined;

  const appInstance = await createApp({
    dataDir: config.dataDir,
    database,
    staticDir,
    auth: config.auth,
    allowedOrigins: config.allowedOrigins,
  });

  const server = serve({
    fetch: appInstance.app.fetch,
    port: config.port,
    hostname: config.host,
  });

  return new Promise<number>((resolve) => {
    let resolved = false;
    const finish = (code: number) => {
      if (!resolved) {
        resolved = true;
        resolve(code);
      }
    };

    server.on("error", (err: unknown) => {
      void appInstance.close();
      const code = (err as { code?: string })?.code;
      if (code === "EADDRINUSE") {
        io.stderr(`Port ${config.port} is in use. Use --port or AWB_PORT.\n`);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        io.stderr(`Server error: ${message}\n`);
      }
      finish(1);
    });

    server.on("listening", () => {
      const urlHost = config.host.includes(":") ? `[${config.host}]` : config.host;
      const url = `http://${urlHost}:${config.port}`;
      io.stdout(`AI Work Board running at ${url}\n`);
      if (values.open && config.mode === "local") {
        try {
          cp.spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
        } catch {
          // ignore failure to launch browser
        }
      }
      finish(0);
    });
  });
}
