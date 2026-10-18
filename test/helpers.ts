import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import type { Clock } from "../src/server/clock.ts";
import type { Ctx } from "../src/domain/context.ts";
import { createApp, type AppOptions } from "../src/server/app.ts";
import { main, type CliIo } from "../src/cli/main.ts";

export function fixedClock(start: string = "2026-01-01T00:00:00.000Z"): Clock {
  let current = new Date(start).getTime();
  return {
    now(): Date {
      const d = new Date(current);
      current += 1000;
      return d;
    },
  };
}

export type TestApp = {
  app: Hono;
  ctx: Ctx;
  dataDir: string;
  request(
    method: string,
    path: string,
    body?: unknown,
    actor?: string
  ): Promise<{ status: number; body: any }>;
  close(): Promise<void>;
};

export async function makeTestApp(opts?: Partial<AppOptions>): Promise<TestApp> {
  const dataDir = opts?.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "awb-test-"));
  const created = await createApp({
    dataDir,
    clock: fixedClock(),
    ...opts,
  });

  const request = async (
    method: string,
    path: string,
    body?: unknown,
    actor?: string
  ): Promise<{ status: number; body: any }> => {
    const headers: Record<string, string> = {};
    let reqBody: string | undefined = undefined;

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      reqBody = JSON.stringify(body);
    }
    if (actor) {
      headers["X-AWB-Actor"] = actor;
    }

    const res = await created.app.request(path, {
      method,
      headers,
      body: reqBody,
    });

    const text = await res.text();
    let parsedBody: any;
    try {
      parsedBody = text ? JSON.parse(text) : null;
    } catch {
      parsedBody = text;
    }

    return {
      status: res.status,
      body: parsedBody,
    };
  };

  const close = async (): Promise<void> => {
    await created.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };

  return {
    app: created.app,
    ctx: created.ctx,
    dataDir,
    request,
    close,
  };
}

export type TestServer = {
  url: string;
  request(
    method: string,
    path: string,
    body?: unknown,
    actor?: string
  ): Promise<{ status: number; body: any }>;
  close(): Promise<void>;
  dataDir: string;
};

export async function startTestServer(): Promise<TestServer> {
  const testApp = await makeTestApp();
  const server = serve({
    fetch: testApp.app.fetch,
    port: 0,
    hostname: "127.0.0.1",
  });

  const port = await new Promise<number>((resolve) => {
    server.on("listening", () => {
      const addr = server.address() as net.AddressInfo;
      resolve(addr.port);
    });
  });

  const url = `http://127.0.0.1:${port}`;

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await testApp.close();
  };

  return {
    url,
    request: testApp.request,
    close,
    dataDir: testApp.dataDir,
  };
}

export type RunCliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export async function runCli(
  argv: string[],
  opts: { url: string; cwd: string; env?: Record<string, string | undefined> }
): Promise<RunCliResult> {
  let stdoutOutput = "";
  let stderrOutput = "";

  const io: CliIo = {
    env: opts.env ?? {},
    cwd: opts.cwd,
    stdout(s: string) {
      stdoutOutput += s;
    },
    stderr(s: string) {
      stderrOutput += s;
    },
  };

  const hasUrl = argv.includes("--url");
  const fullArgv = hasUrl ? argv : [...argv, "--url", opts.url];

  const code = await main(fullArgv, io);

  return {
    code,
    stdout: stdoutOutput,
    stderr: stderrOutput,
  };
}

export type SseMessage = {
  event: string;
  data: any;
  comment?: string;
  raw: string;
  type?: string;
  projectKey?: string;
  ticketKey?: string;
  featureId?: number;
  actor?: string;
  at?: string;
};

export async function readSseEvents(
  response: Response,
  count: number = 1,
  timeoutMs: number = 2000
): Promise<SseMessage[]> {
  if (!response.body) {
    return [];
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const results: SseMessage[] = [];
  let buffer = "";
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => {});
  }, timeoutMs);

  try {
    while (results.length < count) {
      const { done, value } = await reader.read();
      if (done || timedOut) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let match: RegExpMatchArray | null;
      while ((match = buffer.match(/\r?\n\r?\n/)) !== null) {
        if (match.index === undefined) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);

        if (!block.trim()) {
          continue;
        }

        const lines = block.split(/\r?\n/);
        let event = "";
        let dataStr = "";
        let comment: string | undefined = undefined;

        for (const line of lines) {
          if (line.startsWith(":")) {
            comment = line.slice(1).trim();
          } else if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const val = line.slice(5).trim();
            dataStr = dataStr ? `${dataStr}\n${val}` : val;
          }
        }

        let parsedData: any = dataStr;
        if (dataStr) {
          try {
            parsedData = JSON.parse(dataStr);
          } catch {
            // keep as string
          }
        }

        const item: SseMessage = {
          event,
          data: parsedData,
          comment,
          raw: block,
          ...(typeof parsedData === "object" && parsedData !== null ? parsedData : {}),
        };

        results.push(item);
        if (results.length >= count) {
          break;
        }
      }
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
  }

  return results;
}

