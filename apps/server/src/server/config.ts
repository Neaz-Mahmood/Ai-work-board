import os from "node:os";
import path from "node:path";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type ServerConfig = {
  mode: "local" | "hosted";
  host: string;
  port: number;
  dataDir: string;
  databaseUrl?: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  auth?: {
    ownerPasswordHash: string;
    sessionSecret: string;
    apiTokens: string[];
    secureCookies: boolean;
  };
};

export type ServerConfigMode = "local" | "hosted";

export type ServerConfigFlags = {
  host?: string;
  port?: string;
  dataDir?: string;
  mode?: ServerConfigMode;
};

function clean(val: string | undefined): string | undefined {
  if (val === undefined) return undefined;
  const trimmed = val.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseCommaList(val: string | undefined): string[] {
  if (!val) return [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseMode(val: string | undefined): ServerConfigMode | undefined {
  if (val === undefined) return undefined;
  const lower = val.trim().toLowerCase();
  if (lower === "local" || lower === "hosted") return lower;
  throw new ConfigError(`Invalid mode: ${val} (expected "local" or "hosted")`);
}

export function resolveServerConfig(
  env: Record<string, string | undefined> = process.env,
  flags?: ServerConfigFlags
): ServerConfig {
  const host = clean(flags?.host) ?? clean(env.AWB_HOST) ?? "127.0.0.1";

  let rawPort: string | undefined = flags?.port;
  if (rawPort === undefined) {
    rawPort = clean(env.AWB_PORT);
  }

  let port = 4747;
  if (rawPort !== undefined) {
    const trimmed = rawPort.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1 || Number(trimmed) > 65535) {
      throw new ConfigError(`Invalid port: ${rawPort}`);
    }
    port = Number(trimmed);
  }

  const dataDir =
    clean(flags?.dataDir) ??
    clean(env.AWB_HOME) ??
    path.join(os.homedir(), ".ai-work-board");

  const databaseUrl = clean(env.DATABASE_URL);
  const allowedOrigins = parseCommaList(env.AWB_ALLOWED_ORIGINS);

  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";

  // Mode is opt-in: an explicit `--mode` / AWB_MODE always wins. Otherwise a
  // non-loopback host implies hosted mode. DATABASE_URL deliberately does NOT
  // imply hosted mode -- pointing a local server at Postgres is a supported
  // setup that should not silently turn on auth requirements.
  const explicitMode = flags?.mode ?? parseMode(clean(env.AWB_MODE));
  const mode: ServerConfigMode = explicitMode ?? (isLoopback ? "local" : "hosted");

  let auth: ServerConfig["auth"];
  if (mode === "hosted") {
    const missing: string[] = [];
    const ownerPasswordHash = clean(env.AWB_OWNER_PASSWORD_HASH);
    if (!ownerPasswordHash) {
      missing.push("AWB_OWNER_PASSWORD_HASH");
    }
    const sessionSecret = clean(env.AWB_SESSION_SECRET);
    if (!sessionSecret) {
      missing.push("AWB_SESSION_SECRET");
    }
    const apiTokens = parseCommaList(env.AWB_API_TOKENS);
    if (apiTokens.length === 0) {
      missing.push("AWB_API_TOKENS");
    }

    if (missing.length > 0) {
      throw new ConfigError(`Hosted mode requires: ${missing.join(", ")}`);
    }

    auth = {
      ownerPasswordHash: ownerPasswordHash!,
      sessionSecret: sessionSecret!,
      apiTokens,
      secureCookies: !isLoopback,
    };
  }

  const rawTrustProxy = clean(env.AWB_TRUST_PROXY);
  let trustProxy = false;
  if (rawTrustProxy !== undefined) {
    const lower = rawTrustProxy.toLowerCase();
    if (lower === "1" || lower === "true" || lower === "yes") {
      trustProxy = true;
    } else {
      throw new ConfigError(`Invalid AWB_TRUST_PROXY: ${rawTrustProxy}`);
    }
  }

  const config: ServerConfig = {
    mode,
    host,
    port,
    dataDir,
    allowedOrigins,
    trustProxy,
  };

  if (databaseUrl !== undefined) {
    config.databaseUrl = databaseUrl;
  }
  if (auth !== undefined) {
    config.auth = auth;
  }

  return config;
}
