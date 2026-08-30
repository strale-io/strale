#!/usr/bin/env node
/**
 * The production write credential has exactly one door.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * On 2026-08-22 an autonomous session executed a founder-reserved money-path
 * write. The controls that now exist — `lib/production-authority.ts` for
 * authority, `lib/operator-db.ts` for connections — only bind if there is no
 * way around them. A gate beside an open field is scenery.
 *
 * The whole design rests on one property: **`DATABASE_URL_WRITE` is readable in
 * exactly one place, and that place demands an `Authority` before it hands the
 * value out.** If any other module can read the variable, it can open a
 * writable connection with no authority attached and the entire model is
 * decorative.
 *
 * That property is a grep. So it is checked by one, in CI, on every change.
 *
 * ── What this does NOT claim ────────────────────────────────────────────────
 *
 * It does not prove that scripts cannot write. Most operator scripts open
 * `DATABASE_URL`, and whether that role can write is an infrastructure fact this
 * repository cannot verify. What it proves is narrower and checkable: no code
 * path except the authority module can obtain the WRITE credential, so every
 * write that uses it has an Authority attached at the point of release.
 *
 * **It also does not cover writes performed by libraries a script imports.**
 * `smoke-test.ts` holds a read-only handle, but the `guardedExecute` it calls
 * writes breaker state, health rows and invocation facts through `getDb()`
 * inside `src/lib` — three call sites, all legitimate, none of them visible to
 * a rule that reads the script's own file. So "an autonomous session cannot
 * write production" is true of the WRITE CREDENTIAL and of scripts' own
 * handles; it is not yet true of everything a script can reach. Closing that
 * needs `DATABASE_URL` to actually be a read-only role in infrastructure, which
 * is step 1 of docs/security/2026-08-22-operator-script-migration.md and cannot
 * be done from here.
 *
 * Usage:  node scripts/guard-production-write-access.mjs [--report]
 */

import { execFileSync } from "node:child_process";
import { argv, exit } from "node:process";

/** The one module allowed to read the write credential, plus its own test. */
const AUTHORISED_READERS = [
  "apps/api/src/lib/production-authority.ts",
  "apps/api/src/lib/production-authority.test.ts",
];

/**
 * Files allowed to name the variable without reading it — documentation and
 * the guard itself. Kept explicit so "it's just a doc" is a decision, not an
 * assumption.
 */
const AUTHORISED_MENTIONS = [
  "scripts/guard-production-write-access.mjs",
  "apps/api/test/guard-production-write-access.test.ts",
  "docs/incidents/2026-08-22-production-authorization-failure.md",
  "docs/security/2026-08-22-starve-set-1-provenance.md",
  "docs/security/2026-08-22-operator-script-migration.md",
  "docs/security/2026-08-22-founder-grant-runbook.md",
  // Names the variable in prose only; `operator-db.ts` obtains the value via
  // productionWriteUrl(authority) and never reads the environment itself.
  "apps/api/src/lib/operator-db.ts",
  // Asserts the refusal path by ensuring the variable is ABSENT. A test that
  // manipulates the variable to prove a write is refused cannot leak a
  // credential — there is none to leak — and forbidding it would mean the
  // refusal path had no coverage, which is worse.
  "apps/api/src/lib/operator-db.test.ts",
];

/**
 * Session records under `handoff/` are an append-only journal, not code.
 *
 * The property this guard protects is that no CODE PATH but the authority
 * module can obtain the credential — the test re-derives it independently over
 * `*.ts` and `*.mjs` alone, which is the honest statement of the subject. A
 * markdown file cannot read an environment variable.
 *
 * So why not just add each record to AUTHORISED_MENTIONS? Because that list
 * exists to make "it's just a doc" a deliberate decision, and that reasoning
 * holds for the handful of long-lived policy documents in `docs/security/`.
 * `handoff/` is a different shape: one append-only file per session, and any
 * session that writes down the outstanding `--backfill` operator action names
 * the variable in passing. Requiring an allowlist edit per journal entry does
 * not make the decision more deliberate — it prices the sentence, and the
 * cheapest way to a green build becomes deleting the explanation. That exact
 * pressure is recorded in the #436 session notes: "a check that forbids
 * mentioning a removed mistake pressures the next author to drop the
 * explanation." Two records tripped it on 2026-08-30 and both were correct
 * prose describing work that genuinely is outstanding.
 *
 * Deliberately scoped to `.md`. A script dropped into `handoff/` is still an
 * offender, because a script can read the variable and a record cannot.
 */
export function isProseRecord(path) {
  return path.startsWith("handoff/") && path.endsWith(".md");
}

const NEEDLE = ["DATABASE", "URL", "WRITE"].join("_");

