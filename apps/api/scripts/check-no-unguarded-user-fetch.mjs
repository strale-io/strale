// Money-integrity CI lint (2026-08-12): a capability that reads a
// CALLER-SUPPLIED URL must not fetch it with raw `fetch()`. Raw fetch has no
// SSRF re-validation and — the incident class that produced this guard — no
// per-source ToS gate: three executors shipped as blocklist side doors, and
// the legal audit found seven more (url-to-text was the live substitute for
// the gated url-to-markdown).
//
// Rule: if a file under src/capabilities/ (excluding lib/) reads any of the
// caller-URL input fields AND contains a raw `fetch(` call, it must either
// import safeFetch or call assertTargetAllowed. Fixed-endpoint vendor fetches
// (registries, GitHub, CoinGecko…) don't read caller URLs and are untouched.
//
// Exit codes: 0 clean, 1 offender(s).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const CAPS_DIR = resolve(import.meta.dirname, "../src/capabilities");
const URL_INPUT_RE = /input\.(url|link|image_url|website|page_url|target_url)\b/;
const RAW_FETCH_RE = /(?:await\s+|=\s*)fetch\(/;

const offenders = [];
for (const entry of readdirSync(CAPS_DIR)) {
  const full = join(CAPS_DIR, entry);
  if (statSync(full).isDirectory()) continue; // lib/ + providers handled at their call sites
  if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
  const content = readFileSync(full, "utf8");
  if (!URL_INPUT_RE.test(content)) continue;
  if (!RAW_FETCH_RE.test(content)) continue;
  const guarded = content.includes("safeFetch") || content.includes("assertTargetAllowed");
  if (!guarded) offenders.push(entry);
}

if (offenders.length === 0) {
  console.log("[lint] user-URL fetch guard: all caller-URL capabilities use safeFetch or the ToS gate.");
  process.exit(0);
}
console.error("[lint] Capabilities reading caller-supplied URLs with raw fetch() and no guard:");
for (const f of offenders) console.error(`  - ${f}`);
console.error("[lint] Use safeFetch (SSRF + ToS gate) for direct fetches, or call");
console.error("[lint] assertTargetAllowed(url) before forwarding the URL to Browserless.");
process.exit(1);
