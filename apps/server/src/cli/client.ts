export type CliIo = {
  env: Record<string, string | undefined>;
  cwd: string;
  stdout(s: string): void;
  stderr(s: string): void;
};

export type GlobalOptions = {
  as?: string;
  project?: string;
  json?: boolean;
  url?: string;
};

export class ServerUnreachable extends Error {
  url: string;
  constructor(url: string) {
    super(`AI Work Board server is not running at ${url}. Run \`awb start\`.`);
    this.name = "ServerUnreachable";
    this.url = url;
  }
}

export class AuthFailed extends Error {
  constructor() {
    super(
      "Authentication failed: set AWB_TOKEN to an API token configured on the server (AWB_API_TOKENS)."
    );
    this.name = "AuthFailed";
  }
}

export class CliDomainError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CliDomainError";
    this.code = code;
  }
}

export async function apiRequest<T = unknown>(
  io: CliIo,
  opts: GlobalOptions,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const rawUrl = opts.url ?? io.env.AWB_URL ?? "http://127.0.0.1:4747";
  const baseUrl = rawUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};

  const token = io.env.AWB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const actor = opts.as ?? io.env.AWB_ACTOR;
  if (actor) {
    headers["X-AWB-Actor"] = actor;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ServerUnreachable(baseUrl);
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new AuthFailed();
    }
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (data?.error?.code && typeof data.error.message === "string") {
      throw new CliDomainError(data.error.code, data.error.message);
    }
    throw new CliDomainError(
      "ERROR",
      res.statusText || `Request failed with status ${res.status}`
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
