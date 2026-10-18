import { fileURLToPath } from "node:url";
import cp from "node:child_process";
import { serve } from "@hono/node-server";
import { createApp } from "../../server/app.ts";
import { defaultDataDir, defaultPort } from "../../server/config.ts";
import type { CliIo } from "../client.ts";

export type StartOptions = {
  port?: string;
  "data-dir"?: string;
  open?: boolean;
};

export async function startCommand(io: CliIo, values: StartOptions): Promise<number> {
  const port = values.port ? Number(values.port) : defaultPort(io.env);
  if (Number.isNaN(port) || port <= 0) {
    io.stderr(`Invalid port: ${values.port}\n`);
    return 2;
  }

  const dataDir = (values["data-dir"] as string | undefined) ?? defaultDataDir(io.env);
  const staticDir = fileURLToPath(new URL("../../../dist/web", import.meta.url));

  const appInstance = await createApp({ dataDir, staticDir });

  const server = serve({
    fetch: appInstance.app.fetch,
    port,
    hostname: "127.0.0.1",
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
        io.stderr(`Port ${port} is in use. Use --port or AWB_PORT.\n`);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        io.stderr(`Server error: ${message}\n`);
      }
      finish(1);
    });

    server.on("listening", () => {
      io.stdout(`AI Work Board running at http://127.0.0.1:${port}\n`);
      if (values.open) {
        try {
          cp.spawn("open", [`http://127.0.0.1:${port}`], { detached: true, stdio: "ignore" }).unref();
        } catch {
          // ignore failure to launch browser
        }
      }
      finish(0);
    });
  });
}
