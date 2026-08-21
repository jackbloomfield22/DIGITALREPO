import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Neutralize Next's server-only guard for unit tests
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The suite exercises a live Postgres database; run serially.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
