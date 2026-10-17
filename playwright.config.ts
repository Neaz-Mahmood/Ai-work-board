import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4799",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.ts",
    url: "http://127.0.0.1:4799/api/health",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
