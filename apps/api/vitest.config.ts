import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./src/test-env-setup.ts"],
    testTimeout: 10_000,
    // beforeAll hooks that bootstrap the capability registry parse 313
    // manifests and dynamic-import ~300 executors. Under full-suite
    // parallel load with FS contention this can exceed the default 10s,
    // so give bootstrap hooks more headroom while keeping individual
    // test timeouts tight.
    hookTimeout: 30_000,
  },
});
