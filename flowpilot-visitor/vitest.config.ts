import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the `@flowpilot/core` alias in tsconfig.json and metro.config.js.
export default defineConfig({
  resolve: {
    alias: {
      "@flowpilot/core": path.resolve(__dirname, "../flowpilot-core/src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
