#!/usr/bin/env node
import { main } from "../src/cli/main.ts";

const code = await main(process.argv.slice(2), {
  env: process.env,
  cwd: process.cwd(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
});

process.exitCode = code;
