/**
 * ONE structural guard against unbounded response-body materialization,
 * rooted at `apps/api/src` (#432).
 *
 * ## What it replaces
 *
 * Two guards with different coverage and different verdicts:
 *
 *   - #426's swept `await \w+.arrayBuffer(` across `src/capabilities` only,
 *     with zero tolerance.
 *   - #428's swept `text|arrayBuffer|json` across a fetch-heuristic subset of
 *     `src/capabilities`, against a 20-file ledger.
 *
 * Neither was the union, so `src/lib/**` was invisible to both — which is why
 * `metered-vendor-fetch`'s unbounded `response.clone().text()` had to be found
 * by hand during #428's review.
 *
 * ## Why AST rather than regex
 *
 * #428's regex required a bare identifier receiver and a literal `await` on
 * the same line. Three shapes walked past it, and one of them was real:
 * `estonian-company-data.ts` did `return resp.json()` with no `await` at all,
 * and sat unbounded and unledgered while the guard reported the ledger exact.
 * `await response.clone().text()` and Prettier-wrapped `await resp\n  .text()`
 * were the other two.
 *
 * The TypeScript compiler is already a dependency, so parsing is cheap and the
 * receiver shape stops mattering. What this does NOT do — and must not be
 * described as doing — is prove the receiver is a `Response`. There is no type
 * resolution here: `someLibraryObject.json()` looks identical to
 * `httpResponse.json()`. It is a syntactic sweep with a good filter, which is
 * why the classes below carry ledgers instead of a single verdict.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const SRC = resolve(__dirname, "..");

/** Body accessors that fully materialize a response before returning. */
const MATERIALIZING = new Set(["text", "arrayBuffer", "json", "blob", "formData", "bytes"]);

