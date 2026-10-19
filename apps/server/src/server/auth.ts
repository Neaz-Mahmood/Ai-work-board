import crypto from "node:crypto";
import type { Context } from "hono";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import type { Clock } from "./clock.ts";

export const SESSION_COOKIE_NAME = "awb_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  try {
    if (typeof pw !== "string" || typeof stored !== "string") {
      return false;
    }
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }
    const saltHex = parts[1];
    const hashHex = parts[2];
    if (
      !saltHex ||
      !hashHex ||
      !/^[0-9a-fA-F]+$/.test(saltHex) ||
      !/^[0-9a-fA-F]+$/.test(hashHex)
    ) {
      return false;
    }
    const salt = Buffer.from(saltHex, "hex");
    const storedHash = Buffer.from(hashHex, "hex");
    if (salt.length !== 16 || storedHash.length !== 64) {
      return false;
    }
    const derived = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(derived, storedHash);
  } catch {
    return false;
  }
}

export function tokenMatches(given: string, tokens: string[]): boolean {
  if (typeof given !== "string" || !Array.isArray(tokens)) {
    return false;
  }
  const givenHash = crypto.createHash("sha256").update(given).digest();
  let matched = false;
  for (const token of tokens) {
    if (typeof token !== "string") continue;
    const tokenHash = crypto.createHash("sha256").update(token).digest();
    if (crypto.timingSafeEqual(givenHash, tokenHash)) {
      matched = true;
    }
  }
  return matched;
}

export async function verifySessionCookie(
  c: Context,
  secret: string,
  clock: Clock
): Promise<boolean> {
  let cookieVal: string | false | undefined;
  try {
    cookieVal = await getSignedCookie(c, secret, SESSION_COOKIE_NAME);
  } catch {
    return false;
  }
  if (!cookieVal || typeof cookieVal !== "string") {
    return false;
  }
  if (!/^\d+$/.test(cookieVal)) {
    return false;
  }
  const issuedAt = Number(cookieVal);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }
  const now = clock.now().getTime();
  if (now - issuedAt > SESSION_MAX_AGE_MS || issuedAt > now + 60000) {
    return false;
  }
  return true;
}

export async function setSessionCookie(
  c: Context,
  secret: string,
  secure: boolean,
  clock: Clock
): Promise<void> {
  const issuedAt = clock.now().getTime().toString();
  await setSignedCookie(c, SESSION_COOKIE_NAME, issuedAt, secret, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}
