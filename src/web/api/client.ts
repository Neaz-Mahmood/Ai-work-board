import type { ApiError } from "@awb/shared/types.ts";

export class ApiFailure extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-AWB-Actor": "you",
  };

  const init: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(path, init);

  if (!res.ok) {
    let code = "UNKNOWN";
    let message = `Request failed with status ${res.status}`;
    try {
      const data = (await res.json()) as ApiError;
      if (data && data.error) {
        if (typeof data.error.code === "string") {
          code = data.error.code;
        }
        if (typeof data.error.message === "string") {
          message = data.error.message;
        }
      }
    } catch {
      // Body was not JSON or failed to parse
    }
    throw new ApiFailure(res.status, code, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
