/**
 * Session close-out checker.
 *
 * Runs a set of fast checks for real loose ends before closing a session.
 * Only flags state that this session is responsible for — pre-existing drift
 * from other sessions is filtered out.
 *
 * Session scope: work done in the last SESSION_WINDOW_HOURS (default 6).
 * Commits by the current git author within that window, files with mtime
 * in that window, and DB rows whose slugs were touched by those changes.
 * Override with SESSION_WINDOW_HOURS=N.
 *
 * Checks:
 *   - Git: dangling commits, unpushed work, uncommitted code (all session-scoped)
 *   - Handoff files (today's + session-window uncommitted)
 *   - DB ↔ code parity for caps touched this session
 *   - Caps touched this session that ended in lifecycle=validating
 *   - Circuit breakers opened this session
 *   - Repo hygiene (NOT session-scoped — see below)
 *
 * Repo hygiene is the deliberate exception to the session-scoping above.
 * Scoping every check to "what did this session do" means accumulated state
 * belongs to nobody: a handoff left uncommitted yesterday, or a checkout
 * parked on a finished branch, is invisible to every future session, each of
 * which honestly reports clean while the repo drifts. Those checks ask
 * instead whether the repo is tidy right now, regardless of who untidied it.
 *
 * Exit codes:
 *   0 — all green, safe to close
 *   1 — warnings (yellow), review before closing
 *   2 — blockers (red), don't close until resolved
 *
 * Usage (from apps/api/):
 *   npx tsx --env-file=../../.env scripts/session-close-check.ts
 *   SESSION_WINDOW_HOURS=12 npx tsx --env-file=../../.env scripts/session-close-check.ts
 *
 * Fast hygiene-only pass (no DB, no credentials — good for session start or
 * a daily check):
 *   npx tsx scripts/session-close-check.ts --hygiene-only
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { handoffIsAtRisk } from "../src/lib/handoff-preservation.js";
import { selfStaleness } from "../src/lib/check-self-staleness.js";

type Finding = { level: "red" | "yellow" | "green"; section: string; detail: string };
const findings: Finding[] = [];

function sh(cmd: string, opts: { cwd?: string; allowFail?: boolean } = {}): string {
  try {
    return execSync(cmd, { cwd: opts.cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e: any) {
    if (opts.allowFail) return "";
    throw e;
  }
}

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const CAPABILITIES_DIR = resolve(REPO_ROOT, "apps/api/src/capabilities");
const MANIFESTS_DIR = resolve(REPO_ROOT, "manifests");
const HANDOFF_DIR = resolve(REPO_ROOT, "handoff/_general/from-code");

const CURRENT_AUTHOR_EMAIL = sh("git config user.email", { cwd: REPO_ROOT, allowFail: true });

const SESSION_WINDOW_HOURS = Number(process.env.SESSION_WINDOW_HOURS ?? 6);
const SESSION_START_MS = Date.now() - SESSION_WINDOW_HOURS * 3600_000;
const SESSION_START_SEC = Math.floor(SESSION_START_MS / 1000);
const SESSION_START_ISO = new Date(SESSION_START_MS).toISOString();

// Slugs touched by this session — populated lazily (requires git + fs).
// Used to scope DB checks to capabilities this session actually modified.
let sessionTouchedSlugsCache: Set<string> | null = null;

function getSessionTouchedSlugs(): Set<string> {
  if (sessionTouchedSlugsCache) return sessionTouchedSlugsCache;
  const slugs = new Set<string>();

  // (a) Files touched by session-window commits by current author
  const log = sh(
    `git log --since="${SESSION_START_ISO}" --author="${CURRENT_AUTHOR_EMAIL}" --name-only --pretty=format:`,
    { cwd: REPO_ROOT, allowFail: true },
  );
  // (b) Currently-uncommitted files
  const status = sh("git status --porcelain", { cwd: REPO_ROOT, allowFail: true });
  const statusPaths = status
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  const allPaths = [...log.split("\n"), ...statusPaths].map((p) => p.trim()).filter(Boolean);
  for (const p of allPaths) {
    // Extract slug from capability executor path
    const cap = p.match(/^apps\/api\/src\/capabilities\/([a-z0-9-]+)\.ts$/);
    if (cap) slugs.add(cap[1]);
    // Extract slug from manifest path
    const man = p.match(/^manifests\/([a-z0-9-]+)\.yaml$/);
    if (man) slugs.add(man[1]);
  }

  sessionTouchedSlugsCache = slugs;
  return slugs;
}

// ────────────────────────────────────────────────────────────────
// Check 1: Dangling commits authored by current user, within session window
// ────────────────────────────────────────────────────────────────
function checkDanglingCommits(): void {
  const fsckOutput = sh("git fsck --dangling --no-progress 2>&1 | grep '^dangling commit'", {
    cwd: REPO_ROOT,
    allowFail: true,
  });
  if (!fsckOutput) return;

  for (const line of fsckOutput.split("\n")) {
    const sha = line.replace("dangling commit", "").trim();
    if (!sha) continue;
    const info = sh(`git log ${sha} -1 --pretty='%ae|%at|%s'`, { cwd: REPO_ROOT, allowFail: true });
    if (!info) continue;
    const [email, timestamp, subject] = info.split("|");
    if (email !== CURRENT_AUTHOR_EMAIL) continue;
    if (parseInt(timestamp, 10) < SESSION_START_SEC) continue;

    // Check if dangling commit is actually just on a named branch (fsck sometimes reports these)
    const branches = sh(`git branch -a --contains ${sha} 2>&1`, { cwd: REPO_ROOT, allowFail: true });
    if (branches && !branches.includes("error:")) continue;

    findings.push({
      level: "red",
      section: "Git dangling commits",
      detail: `${sha.slice(0, 10)} — ${subject} (orphaned, no branch references it). Recover with: git cherry-pick ${sha}`,
    });
  }
}

// ────────────────────────────────────────────────────────────────
// Check 2: Unpushed commits on current branch
// ────────────────────────────────────────────────────────────────
function checkUnpushed(): void {
  const branch = sh("git branch --show-current", { cwd: REPO_ROOT, allowFail: true });
  if (!branch) return;

  const upstream = sh(`git rev-parse --abbrev-ref ${branch}@{upstream}`, { cwd: REPO_ROOT, allowFail: true });
  if (!upstream) {
    findings.push({
      level: "yellow",
      section: "Git push state",
      detail: `Branch '${branch}' has no upstream. Any local commits won't be pushed until you set one.`,
    });
    return;
  }

  const ahead = sh(`git rev-list --count ${upstream}..HEAD`, { cwd: REPO_ROOT, allowFail: true });
  const aheadN = parseInt(ahead || "0", 10);
  if (aheadN === 0) return;

  const commitList = sh(`git log ${upstream}..HEAD --oneline`, { cwd: REPO_ROOT, allowFail: true });
  findings.push({
    level: branch === "main" ? "red" : "yellow",
    section: "Git unpushed commits",
    detail: `${branch} is ${aheadN} commit(s) ahead of ${upstream}:\n    ${commitList.split("\n").slice(0, 5).join("\n    ")}`,
  });
}

// ────────────────────────────────────────────────────────────────
// Check 3: Uncommitted work in high-signal code paths, touched this session
// ────────────────────────────────────────────────────────────────
function checkUncommittedInCodePaths(): void {
  const status = sh("git status --porcelain", { cwd: REPO_ROOT });
  if (!status) return;

  const watchPaths = [
    { path: "apps/api/src/capabilities/", label: "capability executors" },
    { path: "manifests/", label: "capability manifests" },
    { path: "apps/api/src/lib/", label: "shared libs" },
    { path: "apps/api/src/routes/", label: "API routes" },
    { path: "apps/api/drizzle/", label: "DB migrations" },
  ];

  for (const { path, label } of watchPaths) {
    const hits = status
      .split("\n")
      .filter((line) => line.slice(3).startsWith(path))
      .filter((line) => !line.slice(3).match(/\.test\.ts$/))
      .filter((line) => {
        const filePath = join(REPO_ROOT, line.slice(3).trim());
        try {
          return statSync(filePath).mtimeMs >= SESSION_START_MS;
        } catch {
          return false; // deleted files can't be stat'd; skip
        }
      });
    if (hits.length === 0) continue;

    findings.push({
      level: "yellow",
      section: "Git uncommitted code",
      detail: `${hits.length} uncommitted file(s) in ${label} (${path}) modified this session:\n    ${hits.slice(0, 8).join("\n    ")}`,
    });
  }
}

// ────────────────────────────────────────────────────────────────
// Check 4a: A handoff file exists for today (CLAUDE.md step 6)
// ────────────────────────────────────────────────────────────────
function checkTodaysHandoff(): void {
  if (!existsSync(HANDOFF_DIR)) {
    findings.push({
      level: "yellow",
      section: "Handoff file for today",
      detail: `Handoff dir ${HANDOFF_DIR} doesn't exist. Per CLAUDE.md Quick Session Checklist step 6, every session ends with a handoff file.`,
    });
    return;
  }
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC — close enough for a date-prefix match)
  const hit = readdirSync(HANDOFF_DIR).find((f) => f.startsWith(today) && f.endsWith(".md"));
  if (hit) return;

  findings.push({
    level: "yellow",
    section: "Handoff file for today",
    detail: `No handoff file matching ${today}-*.md in ${HANDOFF_DIR}. CLAUDE.md step 6 expects one (even a one-liner starting with 'Intent:'). If intentionally skipped, confirm to yourself before closing.`,
  });
}

// ────────────────────────────────────────────────────────────────
// Check 4b: Handoff files from this session not yet committed
// ────────────────────────────────────────────────────────────────
function checkStaleHandoffs(): void {
  if (!existsSync(HANDOFF_DIR)) return;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const files = readdirSync(HANDOFF_DIR).filter((f) => f.endsWith(".md"));
  const stale: string[] = [];
  for (const f of files) {
    // Handoff convention is YYYY-MM-DD-*.md — if the date prefix isn't
    // today's, it was authored in a prior session (mtime may update
    // for unrelated reasons like git line-ending normalization).
    const datePrefix = f.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1];
    if (datePrefix && datePrefix !== today) continue;

    const full = join(HANDOFF_DIR, f);
    const mtimeMs = statSync(full).mtimeMs;
    if (mtimeMs < SESSION_START_MS) continue;

    const inGit = sh(`git log -1 --format=%H -- "${full}"`, { cwd: REPO_ROOT, allowFail: true });
    if (!inGit) {
      const age = Math.round((Date.now() - mtimeMs) / 3600_000);
      stale.push(`${f} (age=${age}h)`);
    }
  }
  if (stale.length === 0) return;
  findings.push({
    level: "yellow",
    section: "Handoff files uncommitted",
    detail: `${stale.length} handoff file(s) from this session never committed:\n    ${stale.join("\n    ")}`,
  });
}

// ────────────────────────────────────────────────────────────────
// Check 5: DB ↔ code parity for capabilities touched this session
// ────────────────────────────────────────────────────────────────
async function checkCapabilityParity(sql: postgres.Sql): Promise<void> {
  if (!existsSync(CAPABILITIES_DIR)) return;

  const touched = getSessionTouchedSlugs();
  if (touched.size === 0) return; // no cap work this session → nothing to check

  // Read DEACTIVATED slugs from auto-register.ts so we don't flag expected mismatches.
  let deactivated = new Set<string>();
  const autoRegPath = join(CAPABILITIES_DIR, "auto-register.ts");
  if (existsSync(autoRegPath)) {
    const src = execSync(`cat "${autoRegPath}"`, { encoding: "utf-8" });
    for (const m of src.matchAll(/\[\s*"([a-z0-9-]+)"\s*,\s*"[^"]*"\s*\]/g)) {
      deactivated.add(m[1]);
    }
  }

  const executorFiles = new Set(
    readdirSync(CAPABILITIES_DIR)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
      .filter((f) => !["index.ts", "auto-register.ts"].includes(f))
      .map((f) => f.replace(/\.ts$/, ""))
      .filter((slug) => !deactivated.has(slug)),
  );

  const rows = await sql<Array<{ slug: string }>>`
    SELECT slug FROM capabilities WHERE is_active = true
  `;
  const dbSlugs = new Set(rows.map((r) => r.slug));

  const inDbMissingExecutor = [...dbSlugs]
    .filter((s) => touched.has(s))
    .filter((s) => !executorFiles.has(s));
  const inCodeMissingDb = [...executorFiles]
    .filter((f) => touched.has(f))
    .filter((f) => !dbSlugs.has(f));

  if (inDbMissingExecutor.length > 0) {
    findings.push({
      level: "red",
      section: "DB ↔ code drift",
      detail: `${inDbMissingExecutor.length} cap(s) touched this session are active in DB but have no executor on disk:\n    ${inDbMissingExecutor.slice(0, 10).join(", ")}${inDbMissingExecutor.length > 10 ? "…" : ""}\n    (These will 500 on POST /v1/do. Either ship the executor or deactivate the DB row.)`,
    });
  }
  if (inCodeMissingDb.length > 0) {
    findings.push({
      level: "yellow",
      section: "DB ↔ code drift",
      detail: `${inCodeMissingDb.length} executor(s) added this session without an active DB row:\n    ${inCodeMissingDb.slice(0, 10).join(", ")}${inCodeMissingDb.length > 10 ? "…" : ""}\n    (Normal if they're in DEACTIVATED list or awaiting onboarding.)`,
    });
  }
}

// ────────────────────────────────────────────────────────────────
// Check 6: Caps touched this session that are still validating
// ────────────────────────────────────────────────────────────────
async function checkStuckValidating(sql: postgres.Sql): Promise<void> {
  const touched = getSessionTouchedSlugs();
  if (touched.size === 0) return;
  const slugs = [...touched];

  const rows = await sql<Array<{ slug: string; hours: number | null }>>`
    SELECT slug,
           EXTRACT(EPOCH FROM (NOW() - last_tested_at)) / 3600 AS hours
    FROM capabilities
    WHERE is_active = true
      AND lifecycle_state = 'validating'
      AND slug = ANY(${slugs})
    ORDER BY last_tested_at ASC NULLS FIRST
  `;
  if (rows.length === 0) return;

  const lines = rows.slice(0, 8).map((r) =>
    r.hours == null
      ? `${r.slug} (never tested)`
      : `${r.slug} (last tested ${Math.round(r.hours)}h ago)`,
  );
  findings.push({
    level: "yellow",
    section: "Caps still validating",
    detail: `${rows.length} cap(s) touched this session are still in lifecycle=validating:\n    ${lines.join("\n    ")}${rows.length > 8 ? "\n    …" : ""}`,
  });
}

// ────────────────────────────────────────────────────────────────
// Check 7: Circuit breakers opened this session
// ────────────────────────────────────────────────────────────────
async function checkOpenBreakers(sql: postgres.Sql): Promise<void> {
  try {
    const rows = await sql<Array<{ slug: string; failures: number; opened: string }>>`
      SELECT ch.capability_slug AS slug,
             ch.consecutive_failures AS failures,
             ch.opened_at AS opened
      FROM capability_health ch
      JOIN capabilities c ON c.slug = ch.capability_slug
      WHERE ch.state = 'open'
        AND c.is_active = true
        AND ch.opened_at >= ${SESSION_START_ISO}::timestamptz
      ORDER BY ch.opened_at DESC
    `;
    if (rows.length === 0) return;

    const lines = rows.slice(0, 8).map(
      (r) => `${r.slug} (${r.failures} failures, opened ${new Date(r.opened).toISOString()})`,
    );
    findings.push({
      level: "red",
      section: "Circuit breakers opened this session",
      detail: `${rows.length} cap(s) had breakers trip within the session window — users may be seeing degraded service caused by this session's work:\n    ${lines.join("\n    ")}`,
    });
  } catch {
    // Table may not exist in all envs
  }
}

// ────────────────────────────────────────────────────────────────
// Repo hygiene — DELIBERATELY NOT SESSION-SCOPED
//
// Every other check in this file is scoped to "what did THIS session do",
// which is right for "did I leave a mess". But it means accumulated state
// belongs to nobody: a handoff left uncommitted yesterday, or a checkout
// parked on a finished branch three weeks ago, is invisible to every
// session forever, and each one honestly reports clean while the repo
// drifts. That is exactly how the primary checkout ended up sitting 77
// commits behind main on a fully-superseded branch with five uncommitted
// session records (2026-08-18).
//
// These checks ask the different question: is the REPO tidy right now,
// regardless of who made it untidy. Findings are yellow — they inform, they
// do not block closing a session.
// ────────────────────────────────────────────────────────────────
function checkRepoHygiene(): void {
  // Refresh origin/main so "behind" is real rather than whatever was last
  // fetched. Non-fatal: offline should degrade, not crash the checker.
  sh("git fetch origin main --quiet", { cwd: REPO_ROOT, allowFail: true });

  const branch = sh("git branch --show-current", { cwd: REPO_ROOT, allowFail: true });
  const behind = parseInt(
    sh("git rev-list --count HEAD..origin/main", { cwd: REPO_ROOT, allowFail: true }) || "0",
    10,
  );

  if (branch && branch !== "main") {
    findings.push({
      level: "yellow",
      section: "Checkout not on main",
      detail:
        `This checkout is on '${branch}', ${behind} commit(s) behind main.\n` +
        `    If that branch's work is merged, switch back: git checkout main && git pull\n` +
        `    Note: GitHub squash-merges, so git still calls a merged branch "ahead" of\n` +
        `    main forever. "N commits ahead" is NOT evidence the work is unmerged —\n` +
        `    compare file contents against origin/main before assuming it is.`,
    });
  } else if (behind > 20) {
    findings.push({
      level: "yellow",
      section: "Checkout stale",
      detail: `On main but ${behind} commits behind origin/main. Run: git pull`,
    });
  }

  // Uncommitted handoffs of ANY age. checkStaleHandoffs only considers files
  // dated today, so anything left overnight became permanently invisible —
  // the precise gap that orphaned five session records.
  //
  // "Uncommitted" is decided by handoffIsAtRisk, not by `git ls-files` alone.
  // Index membership is a fact about whichever branch this checkout is sitting
  // on; when that branch is behind main, files safely stored on main read as
  // one directory deletion from oblivion. See src/lib/handoff-preservation.ts.
  if (existsSync(HANDOFF_DIR)) {
    const today = new Date().toISOString().slice(0, 10);
    const upstream = sh("git rev-parse --abbrev-ref --symbolic-full-name @{u}", {
      cwd: REPO_ROOT,
      allowFail: true,
    });
    const orphaned = readdirSync(HANDOFF_DIR)
      .filter((f) => f.endsWith(".md"))
      .filter((f) => !f.startsWith(today)) // today's is checkStaleHandoffs' job
      .filter((f) => {
        const abs = join(HANDOFF_DIR, f);
        const rel = `handoff/_general/from-code/${f}`;
        return handoffIsAtRisk({
          workingBlob: sh(`git hash-object "${abs}"`, { cwd: REPO_ROOT, allowFail: true }),
          trackedHere: Boolean(sh(`git ls-files --error-unmatch "${abs}"`, { cwd: REPO_ROOT, allowFail: true })),
          mainBlob: sh(`git rev-parse --verify --quiet "origin/main:${rel}"`, { cwd: REPO_ROOT, allowFail: true }) || null,
          upstreamBlob: upstream
            ? sh(`git rev-parse --verify --quiet "${upstream}:${rel}"`, { cwd: REPO_ROOT, allowFail: true }) || null
            : null,
        });
      });
    if (orphaned.length > 0) {
      findings.push({
        level: "yellow",
        section: "Handoffs never committed",
        detail:
          `${orphaned.length} handoff file(s) exist only on disk — losing this directory loses them:\n    ` +
          orphaned.slice(0, 8).map((f) => `  ${f}`).join("\n    ") +
          (orphaned.length > 8 ? `\n      …and ${orphaned.length - 8} more` : ""),
      });
    }
  }

  // Local branches nobody has touched in a fortnight. Usually finished work
  // whose PR was squash-merged, which git cannot tell you on its own.
  const FOURTEEN_DAYS = 14 * 86400;
  const nowSec = Math.floor(Date.now() / 1000);
  const stale = sh(
    'git for-each-ref --format="%(refname:short)|%(committerdate:unix)" refs/heads/',
    { cwd: REPO_ROOT, allowFail: true },
  )
    .split("\n")
    .filter(Boolean)
    .map((l) => l.replace(/"/g, "").split("|"))
    .filter(([name, ts]) => name !== "main" && nowSec - parseInt(ts || "0", 10) > FOURTEEN_DAYS)
    .map(([name, ts]) => `${name} (${Math.round((nowSec - parseInt(ts, 10)) / 86400)}d old)`);
  if (stale.length > 0) {
    findings.push({
      level: "yellow",
      section: "Stale local branches",
      detail:
        `${stale.length} branch(es) untouched for 14+ days — likely merged and forgotten:\n    ` +
        stale.slice(0, 8).join("\n    ") +
        `\n    Confirm the work is on main, then: git branch -D <name>`,
    });
  }
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────
/**
 * Warn when this run's own logic is not the version on main.
 *
 * Placed first, and printed before any finding, because it is a statement
 * about how much the findings are worth rather than a finding of its own. See
 * `src/lib/check-self-staleness.ts` for why a checkout that is behind makes
 * this check behave as it did before its own repairs.
 */
