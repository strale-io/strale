import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * No email may link somewhere a reader cannot go.
 *
 * The health-digest footer linked `api.strale.io/v1/internal/trust/
 * capabilities/batch` from some point after the SQS engine was deleted
 * (DEC-20260503-B) until 2026-10-30. The route was gone, and because
 * `adminOnly` is mounted on the whole `/v1/internal/*` prefix, clicking it
 * answered **401** rather than 404 — the same mechanism that made `strale-mcp`
 * report `0 cap trust` for three and a half months (see `routes/public-trust.ts`).
 * Measured on 2026-10-30: the link returned 401, and the public projection that
 * replaced it returns 400 without a `slugs` parameter, so it is not clickable
 * either. The footer now carries only `strale.dev/trust`, which answered 200.
 *
 * A URL under `/v1/internal/` can never be opened from an email: the prefix is
 * admin-walled by design, and relaxing that wall is explicitly not the fix.
 * This asserts the class, not the one link — a future template that reaches for
 * an internal route fails here instead of shipping a 401 to a reader.
 */
const LIB = dirname(fileURLToPath(import.meta.url));

/** Every module that composes mail, including the daily-digest renderers. */
function emailSourceFiles(): string[] {
  const files = readdirSync(LIB)
    .filter((f) => /(email|digest|interrupt)/.test(f) && f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(LIB, f));
  const dailyDigest = join(LIB, "daily-digest");
  for (const f of readdirSync(dailyDigest)) {
    if (f.endsWith(".ts") && !f.endsWith(".test.ts")) files.push(join(dailyDigest, f));
  }
  return files;
}

describe("email templates", () => {
  it("covers the modules that compose mail", () => {
    const names = emailSourceFiles().map((f) => f.replace(`${LIB}/`, ""));
    // If this ever reads zero files the assertion below would pass vacuously.
    expect(names).toContain("email-templates.ts");
    expect(names).toContain("interrupt-sender.ts");
    expect(names).toContain("digest-formatter.ts");
    expect(names.length).toBeGreaterThan(5);
  });

  it("links to no admin-walled route, which answers 401 to a reader", () => {
    const offenders: string[] = [];
    for (const file of emailSourceFiles()) {
      const text = readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        // Only an href: a comment or a POST example in a curl snippet is not a
        // link a reader clicks. welcome-email.ts legitimately shows
        // `curl -X POST https://api.strale.io/v1/auth/recover/confirm`.
        if (/href="[^"]*\/v1\/internal\//.test(line)) {
          offenders.push(`${file.replace(`${LIB}/`, "")}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
