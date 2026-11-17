import { defineConfig } from "vitest/config";
import path from "path";

// Force test environment so tests remain hermetic during Vercel/CI production builds
process.env.NODE_ENV = "test";
delete process.env.VERCEL_ENV;

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts"],
    env: {
      NODE_ENV: "test",
    },
  },
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./"),
    },
  },
});