function checkSelfStaleness(): void {
  sh("git fetch origin main --quiet", { cwd: REPO_ROOT, allowFail: true });
  const relSelf = "apps/api/scripts/session-close-check.ts";
  const selfPath = resolve(REPO_ROOT, relSelf);
  const v = selfStaleness({
    localBlob: sh(`git hash-object "${selfPath}"`, { cwd: REPO_ROOT, allowFail: true }) || null,
    mainBlob: sh(`git rev-parse --verify --quiet "origin/main:${relSelf}"`, { cwd: REPO_ROOT, allowFail: true }) || null,
    commitsBehind: parseInt(sh("git rev-list --count HEAD..origin/main", { cwd: REPO_ROOT, allowFail: true }) || "0", 10),
    branch: sh("git branch --show-current", { cwd: REPO_ROOT, allowFail: true }) || "(detached)",
  });
  if (v.kind === "current") return;
  findings.push({
    level: "yellow",
    section:
      v.kind === "stale"
        ? "This check is running stale logic"
        : v.kind === "diverged"
          ? "This check differs from main (local work)"
          : "This check could not verify itself",
    detail: v.why,
  });
}

async function main() {
  console.log("Session close-out check");
  console.log(`Session window: last ${SESSION_WINDOW_HOURS}h (since ${SESSION_START_ISO})`);
  console.log("=".repeat(60));

  checkSelfStaleness();

  checkDanglingCommits();
  checkUnpushed();
  checkUncommittedInCodePaths();
  checkTodaysHandoff();
  checkStaleHandoffs();
  checkRepoHygiene();

  // --hygiene-only: skip the DB round-trips so this can run as a fast
  // start-of-session or daily check without credentials.
  if (process.argv.includes("--hygiene-only")) {
    report();
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const sql = postgres(dbUrl, { max: 1, ssl: "require" });
    try {
      await checkCapabilityParity(sql);
      await checkStuckValidating(sql);
      await checkOpenBreakers(sql);
    } finally {
      await sql.end();
    }
  } else {
    findings.push({
      level: "yellow",
      section: "DB checks skipped",
      detail: "DATABASE_URL not set — run with `--env-file=../../.env` to enable DB checks.",
    });
  }

  report();
}

// Extracted so --hygiene-only can print and exit without the DB round-trips.
function report(): never {
  const red = findings.filter((f) => f.level === "red");
  const yellow = findings.filter((f) => f.level === "yellow");

  for (const f of [...red, ...yellow]) {
    const icon = f.level === "red" ? "✗" : "⚠";
    console.log(`\n${icon} [${f.section}]`);
    console.log(`  ${f.detail}`);
  }

  console.log("\n" + "=".repeat(60));
  if (red.length === 0 && yellow.length === 0) {
    console.log("✓ All clear — safe to close session.");
    process.exit(0);
  }
  console.log(`${red.length} red · ${yellow.length} yellow`);
  if (red.length > 0) {
    console.log("✗ Blockers found — resolve before closing.");
    process.exit(2);
  }
  console.log("⚠ Warnings only — review before closing.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
