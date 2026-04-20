import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test-env-setup.ts"],
    testTimeout: 10_000,
  },
});