/**
 * Repo root, so paths are repo-relative regardless of where this is invoked.
 *
 * `git ls-files` emits paths relative to the CURRENT DIRECTORY. Run from
 * `apps/api` it returns `src/lib/production-authority.ts`, which matches no
 * entry in the allowlist, and the guard reports its own authorised reader as an
 * offender — a guard that fails loudly for the wrong reason, which trains
 * people to ignore it. Anchor everything to the toplevel instead.
 */
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/**
 * One `git grep`, not `ls-files` plus a readFileSync per file.
 *
 * The first version listed every tracked file and read each one in Node. On
 * this repository that is thousands of reads, it took ~39 seconds under
 * full-suite parallel load, and it made its own test time out — three test
 * failures that were nothing but the guard being slow. A guard that flakes gets
 * muted, and a muted guard is the same as no guard. git grep does the same work
 * in one subprocess.
 *
 * `-n` gives line numbers, `-F` fixed-string, `--` limits to the file types the
 * old filter covered. Exit status 1 means "no matches", which is success here.
 */
function grepHits(needle, { wholeWord = false } = {}) {
  try {
    const out = execFileSync(
      "git",
      [
        "grep",
        "-n",
        "-F",
        // Word boundary where the needle is an identifier. The Node version
        // this replaced used /\bgetDb\b/; a plain substring grep would fail CI
        // on `myGetDbHelper` or a comment mentioning it, and a guard with false
        // positives gets disabled rather than fixed.
        ...(wholeWord ? ["-w"] : []),
        needle,
        "--",
        "*.ts",
        "*.mjs",
        "*.js",
        "*.md",
        "*.yaml",
        "*.yml",
        "*.json",
      ],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return out.split("\n").filter(Boolean);
  } catch (err) {
    // git grep exits 1 with empty stdout when nothing matched.
    const e = err;
    if (e.status === 1 && !String(e.stdout ?? "").trim()) return [];
    throw err;
  }
}

const offenders = [];
for (const hit of grepHits(NEEDLE)) {
  // `path:line:content`, and paths here never contain a colon in this repo.
  const firstColon = hit.indexOf(":");
  const secondColon = hit.indexOf(":", firstColon + 1);
  const path = hit.slice(0, firstColon);
  const line = hit.slice(firstColon + 1, secondColon);
  if (
    AUTHORISED_READERS.includes(path) ||
    AUTHORISED_MENTIONS.includes(path) ||
    isProseRecord(path)
  ) {
    continue;
  }
  offenders.push(`${path}:${line}`);
}

/**
 * Rule 2: operator scripts must not reach for the application's read-write pool.
 *
 * `getDb()` in `db/index.ts` is the API server's pool. It is the right thing for
 * request handlers and the wrong thing for a script an autonomous session runs,
 * because it hands over a writable handle with no Authority attached — which is
 * precisely how the 2026-08-22 reconciliation was executed.
 *
 * Every script under apps/api/scripts now uses `lib/operator-db.ts`:
 * `openOperatorDb`/`openOperatorDrizzle` for reads (read-only enforced by
 * Postgres) or `openOperatorWrite*` for writes (Authority required). This keeps
 * it that way — the surface was migrated to zero, so the allowlist is empty and
 * the next script that reaches for getDb fails CI instead of quietly working.
 */
const scriptOffenders = [
  ...new Set(
    grepHits("getDb", { wholeWord: true })
      .map((h) => h.slice(0, h.indexOf(":")))
      .filter(
        (p) =>
          p.startsWith("apps/api/scripts/") &&
          !p.includes("/archive/") &&
          /\.(ts|mjs|js)$/.test(p),
      ),
  ),
];

if (argv.includes("--report")) {
  console.log(`authorised readers : ${AUTHORISED_READERS.join(", ")}`);
  console.log(`other mentions ok  : ${AUTHORISED_MENTIONS.length} file(s)`);
  console.log(`offenders          : ${offenders.length}`);
  for (const o of offenders) console.log(`  ${o}`);
  console.log(`scripts using getDb: ${scriptOffenders.length}`);
  for (const o of scriptOffenders) console.log(`  ${o}`);
}

if (scriptOffenders.length > 0) {
  console.error(
    `\nREFUSING: ${scriptOffenders.length} operator script(s) use getDb(), the ` +
      `application's read-write pool:\n\n` +
      scriptOffenders.map((o) => `  ${o}`).join("\n") +
      "\n\nA script gets its handle from lib/operator-db.ts:\n" +
      "  openOperatorDrizzle()            — read-only, enforced by Postgres\n" +
      "  openOperatorWriteDrizzle(auth)   — requires an Authority\n" +
      "where auth is autonomousAuthority(purpose, policy) for a delegated\n" +
      "action, or requireFounderGrant(purpose) for anything else.\n",
  );
  exit(1);
}

if (offenders.length > 0) {
  console.error(
    `\nREFUSING: ${offenders.length} unauthorised reference(s) to the production ` +
      `write credential:\n\n` +
      offenders.map((o) => `  ${o}`).join("\n") +
      `\n\nOnly ${AUTHORISED_READERS[0]} may read it, and only via\n` +
      "productionWriteUrl(authority), so that every release of the credential\n" +
      "carries an Authority. To open a writable connection, call\n" +
      "openOperatorWriteDb(authority) from lib/operator-db.ts.\n",
  );
  exit(1);
}

if (!argv.includes("--report")) {
  console.log(
    `production write credential: 1 authorised reader, 0 unauthorised references`,
  );
}
