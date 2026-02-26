import type { Context, Next } from "hono";

// ─── Date-based API versioning (DEC-20260226-P-s3t4) ────────────────────────
// Clients send `Strale-Version: 2026-02-26` header.
// If omitted, defaults to the latest version.

const VERSIONS = ["2026-02-25", "2026-02-26"] as const;
export type ApiVersion = (typeof VERSIONS)[number];

export const LATEST_VERSION: ApiVersion = "2026-02-26";

export function versionMiddleware() {
  return async (c: Context, next: Next) => {
    const header = c.req.header("Strale-Version");
    const version = header && VERSIONS.includes(header as ApiVersion)
      ? (header as ApiVersion)
      : LATEST_VERSION;

    c.set("apiVersion", version);
    c.header("Strale-Version", version);
    await next();
  };
}
