import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@worker": path.resolve(__dirname, "src/worker"),
    },
  },
});
