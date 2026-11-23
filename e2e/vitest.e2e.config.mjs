import { defineConfig } from "vitest/config";
import path from "node:path";

// Keep E2E execution hermetic regardless of caller environment
process.env.NODE_ENV = "test";
delete process.env.VERCEL_ENV;

const config = defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["e2e/**/*.e2e.mjs"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, ".."),
    },
  },
});

export default config;
