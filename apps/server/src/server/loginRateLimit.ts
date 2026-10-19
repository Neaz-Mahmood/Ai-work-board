import type { Clock } from "./clock.ts";

export type LoginRateLimiterOptions = {
  clock: Clock;
  maxFailures?: number;
  windowMs?: number;
  maxKeys?: number;
};

export type CheckResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type LoginRateLimiter = {
  check(key: string): CheckResult;
  recordFailure(key: string): void;
  recordSuccess(key: string): void;
};

type Entry = {
  failures: number;
  windowStart: number;
};

export function createLoginRateLimiter(
  options: LoginRateLimiterOptions
): LoginRateLimiter {
  const {
    clock,
    maxFailures = 5,
    windowMs = 15 * 60_000,
    maxKeys = 10_000,
  } = options;

  const map = new Map<string, Entry>();

  function prune(now: number): void {
    for (const [k, entry] of map) {
      if (now >= entry.windowStart + windowMs) {
        map.delete(k);
      }
    }
    if (map.size > maxKeys) {
      const entries = Array.from(map.entries()).sort(
        (a, b) => a[1].windowStart - b[1].windowStart
      );
      const toDelete = map.size - maxKeys;
      for (let i = 0; i < toDelete; i++) {
        map.delete(entries[i][0]);
      }
    }
  }

  return {
    check(key: string): CheckResult {
      const now = clock.now().getTime();
      prune(now);
      const entry = map.get(key);
      if (entry && entry.failures >= maxFailures) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((entry.windowStart + windowMs - now) / 1000)
        );
        return { allowed: false, retryAfterSeconds };
      }
      return { allowed: true };
    },

    recordFailure(key: string): void {
      const now = clock.now().getTime();
      prune(now);
      const entry = map.get(key);
      if (!entry) {
        map.set(key, { failures: 1, windowStart: now });
      } else {
        entry.failures += 1;
      }
      if (map.size > maxKeys) {
        prune(now);
      }
    },

    recordSuccess(key: string): void {
      map.delete(key);
    },
  };
}
