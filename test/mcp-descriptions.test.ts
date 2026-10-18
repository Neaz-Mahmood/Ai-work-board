import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { makeTestApp, runCli, startTestServer, type TestApp, type TestServer } from "./helpers.ts";
import { connectMcp } from "./mcp-helpers.ts";

const EXPECTED_TOOLS = [
  "list_projects",
  "create_project",
  "get_board",
  "list_tickets",
  "get_ticket",
  "create_ticket",
  "update_ticket",
  "move_ticket",
  "claim_next_ticket",
  "add_comment",
  "add_blocker",
  "remove_blocker",
  "set_needs_attention",
  "clear_needs_attention",
  "list_features",
  "get_feature",
  "create_feature",
  "update_feature",
] as const;

const EXPECTED_CLI_COMMANDS = [
  "awb start",
  "awb init",
  "awb projects",
  "awb board",
  "awb claim",
  "awb ticket list",
  "awb ticket show",
  "awb ticket create",
  "awb ticket update",
  "awb ticket move",
  "awb ticket comment",
  "awb ticket block",
  "awb ticket unblock",
  "awb ticket attention",
  "awb feature list",
  "awb feature show",
  "awb feature create",
  "awb feature update",
] as const;

describe("MCP tool descriptions and documentation consistency", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await makeTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  test("every listed tool exists, has a description of at least 40 characters, and every input property has a description", async () => {
    const client = await connectMcp(testApp.app);
    try {
      const { tools } = await client.listTools();
      const toolMap = new Map(tools.map((t) => [t.name, t]));

      for (const expectedName of EXPECTED_TOOLS) {
        const tool = toolMap.get(expectedName);
        expect(tool, `Tool ${expectedName} should be registered`).toBeDefined();
        if (!tool) continue;

        // Tool description must be at least 40 characters
        expect(
          typeof tool.description,
          `Tool ${expectedName} must have a description`
        ).toBe("string");
        expect(
          tool.description!.length,
          `Tool ${expectedName} description must be at least 40 characters, got: "${tool.description}"`
        ).toBeGreaterThanOrEqual(40);

        // Every input property must have a description
        const schema = tool.inputSchema as {
          type?: string;
          properties?: Record<string, { description?: string; type?: string; items?: { properties?: Record<string, { description?: string }> } }>;
        };

        if (schema && schema.properties) {
          for (const [propName, propDef] of Object.entries(schema.properties)) {
            expect(
              propDef.description,
              `Property "${propName}" on tool "${expectedName}" must have a description`
            ).toBeDefined();
            expect(
              typeof propDef.description,
              `Property "${propName}" description on tool "${expectedName}" must be a string`
            ).toBe("string");
            expect(
              propDef.description!.trim().length,
              `Property "${propName}" description on tool "${expectedName}" must not be empty`
            ).toBeGreaterThan(0);

            // If the property is an array of objects, verify item properties
            if (propDef.items && propDef.items.properties) {
              for (const [itemPropName, itemPropDef] of Object.entries(propDef.items.properties)) {
                expect(
                  itemPropDef.description,
                  `Nested property "${propName}.${itemPropName}" on tool "${expectedName}" must have a description`
                ).toBeDefined();
                expect(
                  itemPropDef.description!.trim().length,
                  `Nested property "${propName}.${itemPropName}" description on tool "${expectedName}" must not be empty`
                ).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    } finally {
      await client.close();
    }
  });

  test("README.md mentions every tool name and every CLI command", () => {
    const readmePath = path.resolve(__dirname, "../README.md");
    expect(fs.existsSync(readmePath), "README.md must exist at repo root").toBe(true);

    const readmeContent = fs.readFileSync(readmePath, "utf-8");

    // Check every tool name
    for (const toolName of EXPECTED_TOOLS) {
      expect(
        readmeContent.includes(toolName),
        `README.md must mention tool name "${toolName}"`
      ).toBe(true);
    }

    // Check every CLI command
    for (const cliCmd of EXPECTED_CLI_COMMANDS) {
      expect(
        readmeContent.includes(cliCmd),
        `README.md must mention CLI command "${cliCmd}"`
      ).toBe(true);
    }
  });

  test("awb --help and awb <command> --help print usage consistent with README", async () => {
    const cliOpts = { url: "http://127.0.0.1:4747", cwd: process.cwd() };

    // 1. awb --help
    const helpRes = await runCli(["--help"], cliOpts);
    expect(helpRes.code).toBe(0);
    expect(helpRes.stdout).toContain("Usage: awb <command> [options]");
    for (const cmd of EXPECTED_CLI_COMMANDS) {
      const stripped = cmd.replace(/^awb\s+/, "");
      expect(helpRes.stdout).toContain(stripped);
    }

    // 2. awb start --help
    const startHelp = await runCli(["start", "--help"], cliOpts);
    expect(startHelp.code).toBe(0);
    expect(startHelp.stdout).toContain("Usage: awb start");
    expect(startHelp.stdout).toContain("--port");
    expect(startHelp.stdout).toContain("--data-dir");
    expect(startHelp.stdout).toContain("--open");

    // 3. awb init --help
    const initHelp = await runCli(["init", "--help"], cliOpts);
    expect(initHelp.code).toBe(0);
    expect(initHelp.stdout).toContain("Usage: awb init");
    expect(initHelp.stdout).toContain("--key");

    // 4. awb ticket create --help
    const ticketCreateHelp = await runCli(["ticket", "create", "--help"], cliOpts);
    expect(ticketCreateHelp.code).toBe(0);
    expect(ticketCreateHelp.stdout).toContain("Usage: awb ticket create");
    expect(ticketCreateHelp.stdout).toContain("--blocked-by");

    // 5. awb claim --help
    const claimHelp = await runCli(["claim", "--help"], cliOpts);
    expect(claimHelp.code).toBe(0);
    expect(claimHelp.stdout).toContain("Usage: awb claim");
    expect(claimHelp.stdout).toContain("--feature");

    // 6. awb feature create --help
    const featureCreateHelp = await runCli(["feature", "create", "--help"], cliOpts);
    expect(featureCreateHelp.code).toBe(0);
    expect(featureCreateHelp.stdout).toContain("Usage: awb feature create");
    expect(featureCreateHelp.stdout).toContain("--tickets-file");
  });
});
