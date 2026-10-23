import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves 404.html for unknown paths, which lets deep links boot the SPA.
function spaFallback(): Plugin {
  return {
    name: "spa-fallback",
    writeBundle(options) {
      const dir = options.dir!;
      fs.copyFileSync(path.join(dir, "index.html"), path.join(dir, "404.html"));
    },
  };
}

// Outside the demo build the backend import is dead code, but its PGlite assets
// would still be emitted. Swap it for an empty module.
function stubDemoBackend(): Plugin {
  const id = "\0demo-backend-stub";
  return {
    name: "stub-demo-backend",
    enforce: "pre",
    resolveId(source) {
      return source.endsWith("/demo/backend.ts") ? id : null;
    },
    load(source) {
      return source === id ? "export {};" : null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    root: "src",
    plugins: demo ? [react(), spaFallback()] : [react(), stubDemoBackend()],
    // The demo runs the server's routes and PGlite in the browser.
    resolve: demo
      ? {
          alias: {
            // Resolved from here: the importing server files sit outside apps/web.
            "node:path": fileURLToPath(import.meta.resolve("pathe")),
            "node:async_hooks": path.resolve(import.meta.dirname, "src/demo/asyncLocalStorageShim.ts"),
          },
        }
      : undefined,
    optimizeDeps: demo ? { exclude: ["@electric-sql/pglite"] } : undefined,
    build: {
      outDir: demo ? "../dist-demo" : "../dist",
      emptyOutDir: true,
    },
    server: {
      proxy: {
        "/api": "http://127.0.0.1:4747",
        "/mcp": "http://127.0.0.1:4747",
      },
    },
  };
});
