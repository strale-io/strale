#!/usr/bin/env node
/**
 * Does the live robots.txt of a Strale-chosen source still allow the page the
 * capability fetches?
 *
 * Why this exists: on 2026-10-28 the robots.txt rollout (#786) silently
 * disabled two paid capabilities — `eu-trademark-search` (EUIPO `/eSearch/`)
 * and `price-compare` (pricerunner `/search`). Neither was detected by a test.
 * It could not be: paid capabilities are not proactively tested
 * (DEC-20260503-B wires scheduled testing to `external_cost_cents = 0`), so
 * for the whole paid catalogue there is no check that could have failed. Both
 * were found two days later by a human reading revenue data.
 *
 * The blind spot is structural, so the guard has to be static. A capability's
 * fetch target is a literal in its executor; robots.txt is one HTTP GET per
 * origin. Nothing here needs a wallet, a vendor call or the production
 * database, which is exactly why it can cover the tools the harness cannot
 * call.
 *
 * Scope — only what is statically knowable:
 *
 *   - `data_source_type: scrape` manifests. An `api` source is governed by its
 *     contract, not by robots.txt.
 *   - URLs whose HOST is a literal. A placeholder in the host means the
 *     customer names the page: a caller-directed fetch (DEC-20261023-A), whose
 *     target cannot be known before the call, and whose block is a refusal
 *     rather than a fault.
 *
 * What a finding means, and what it does not: `disallowed` says the capability
 * cannot reach that page any more. Whether that kills the capability depends on
 * whether the URL is its only path — `container-track` loses one carrier of
 * thirteen, `trustpilot-score` loses everything. The script reports the fact
 * and names the file; a human reads the control flow. It deliberately does not
 * guess.
 *
 * `robots_unavailable` is 5xx or a transport failure, which RFC 9309 §2.3.1
 * makes a complete disallow — so production refuses the fetch too. It is also
 * the transient case (hmm21.com answered 503 during the 2026-10-30 sweep), so
 * it is reported separately and never fails `--strict`.
 *
 * Verdicts come from production's own parser and matcher, so this cannot drift
 * from what `assertRobotsAllowed` decides on the fetch path:
 * `parseRobotsTxt` → `rulesFor(STRALE_ROBOTS_TOKEN)` → `isPathAllowed`.
 *
 * Two modes:
 *   default  — print findings + exit 0 (informational)
 *   --strict — exit 1 on any disallowed Strale-chosen source
 *
 * Not a blocking CI gate: it makes live network calls, and a source's robots.txt
 * is not ours to keep green. It belongs in the weekly drift sweep, and in the
 * rollout checklist for any change to the fetch path's access policy.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseRobotsTxt,
  rulesFor,
  isPathAllowed,
  type RobotsRule,
} from "../src/lib/robots-txt.js";
import { STRALE_ROBOTS_TOKEN, STRALE_USER_AGENT } from "../src/lib/site-access.js";
import { sourceCandidates, type SourceCandidate } from "../src/lib/source-robots-candidates.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const MANIFESTS = join(REPO, "manifests");
const EXECUTORS = join(REPO, "apps", "api", "src", "capabilities");

const ROBOTS_TIMEOUT_MS = 20_000;

export type Verdict = "allowed" | "disallowed" | "robots_unavailable";

type OriginVerdict =
  | { kind: "rules"; rules: RobotsRule[] }
  | { kind: "allow_all"; status: number }
  | { kind: "unavailable"; status: number };

const origins = new Map<string, Promise<OriginVerdict>>();

/** Mirrors assertRobotsAllowed's access-result rules (RFC 9309 §2.3.1). */
async function verdictForOrigin(origin: string): Promise<OriginVerdict> {
  const hit = origins.get(origin);
  if (hit) return hit;
  const pending = (async (): Promise<OriginVerdict> => {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": STRALE_USER_AGENT, Accept: "text/plain,*/*;q=0.5" },
        signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
        redirect: "follow",
      });
      if (res.ok) {
        return { kind: "rules", rules: rulesFor(parseRobotsTxt(await res.text()), STRALE_ROBOTS_TOKEN) };
      }
      if (res.status >= 400 && res.status < 500) return { kind: "allow_all", status: res.status };
      return { kind: "unavailable", status: res.status };
    } catch {
      return { kind: "unavailable", status: 0 };
    }
  })();
  origins.set(origin, pending);
  return pending;
}

export interface Finding {
  slug: string;
  priceCents: string;
  isFreeTier: string;
  url: string;
  verdict: Verdict;
  detail: string;
}

/**
 * Which of these slugs a customer can actually buy right now.
 *
 * Triage turns on this and nothing else: of the seven capabilities the first
 * sweep flagged on 2026-10-30, four were already unlisted, so only three could
 * cost anyone anything. The public catalogue answers it over plain HTTPS with
 * no credential and no database, which is the whole reason this script can run
 * anywhere. If it cannot be reached, every finding is reported without the
 * annotation rather than silently assumed harmless.
 */
async function listedSlugs(): Promise<Set<string> | null> {
  try {
    const res = await fetch("https://api.strale.io/v1/capabilities?limit=1000", {
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { capabilities?: Array<{ slug: string }> };
    if (!Array.isArray(body.capabilities)) return null;
    return new Set(body.capabilities.map((c) => c.slug));
  } catch {
    return null;
  }
}

function manifestField(yaml: string, name: string): string | null {
  const m = yaml.match(new RegExp(`^${name}:\\s*"?([^"\\n]+)"?\\s*$`, "m"));
  return m ? m[1].trim() : null;
}

async function main() {
  const strict = process.argv.includes("--strict");

  const scrapeManifests: Array<{ file: string; yaml: string }> = [];
  for (const file of readdirSync(MANIFESTS).filter((f) => f.endsWith(".yaml"))) {
    const yaml = readFileSync(join(MANIFESTS, file), "utf8");
    if (manifestField(yaml, "data_source_type") === "scrape") scrapeManifests.push({ file, yaml });
  }

  const findings: Finding[] = [];
  let noExecutor = 0;
  let notCheckable = 0;

  for (const { file, yaml } of scrapeManifests) {
    const slug = manifestField(yaml, "slug") ?? file.replace(/\.yaml$/, "");
    const priceCents = manifestField(yaml, "price_cents") ?? "?";
    const isFreeTier = manifestField(yaml, "is_free_tier") ?? "?";

    const candidates = new Map<string, SourceCandidate>();
    for (const c of sourceCandidates(yaml)) candidates.set(c.url, c);
    let executor: string | null = null;
    try {
      executor = readFileSync(join(EXECUTORS, `${slug}.ts`), "utf8");
    } catch {
      noExecutor++;
    }
    if (executor) for (const c of sourceCandidates(executor)) candidates.set(c.url, c);

    if (candidates.size === 0) {
      notCheckable++;
      continue;
    }

    for (const c of candidates.values()) {
      const v = await verdictForOrigin(new URL(c.url).origin);
      if (v.kind === "allow_all") continue;
      if (v.kind === "unavailable") {
        findings.push({
          slug, priceCents, isFreeTier, url: c.url,
          verdict: "robots_unavailable",
          detail: `robots.txt HTTP ${v.status} — RFC 9309 makes this a complete disallow`,
        });
        continue;
      }
      if (!isPathAllowed(v.rules, c.pathAndQuery)) {
        findings.push({
          slug, priceCents, isFreeTier, url: c.url,
          verdict: "disallowed", detail: c.pathAndQuery,
        });
      }
    }
  }

  const disallowed = findings.filter((f) => f.verdict === "disallowed");
  const unavailable = findings.filter((f) => f.verdict === "robots_unavailable");

  console.log(
    `Checked ${scrapeManifests.length} scrape-backed manifests ` +
      `(${notCheckable} with no Strale-chosen literal URL, ${noExecutor} with no single-file executor).\n`,
  );

  const listed = await listedSlugs();
  const status = (slug: string) =>
    listed === null ? "catalogue unreachable" : listed.has(slug) ? "LISTED — sellable now" : "not listed";

  if (disallowed.length === 0) {
    console.log("No Strale-chosen source is robots-disallowed.");
  } else {
    const sellable = listed === null ? disallowed : disallowed.filter((f) => listed.has(f.slug));
    console.log(
      `DISALLOWED — ${disallowed.length} URL(s) across ${new Set(disallowed.map((f) => f.slug)).size} capability(ies); ` +
        `${new Set(sellable.map((f) => f.slug)).size} of them listed in the public catalogue.\n`,
    );
    for (const f of disallowed) {
      console.log(`  ${f.slug.padEnd(26)} price=${f.priceCents.padEnd(4)} free=${f.isFreeTier.padEnd(6)} [${status(f.slug)}]`);
      console.log(`  ${" ".repeat(26)} ${f.url}`);
      console.log(`  ${" ".repeat(26)} robots.txt disallows ${f.detail} — read apps/api/src/capabilities/${f.slug}.ts to see whether this is its only path`);
    }
  }

  if (unavailable.length > 0) {
    console.log(`\nROBOTS UNAVAILABLE — ${unavailable.length} URL(s); may be transient, never fails --strict:`);
    for (const f of unavailable) {
      console.log(`  ${f.slug.padEnd(26)} ${f.url}  [${f.detail}]`);
    }
  }

  if (strict && disallowed.length > 0) process.exit(1);
}

// Importable for tests without running the sweep.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