interface Site {
  line: number;
  method: string;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const rel = (file: string) => relative(SRC, file).split(sep).join("/");

/**
 * Every zero-argument `.text()` / `.json()` / `.arrayBuffer()` / … call in the
 * file, whatever the receiver expression looks like and whether or not it is
 * awaited on the spot.
 */
function sitesIn(file: string, source: string): Site[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      MATERIALIZING.has(node.expression.name.text) &&
      node.arguments.length === 0
    ) {
      sites.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        method: node.expression.name.text,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

interface Scanned {
  path: string;
  source: string;
  sites: Site[];
}

const SCANNED: Scanned[] = walk(SRC).map((file) => {
  const source = readFileSync(file, "utf-8");
  return { path: rel(file), source, sites: sitesIn(file, source) };
});

/**
 * A file fetches remote content on a caller's behalf if it reaches the network
 * through `safeFetch` (the SSRF-validating path a caller URL must take), POSTs
 * Browserless `/content` to render a page, hits Jina's reader, or calls
 * `assertTargetAllowed`.
 *
 * That last term is #432 round 1, and it found a real one. A capability may
 * hand a caller's URL to a FIXED vendor host — Google PageSpeed, Safe
 * Browsing, Browserless — and then the fetch is `fetch("https://www.google
 * apis.com/…")` with no safeFetch anywhere, because the host is ours and the
 * caller's URL travels as a query parameter. The response is still
 * caller-shaped. `assertTargetAllowed` is this codebase's own marker for
 * exactly that situation (the `unguarded-fetch-ok:` annotations on those
 * fetches say "caller URL gated by assertTargetAllowed above" in so many
 * words), so adopting it as a filter term is reading a convention that already
 * exists rather than inventing one. Without it, `page-speed-test`'s unbounded
 * read of a full Lighthouse report sat outside every class.
 *
 * The completeness of this filter is INHERITED, not independent: it holds
 * because a raw `fetch()` of a caller-supplied URL is already a failure of the
 * SSRF guard (`ssrf-bucket-a/b/c.test.ts` plus the `unguarded-fetch-ok:`
 * annotation convention). If that guard ever stops holding, this one narrows
 * silently — so the two are load-bearing together.
 */
const fetchesForCaller = (source: string) =>
  /safeFetch\s*\(/.test(source) ||
  /"\/content"/.test(source) ||
  /r\.jina\.ai/.test(source) ||
  /assertTargetAllowed\s*\(/.test(source);

const tally = (files: Scanned[]): Record<string, number> =>
  Object.fromEntries(files.filter((f) => f.sites.length > 0).map((f) => [f.path, f.sites.length]));

// ─── Class A: caller-influenced remote reads ─────────────────────────────────

describe("class A — a caller's URL is never read unbounded", () => {
  /**
   * ONE entry, and it is the honest one. #412, #426, #428 and #432 between
   * them routed every other caller-shaped read through the readers in
   * `lib/resource-limits.ts`.
   *
   * An entry may be added only with a written reason for why a caller-shaped
   * body may be materialized without a ceiling. "It is probably small" is not
   * one — every capability in the 20-file ledger this replaces was probably
   * small too. The reason below is the opposite claim: the body is probably
   * LARGE, and the cap cannot be sized without evidence this environment
   * cannot obtain, so guessing at one would risk breaking a working
   * capability. See the note at the read itself.
   */
  const SANCTIONED: Record<string, number> = {
    // Google PageSpeed Insights returns the full Lighthouse report. Sizing a
    // cap needs a measured distribution of real reports; PSI answers keyless
    // traffic from CI/dev with 429 and the platform holds no API key.
    "capabilities/page-speed-test.ts": 1,
  };

  it("no unbounded body read in any file that fetches on a caller's behalf", () => {
    expect(
      tally(SCANNED.filter((f) => fetchesForCaller(f.source))),
      "bound it with readPageHtml / readJsonWithLimit / readBodyWithLimit " +
        "(lib/resource-limits.ts), drain it with discardBody, or record it here with a reason",
    ).toEqual(SANCTIONED);
  });
});

// ─── Class B: arrayBuffer anywhere ───────────────────────────────────────────

describe("class B — arrayBuffer() is reserved to the enforcement core", () => {
  /**
   * `arrayBuffer()` has no bounded use outside the streaming core itself: it
   * resolves with the bytes already resident, so a length check afterwards
   * describes an allocation rather than preventing one. The one sanctioned
   * site is `consumeBody`'s bodyless-response fallback, which runs only when a
   * response exposes no readable stream (204/304, HEAD, a synthetic test
   * Response) and checks the length it read against the same cap.
   */
  const SANCTIONED: Record<string, number> = {
    "lib/resource-limits.ts": 1,
  };

  it("only the bodyless fallback inside consumeBody buffers with arrayBuffer()", () => {
    const offenders = SCANNED.map((f) => ({
      ...f,
      sites: f.sites.filter((s) => s.method === "arrayBuffer"),
    }));
    expect(tally(offenders), "use readBodyWithLimit instead").toEqual(SANCTIONED);
  });
});

// ─── Class B2: manual stream reads ───────────────────────────────────────────

describe("class B2 — reading a body by hand is reserved to the core", () => {
  /**
   * #432 round 2, and the reason this class exists: `page-exists.ts` read its
   * body with `response.body.getReader()` and a `while` loop, which no
   * accessor-name sweep can see. It happened to be correctly bounded — it was
   * the THIRD hand-rolled copy of the truncating read, after
   * `domain-contact-extract` and `email-finder` — but "we got lucky three
   * times" is not a property, and a fourth copy would have been invisible to
   * classes A, B and C alike.
   *
   * With all three folded into `readTextTruncated`, `getReader()` outside the
   * enforcement core has no remaining use, so this is zero tolerance rather
   * than a ledger. Together with class B it makes the claim a strong one:
   * `lib/resource-limits.ts` is the only place in `apps/api/src` that touches
   * a response body directly.
   */
  const SANCTIONED = ["lib/resource-limits.ts"];

  it("no file outside resource-limits.ts calls getReader() on a body", () => {
    const offenders = SCANNED.filter(
      (f) => /\.getReader\s*\(/.test(f.source) && !SANCTIONED.includes(f.path),
    ).map((f) => f.path);
    expect(offenders, "read through readTextWithLimit / readTextTruncated instead").toEqual([]);
  });
});

// ─── Class C: shared fetch helpers ───────────────────────────────────────────

describe("class C — shared fetch layers are ledgered exactly", () => {
  /**
   * The SHARED outbound-fetch layers: `lib/**`, `capabilities/lib/**` and
   * `capabilities/providers/**`. One unbounded read in any of these is
   * inherited by every capability that calls it — which is exactly how
   * `metered-vendor-fetch`'s clone-read got in, since nothing watched these
   * directories until now.
   *
   * Ledgered rather than banned, because none of these is caller-shaped: each
   * talks to a fixed vendor host on an account we control (Etherscan,
   * NorthData, Openapi.it, VIES, HMRC, Brreg, SDDA, Zefix, Notion, GitHub,
   * Voyage, SEC). Adding a line here is a review prompt, not a refusal —
   * state that the host is fixed and the response bounded by the vendor's
   * product, or bound the read.
   *
   * Scope note: `routes/**` is excluded because its `c.req.json()` calls read
   * INBOUND request bodies, a different risk with a different control (the
   * `/x402/*` rail cap in `app.ts`, and authentication everywhere else).
   * `web3-assurance/**` is excluded with `capabilities/*.ts` under class D.
   */
  const SCOPE = /^(lib\/|capabilities\/lib\/|capabilities\/providers\/)/;
  const LEDGER: Record<string, number> = {
    // capability-facing vendor clients
    "capabilities/lib/etherscan-client.ts": 1,
    "capabilities/lib/northdata.ts": 2,
    "capabilities/lib/openapi-resolver.ts": 3,
    "capabilities/lib/vasp-data.ts": 1,
    "capabilities/lib/vat-providers/brreg.ts": 1,
    "capabilities/lib/vat-providers/hmrc.ts": 2,
    "capabilities/lib/vat-providers/uid-ch.ts": 2,
    "capabilities/lib/vat-providers/vies.ts": 2,
    "capabilities/providers/latvian-company-data-sdda.ts": 2,
    "capabilities/providers/swiss-company-data.ts": 3,
    "lib/brreg-fetch.ts": 3,
    "lib/embeddings.ts": 4,
    "lib/sec-ticker-map.ts": 1,
    // the streaming core's own bodyless fallback (also class B)
    "lib/resource-limits.ts": 1,
    // internal operations — our schedule, our accounts, no caller involved
    "lib/daily-digest/fetch-beacon.ts": 2,
    "lib/daily-digest/fetch-ecosystem.ts": 4,
    "lib/daily-digest/fetch-notion.ts": 4,
    "lib/daily-digest/fetch-shiplog.ts": 3,
    "lib/daily-digest/send.ts": 2,
    "lib/github-issues.ts": 2,
    "lib/vendor-control-tower.ts": 2,
  };

  it("the shared-layer ledger matches reality exactly", () => {
    expect(
      tally(SCANNED.filter((f) => SCOPE.test(f.path))),
      "a shared fetch layer reads a body: bound it, or record it with the host it talks to",
    ).toEqual(LEDGER);
  });
});

// ─── Class D: the documented non-goal ────────────────────────────────────────

// ─── Class D: the documented non-goal ────────────────────────────────────────

/**
 * ~230 sites across ~130 capability executors, plus the `web3-assurance`
 * evaluators, read a JSON or XML response from a fixed registry or vendor
 * host. They are NOT ledgered, and that is a stated limit on this guard's
 * claim rather than an oversight.
 *
 * The reason is the risk model the whole programme rests on: an unbounded read
 * matters when an untrusted party chooses the size. A response from Companies
 * House, GLEIF or DefiLlama is bounded by that vendor's product, and a
 * 130-entry ledger needing an edit for every new registry capability would be
 * routed around inside a month — a guard people disable is worse than a
 * narrower guard people keep.
 *
 * What makes the omission safe is that it is self-correcting rather than
 * watched. The moment one of those files starts fetching a caller-influenced
 * URL it must go through `safeFetch` (the SSRF guard's rule), and that single
 * token moves it into class A with no ledger edit and no reviewer noticing —
 * just a failing test. Class A's filter is the mechanism, so the test below
 * keeps that filter from quietly matching nothing.
 */
describe("class D — per-capability vendor reads are out of scope, on purpose", () => {
  it("class A's filter still matches a real population", () => {
    // Without this, deleting `safeFetch` from the codebase — or a typo in the
    // filter — would leave class A scanning zero files and passing green
    // forever. The count only has to prove non-vacuity, so it is a floor well
    // under the ~50 caller-facing files that exist, not an exact figure that
    // would need bumping with every new capability.
    const callerFacing = SCANNED.filter((f) => fetchesForCaller(f.source));
    expect(callerFacing.length).toBeGreaterThan(25);
  });
});
