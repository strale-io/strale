// Kept in source rather than read from package.json at import time, so loading
// the package needs no filesystem (Edge, Workers, bundled Next.js routes).
// tests/tool-loop.test.ts fails if these drift from package.json.
export const PACKAGE_NAME = "strale-ai-sdk";
export const PACKAGE_VERSION = "0.1.0";
