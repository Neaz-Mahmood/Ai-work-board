import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: 0,
  use: {
    trace: "off",
  },
  projects: [
    {
      name: "local",
      testIgnore: "hosted/**",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4799",
      },
    },
    {
      name: "hosted",
      testMatch: "hosted/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4800",
      },
    },
  ],
  webServer: [
    {
      command: "node scripts/e2e-server.ts",
      url: "http://127.0.0.1:4799/api/health",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      command: "node scripts/e2e-hosted-server.ts",
      url: "http://localhost:4801/api/health",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      command: "pnpm --filter @awb/web exec vite preview --port 4800 --strictPort --outDir ../dist-hosted",
      url: "http://localhost:4800",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
  ],
});
