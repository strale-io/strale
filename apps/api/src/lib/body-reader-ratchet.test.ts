/**
 * WP12 batch 3 (CR-12): a ratchet on the readers that are not yet bounded.
 *
 * `lib/resource-limits.ts` is the platform's one place that reads a response
 * body, decodes an image or collects a socket reply under a byte or pixel cap.
 * Batch 3 routed the readers whose upstream a caller chooses (a URL, a repo,
 * a package, a WHOIS server's reply) through it; roughly two hundred reads of
 * FIXED vendor APIs (`await res.json()` on an api.example.com endpoint with a
 * caller value in the path or query) remain. Converting them in one sweep
 * would also rewrite the many tests that hand those capabilities a bare
 * `{ ok, json() }` object instead of a Response, so they are counted instead:
 *
 *   - a file may not gain a raw `.json()` / `.text()` / `.arrayBuffer()` /
 *     `.blob()` / `.formData()` read of a fetched response, a `getReader()`
 *     or a `sharp(` that does not pass `limitInputPixels`;
 *   - a file that LOSES one must lower its number here, so the list only
 *     shrinks and the next batch starts from an exact inventory.
 *
 * A new reader goes through resource-limits.ts (`readJsonWithLimit`,
 * `readTextWithLimit`, `readBodyWithLimit`, `readTextTruncated`,
 * `createCappedTextSink`). The baseline is `body-reader-baseline.json`;
 * editing it upward needs a reviewer to agree the upstream is fixed and its
 * answer cannot be made large by a caller. When readers are removed the
 * failure message prints the current map to paste back.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "body-reader-baseline.json"), "utf8")) as {
  raw_response_reads: Record<string, number>;
  unlimited_sharp_calls: Record<string, number>;
  socket_data_listeners: Record<string, number>;
};

const SKIP_DIRS = new Set(["db", "test-helpers", "test-support", "node_modules"]);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) sources(full, out);
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !/testutil\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Code lines only: block and line comments are removed first. */
function code(file: string): string[] {
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return text.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/ .*$/, ""));
}

const RAW_READ = /\.(json|text|arrayBuffer|blob|formData)\(\)/;
// Inbound request bodies (Hono `c.req`, `req.clone()` on the incoming Request)
// are bounded at the rail by app.ts and are not fetched-response reads.
const INBOUND = /\bc\.req\.|\bc\.json\(|\bctx\.json\(|context\.json\(|\breq\.(clone\(\)\.)?(json|text)\(\)|\.req\.(json|text)\(\)/;

function count(pattern: (line: string, file: { text: string; lines: string[]; i: number }) => boolean): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of sources(SRC)) {
    const lines = code(file);
    const text = lines.join("\n");
    let n = 0;
    lines.forEach((line, i) => {
      if (pattern(line, { text, lines, i })) n++;
    });
    if (n > 0) found[relative(SRC, file).split(sep).join("/")] = n;
  }
  return found;
}

function compare(kind: string, found: Record<string, number>, baseline: Record<string, number>, how: string, key: string) {
  const grew: string[] = [];
  const shrank: string[] = [];
  for (const f of new Set([...Object.keys(found), ...Object.keys(baseline)])) {
    const now = found[f] ?? 0;
    const was = baseline[f] ?? 0;
    if (now > was) grew.push(`${f}: ${was} -> ${now}`);
    if (now < was) shrank.push(`${f}: ${was} -> ${now}`);
  }
  expect(grew, `${kind} added. ${how}`).toEqual([]);
  expect(
    shrank,
    `${kind} removed: lower the number in lib/body-reader-baseline.json so the ratchet holds. ` +
      `Current "${key}" map: ${JSON.stringify(Object.fromEntries(Object.entries(found).sort(([x], [y]) => x.localeCompare(y))))}`,
  ).toEqual([]);
}

function check(key: keyof typeof BASELINE, kind: string, found: Record<string, number>, how: string) {
  compare(kind, found, BASELINE[key], how, key);
}

describe("unbounded readers only ever go down (resource-limits.ts is the body reader)", () => {
  it("raw .json() / .text() / .arrayBuffer() reads of a fetched response", () => {
    const found = count((line) => RAW_READ.test(line) && !INBOUND.test(line) && /await|\.then\(/.test(line));
    // resource-limits.ts is the one file allowed (and expected) to hold the
    // single bodyless-response fallback; it is not in the baseline, so it is
    // excluded here rather than counted.
    delete found["lib/resource-limits.ts"];
    check(
      "raw_response_reads",
      "raw response reads",
      found,
      "Read it with readJsonWithLimit / readTextWithLimit / readBodyWithLimit from lib/resource-limits.ts.",
    );
  });

  it("response streams are only consumed inside resource-limits.ts", () => {
    const found = count((line) => /\.getReader\(\)/.test(line));
    delete found["lib/resource-limits.ts"];
    expect(found, "use consumeBody's callers in lib/resource-limits.ts instead of reading a stream by hand").toEqual(
      {},
    );
  });

  it("every sharp( decode carries limitInputPixels, except on the platform's own output", () => {
    const found = count((line, { lines, i }) => {
      if (!/\bsharp\(/.test(line) || /^\s*import\b/.test(line)) return false;
      const stmt = lines.slice(i, i + 3).join(" ");
      return !/limitInputPixels/.test(stmt);
    });
    check(
      "unlimited_sharp_calls",
      "sharp decodes without limitInputPixels",
      found,
      "Pass { limitInputPixels: MAX_INPUT_PIXELS } and check the header with assertInputPixelsWithinLimit.",
    );
  });

  it("raw socket reads", () => {
    // A file that collects through createCappedTextSink is bounded by it.
    const found = count(
      (line, { text }) => /\.on\(\s*["']data["']/.test(line) && !text.includes("createCappedTextSink"),
    );
    check(
      "socket_data_listeners",
      "socket data listeners",
      found,
      "Collect through createCappedTextSink from lib/resource-limits.ts.",
    );
  });
});
