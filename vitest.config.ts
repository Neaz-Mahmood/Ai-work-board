import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/server/test/**/*.test.ts", "apps/web/src/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
  },
});
