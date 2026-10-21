import { describe, expect, test } from "vitest";
import { resolveServerConfig, ConfigError } from "../src/server/config.ts";
import { startCommand } from "../src/cli/commands/start.ts";
import type { CliIo } from "../src/cli/client.ts";

describe("resolveServerConfig", () => {
  test("local defaults", () => {
    const config = resolveServerConfig({});
    expect(config.mode).toBe("local");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4747);
    expect(config.dataDir.endsWith(".ai-work-board")).toBe(true);
    expect(config.databaseUrl).toBeUndefined();
    expect(config.allowedOrigins).toEqual([]);
    expect(config.auth).toBeUndefined();
    expect(config.trustProxy).toBe(false);
  });

  test("flags beat env", () => {
    const config = resolveServerConfig(
      {
        AWB_HOST: "localhost",
        AWB_PORT: "5000",
        AWB_HOME: "/env/path",
      },
      {
        host: "127.0.0.1",
        port: "6000",
        dataDir: "/flags/path",
      }
    );
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(6000);
    expect(config.dataDir).toBe("/flags/path");
  });

  test("flags beat env to keep mode local", () => {
    const config = resolveServerConfig(
      { AWB_HOST: "0.0.0.0" },
      { host: "127.0.0.1" }
    );
    expect(config.mode).toBe("local");
    expect(config.host).toBe("127.0.0.1");
  });

  test("AWB_HOST=0.0.0.0 -> hosted", () => {
    const config = resolveServerConfig({
      AWB_HOST: "0.0.0.0",
      AWB_OWNER_PASSWORD_HASH: "hash",
      AWB_SESSION_SECRET: "secret",
      AWB_API_TOKENS: "tok",
    });
    expect(config.mode).toBe("hosted");
    expect(config.host).toBe("0.0.0.0");
    expect(config.auth?.secureCookies).toBe(true);
  });

  test("DATABASE_URL alone does NOT flip loopback into hosted mode", () => {
    const config = resolveServerConfig({
      AWB_HOST: "127.0.0.1",
      DATABASE_URL: "postgres://localhost:5432/db",
    });
    expect(config.mode).toBe("local");
    expect(config.host).toBe("127.0.0.1");
    expect(config.databaseUrl).toBe("postgres://localhost:5432/db");
    expect(config.auth).toBeUndefined();
  });

  test("AWB_MODE=hosted opts into hosted mode on loopback", () => {
    const config = resolveServerConfig({
      AWB_HOST: "127.0.0.1",
      AWB_MODE: "hosted",
      DATABASE_URL: "postgres://localhost:5432/db",
      AWB_OWNER_PASSWORD_HASH: "hash",
      AWB_SESSION_SECRET: "secret",
      AWB_API_TOKENS: "tok",
    });
    expect(config.mode).toBe("hosted");
    expect(config.host).toBe("127.0.0.1");
    expect(config.databaseUrl).toBe("postgres://localhost:5432/db");
    // Loopback stays non-secure cookies even in hosted mode.
    expect(config.auth?.secureCookies).toBe(false);
  });

  test("AWB_MODE=local forces local mode even on non-loopback", () => {
    const config = resolveServerConfig({
      AWB_HOST: "0.0.0.0",
      AWB_MODE: "local",
      AWB_OWNER_PASSWORD_HASH: "hash",
      AWB_SESSION_SECRET: "secret",
      AWB_API_TOKENS: "tok",
    });
    expect(config.mode).toBe("local");
    expect(config.auth).toBeUndefined();
  });

  test("flags.mode beats AWB_MODE env", () => {
    const config = resolveServerConfig(
      {
        AWB_MODE: "local",
        AWB_OWNER_PASSWORD_HASH: "hash",
        AWB_SESSION_SECRET: "secret",
        AWB_API_TOKENS: "tok",
      },
      { mode: "hosted" }
    );
    expect(config.mode).toBe("hosted");
    expect(config.auth).toBeDefined();
  });

  test("an invalid AWB_MODE throws ConfigError", () => {
    expect(() => resolveServerConfig({ AWB_MODE: "prod" })).toThrowError(
      new ConfigError(`Invalid mode: prod (expected "local" or "hosted")`)
    );
  });

  test("AWB_MODE=hosted on loopback with no auth vars still errors", () => {
    expect(() =>
      resolveServerConfig({ AWB_HOST: "127.0.0.1", AWB_MODE: "hosted" })
    ).toThrow(
      "Hosted mode requires: AWB_OWNER_PASSWORD_HASH, AWB_SESSION_SECRET, AWB_API_TOKENS"
    );
  });

  test("hosted with nothing set -> the error lists all three variables", () => {
    expect(() => resolveServerConfig({ AWB_HOST: "0.0.0.0" })).toThrowError(
      new ConfigError(
        "Hosted mode requires: AWB_OWNER_PASSWORD_HASH, AWB_SESSION_SECRET, AWB_API_TOKENS"
      )
    );

    try {
      resolveServerConfig({ AWB_HOST: "0.0.0.0" });
      expect.unreachable();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).name).toBe("ConfigError");
      expect((err as ConfigError).message).toBe(
        "Hosted mode requires: AWB_OWNER_PASSWORD_HASH, AWB_SESSION_SECRET, AWB_API_TOKENS"
      );
    }
  });

  test("hosted with partial vars missing lists only the missing ones in order", () => {
    expect(() =>
      resolveServerConfig({
        AWB_HOST: "0.0.0.0",
        AWB_SESSION_SECRET: "sec",
      })
    ).toThrow(
      "Hosted mode requires: AWB_OWNER_PASSWORD_HASH, AWB_API_TOKENS"
    );

    expect(() =>
      resolveServerConfig({
        AWB_HOST: "0.0.0.0",
        AWB_OWNER_PASSWORD_HASH: "hash",
        AWB_SESSION_SECRET: "sec",
        AWB_API_TOKENS: "   ,   ",
      })
    ).toThrow("Hosted mode requires: AWB_API_TOKENS");
  });

  test("hosted with all set -> auth filled and secureCookies true", () => {
    const config = resolveServerConfig({
      AWB_HOST: "0.0.0.0",
      AWB_OWNER_PASSWORD_HASH: "hash123",
      AWB_SESSION_SECRET: "secret456",
      AWB_API_TOKENS: "tok1, tok2 , tok3",
    });
    expect(config.mode).toBe("hosted");
    expect(config.auth).toEqual({
      ownerPasswordHash: "hash123",
      sessionSecret: "secret456",
      apiTokens: ["tok1", "tok2", "tok3"],
      secureCookies: true,
    });
  });

  test("origins parsing", () => {
    const config = resolveServerConfig({
      AWB_ALLOWED_ORIGINS: " http://localhost:3000, , https://example.com , ",
    });
    expect(config.allowedOrigins).toEqual([
      "http://localhost:3000",
      "https://example.com",
    ]);

    const configEmpty = resolveServerConfig({
      AWB_ALLOWED_ORIGINS: "   ,   ",
    });
    expect(configEmpty.allowedOrigins).toEqual([]);
  });

  test("a bad port", () => {
    const badPorts = ["abc", "0", "70000", "3.5", "-1"];
    for (const bad of badPorts) {
      expect(() => resolveServerConfig({}, { port: bad })).toThrowError(
        new ConfigError(`Invalid port: ${bad}`)
      );
      expect(() => resolveServerConfig({ AWB_PORT: bad })).toThrowError(
        new ConfigError(`Invalid port: ${bad}`)
      );
    }
  });

  test("local mode auth is undefined even if variables are set", () => {
    const config = resolveServerConfig({
      AWB_OWNER_PASSWORD_HASH: "hash",
      AWB_SESSION_SECRET: "secret",
      AWB_API_TOKENS: "tok1",
    });
    expect(config.mode).toBe("local");
    expect(config.auth).toBeUndefined();
  });

  test("startCommand writes ConfigError to stderr and returns 2", async () => {
    let stderr = "";
    let stdout = "";
    const io: CliIo = {
      env: { AWB_HOST: "0.0.0.0" },
      cwd: process.cwd(),
      stdout: (s) => {
        stdout += s;
      },
      stderr: (s) => {
        stderr += s;
      },
    };
    const code = await startCommand(io, {});
    expect(code).toBe(2);
    expect(stderr).toBe(
      "Hosted mode requires: AWB_OWNER_PASSWORD_HASH, AWB_SESSION_SECRET, AWB_API_TOKENS\n"
    );
  });

  describe("AWB_TRUST_PROXY", () => {
    test("unset or empty -> false", () => {
      expect(resolveServerConfig({}).trustProxy).toBe(false);
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "" }).trustProxy).toBe(false);
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "   " }).trustProxy).toBe(false);
    });

    test("1, true, yes (case-insensitive, trimmed) -> true", () => {
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "1" }).trustProxy).toBe(true);
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "true" }).trustProxy).toBe(true);
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "TRUE" }).trustProxy).toBe(true);
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "  True  " }).trustProxy).toBe(true);
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "yes" }).trustProxy).toBe(true);
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "YES" }).trustProxy).toBe(true);
      expect(resolveServerConfig({ AWB_TRUST_PROXY: "  yes  " }).trustProxy).toBe(true);
    });

    test("any other value throws ConfigError", () => {
      expect(() => resolveServerConfig({ AWB_TRUST_PROXY: "maybe" })).toThrowError(
        new ConfigError("Invalid AWB_TRUST_PROXY: maybe")
      );
      expect(() => resolveServerConfig({ AWB_TRUST_PROXY: "false" })).toThrowError(
        new ConfigError("Invalid AWB_TRUST_PROXY: false")
      );
      expect(() => resolveServerConfig({ AWB_TRUST_PROXY: "0" })).toThrowError(
        new ConfigError("Invalid AWB_TRUST_PROXY: 0")
      );
      expect(() => resolveServerConfig({ AWB_TRUST_PROXY: "no" })).toThrowError(
        new ConfigError("Invalid AWB_TRUST_PROXY: no")
      );
    });
  });
});
