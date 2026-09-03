/**
 * The Codex re-review backlog (DEC-20260903-A).
 *
 * Work that shipped without the Codex review path owes it. This checker makes
 * that debt refuse to rot in two ways.
 *
 * SHAPE rules read the file as it is: a row naming a commit the repository
 * does not have, a row marked reviewed with no verdict, a waiver with no
 * authority, a row still pending past the review date.
 *
 * HISTORY rules read the file against the merge-base with `origin/main`, the
 * same git-fact discipline `receipts-lib.mjs` applies to receipts. The first
 * version of this checker validated shape only, and an independent review
 * drained it to green five different ways without a Codex review happening —
 * waive the row, fabricate a verdict, delete the row, push the date out, empty
 * the file. Every one of those is an edit to this file, so every one is now
 * compared against what the file said before the edit:
 *
 *   - a row present at the base must still be present (ROW_DELETED);
 *   - a row's status moves forward only, and a closed row never reopens or
 *     changes its close (STATUS_REGRESSED);
 *   - the commit a row names does not change (COMMIT_CHANGED);
 *   - `policy.review_by` does not move later without a founder decision
 *     naming the extension (REVIEW_DATE_MOVED);
 *   - closing as `reviewed` needs an archived verdict that exists on disk,
 *     not a status flip (VERDICT_EVIDENCE_MISSING);
 *   - closing as `waived` is the founder's alone and names the decision
 *     (WAIVER_UNAUTHORISED).
 *
 * What this cannot catch, and does not claim to: a batch that was never added.
 * Recording the debt is a process commitment; the checker guards the record.
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";

export const BACKLOG_PATH = "docs/programs/codex-review-backlog.yaml";

const STATUSES = new Set(["pending", "in_review", "reviewed", "waived"]);
/** Forward-only ordering. Both closed states rank equal and are terminal. */
const STATUS_RANK = { pending: 0, in_review: 1, reviewed: 2, waived: 2 };
const PRIORITIES = new Set(["high", "medium", "low"]);
const VERDICTS = new Set(["PASS", "FAIL"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_SHA = /^[0-9a-f]{7,40}$/;
const DECISION_ID = /^DEC-\d{8}-[A-Z]$/;
/** The only person who may waive a Codex re-review (CLAUDE.md review routing). */
const WAIVER_AUTHORITY = "petter";

/**
 * Does this decision id name a decision the repository actually records?
 *
 * The second review of #498 fabricated `DEC-20260903-Z`, put it in
 * `review_by_extension.decision`, and pushed the date to 2099: green. A
 * format check is not an existence check. A decision is real here when it
 * has a formal record under docs/decisions/records/ or is named as a bold
 * heading in CLAUDE.md's decision list — the two places this repository
 * records decisions on main. Notion is not consulted: CI cannot reach it, and
 * a check that only works on one machine is the F5 shape.
 */
export function decisionExists(root, id) {
  if (!DECISION_ID.test(String(id ?? ""))) return false;
  if (existsSync(resolve(root, "docs/decisions/records", `${id}.md`))) return true;
  try {
    const claude = readFileSync(resolve(root, "CLAUDE.md"), "utf8");
    // A decision-list ENTRY: a bullet that starts with the bold id, as every
    // entry under "Active Decisions" / "Current Decisions" does. A bold
    // mention in passing anywhere else does not count — the third review
    // satisfied the first version with a throwaway appendix sentence.
    return new RegExp(`^- \\*\\*${id}\\*\\*`, "m").test(claude);
  } catch {
    return false;
  }
}

/**
 * Resolve an evidence path and refuse anything that escapes `<root>/archive/`.
 *
 * The prefix test `/^archive\//` was the whole containment in the second
 * version, and `archive/../notes/fake-verdict.md` passed it — the third
 * review closed the highest-priority row that way, and escaped the
 * repository entirely with enough `..`. Containment is a property of the
 * resolved path, not of its first eight characters.
 */
export function archivedEvidencePath(root, evidencePath) {
  if (typeof evidencePath !== "string" || evidencePath.length === 0) return null;
  if (evidencePath.split(/[\\/]/).includes("..")) return null;
  const archiveDir = resolve(root, "archive") + sep;
  const full = resolve(root, evidencePath);
  return full.startsWith(archiveDir) ? full : null;
}

/**
 * Is this file an archived verdict FOR this row? It must say VERDICT: <the
 * recorded verdict> and name the row's commit. Existence alone let
 * `archive/README.md` close the highest-priority row.
 */
export function verdictFileMatches(root, evidencePath, verdict, commit) {
  const full = archivedEvidencePath(root, evidencePath);
  if (!full) return { ok: false, why: "is not a path inside archive/ (a `..` segment or an escape is refused)" };
  let text;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    return { ok: false, why: "does not exist" };
  }
  if (!new RegExp(`^\\s*VERDICT:\\s*${verdict}\\s*$`, "m").test(text)) {
    return { ok: false, why: `does not contain a line "VERDICT: ${verdict}"` };
  }
  const sha = String(commit ?? "").slice(0, 7);
  if (sha && !text.includes(sha)) {
    return { ok: false, why: `does not mention commit ${commit}` };
  }
  return { ok: true };
}

export function loadBacklog(root) {
  return parseYaml(readFileSync(resolve(root, BACKLOG_PATH), "utf8"));
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

/**
 * Three-way answer, because "not found" and "could not look" are different
 * facts: `true`, `false`, or `null` when this checkout cannot tell (no git, or
 * a shallow clone that may simply not have fetched the object).
 */
function commitExists(root, sha) {
  try {
    git(root, ["rev-parse", "--git-dir"]);
  } catch {
    return null;
  }
  try {
    if (git(root, ["rev-parse", "--is-shallow-repository"]) === "true") return null;
  } catch {
    /* very old git: fall through and try */
  }
  try {
    git(root, ["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The register as it stood at the merge-base with the release branch, or
 * `null` when there is no base to compare against (first introduction, or a
 * checkout with no such ref).
 */
export function loadBaseBacklog(root, baseRef) {
  const candidates = baseRef ? [baseRef] : ["origin/main", "main"];
  for (const ref of candidates) {
    let base;
    try {
      base = git(root, ["merge-base", "HEAD", ref]);
    } catch {
      continue;
    }
    try {
      const text = git(root, ["show", `${base}:${BACKLOG_PATH}`]);
      return { ref, base, doc: parseYaml(text) };
    } catch {
      // Ref exists but the file did not at that point: first introduction.
      return { ref, base, doc: null };
    }
  }
  return null;
}

/**
 * @param {string} root
 * @param {{ today?: string, gitAvailable?: boolean, baseRef?: string, skipHistory?: boolean }} [options]
 *   `today` is injectable so the overdue rule is testable without waiting;
 *   `baseRef` so history rules are testable against a local ref.
 */
export function checkBacklog(root, options = {}) {
  const findings = [];
  const warnings = [];
  const add = (code, detail) => findings.push({ code, file: BACKLOG_PATH, detail });
  const warn = (code, detail) => warnings.push({ code, file: BACKLOG_PATH, detail });

  let doc;
  try {
    doc = loadBacklog(root);
  } catch (error) {
    add("BACKLOG_UNREADABLE", String(error));
    return { findings, warnings, entries: [] };
  }
  if (!doc || typeof doc !== "object") {
    add("BACKLOG_UNREADABLE", "the register is not a mapping");
    return { findings, warnings, entries: [] };
  }

  // ── policy ───────────────────────────────────────────────────────────────
  const policy = doc.policy ?? {};
  if (!DATE.test(String(policy.review_by ?? ""))) {
    add("POLICY_INVALID", "policy.review_by must be a YYYY-MM-DD date — it is what makes a pending row overdue");
  }
  if (!DECISION_ID.test(String(policy.decision ?? ""))) {
    add("POLICY_INVALID", `policy.decision must be a decision id (DEC-YYYYMMDD-X) naming the founder decision that authorised shipping without Codex; got ${JSON.stringify(policy.decision ?? null)}`);
  } else if (!decisionExists(root, policy.decision)) {
    add("DECISION_UNKNOWN", `policy.decision ${policy.decision} is not recorded in this repository (no docs/decisions/records/${policy.decision}.md and no **${policy.decision}** in CLAUDE.md) — a well-formed id is not a decision`);
  }

  const entries = Array.isArray(doc.entries) ? doc.entries : [];
  if (!Array.isArray(doc.entries)) add("BACKLOG_UNREADABLE", "entries must be a list");

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const gitAllowed = options.gitAvailable !== false;

  // ── shape, per row ───────────────────────────────────────────────────────
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      add("ENTRY_INVALID", "an entry is not a mapping");
      continue;
    }
    const id = entry.id ?? "(no id)";
    if (seen.has(entry.id)) add("DUPLICATE_ID", `${entry.id} appears more than once`);
    seen.add(entry.id);

    for (const field of ["id", "subject", "commit", "merged", "priority", "status", "why_codex", "what_to_attack"]) {
      if (!entry[field]) add("ENTRY_INVALID", `${id} is missing ${field}`);
    }
    if (entry.status && !STATUSES.has(entry.status)) {
      add("ENTRY_INVALID", `${id} has status ${entry.status}; expected one of ${[...STATUSES].join(", ")}`);
    }
    if (entry.priority && !PRIORITIES.has(entry.priority)) {
      add("ENTRY_INVALID", `${id} has priority ${entry.priority}; expected one of ${[...PRIORITIES].join(", ")}`);
    }
    if (entry.merged && !DATE.test(String(entry.merged))) add("ENTRY_INVALID", `${id} merged must be YYYY-MM-DD`);

    if (entry.commit && gitAllowed) {
      if (!SHORT_SHA.test(String(entry.commit))) {
        add("COMMIT_MISSING", `${id} commit ${entry.commit} is not a sha`);
      } else {
        const exists = commitExists(root, String(entry.commit));
        if (exists === false) {
          add("COMMIT_MISSING", `${id} names commit ${entry.commit}, which is not in this repository — a row nobody can review`);
        } else if (exists === null) {
          warn("COMMIT_UNVERIFIABLE", `${id} names commit ${entry.commit}; this checkout is shallow or has no git, so existence was not checked (CI checks out with fetch-depth 0 and does check it)`);
        }
      }
    }

    // Closing as reviewed is a claim about the world: it needs the verdict,
    // the date, and the archived evidence — a file that exists — not a status
    // flip. This is the receipts discipline applied to reviews.
    if (entry.status === "reviewed") {
      if (!VERDICTS.has(String(entry.codex_verdict))) {
        add("VERDICT_MISSING", `${id} is reviewed but codex_verdict is not PASS or FAIL`);
      }
      if (!entry.codex_reviewed_on || !DATE.test(String(entry.codex_reviewed_on))) {
        add("VERDICT_MISSING", `${id} is reviewed but codex_reviewed_on is not a date`);
      }
      const evidence = entry.codex_evidence;
      if (typeof evidence !== "string" || !/^archive\//.test(evidence)) {
        add("VERDICT_EVIDENCE_MISSING", `${id} is reviewed but codex_evidence does not name an archived verdict under archive/ — a review with no archived verdict is somebody saying so`);
      } else if (VERDICTS.has(String(entry.codex_verdict))) {
        // Content, not existence: any pre-existing file under archive/ closed
        // the highest-priority row in the second review.
        const m = verdictFileMatches(root, evidence, String(entry.codex_verdict), entry.commit);
        if (!m.ok) add("VERDICT_EVIDENCE_MISSING", `${id} cites ${evidence}, which ${m.why} — an archived verdict says VERDICT: ${entry.codex_verdict} and names the commit it reviewed`);
      }
    }

    // Waiving is the founder's call alone, and it names the decision.
    if (entry.status === "waived") {
      if (!entry.waived_reason) add("WAIVER_UNAUTHORISED", `${id} is waived with no waived_reason — a waiver without a reason is a deletion`);
      if (String(entry.waived_by ?? "").toLowerCase() !== WAIVER_AUTHORITY) {
        add("WAIVER_UNAUTHORISED", `${id} is waived but waived_by is ${JSON.stringify(entry.waived_by ?? null)}; only ${WAIVER_AUTHORITY} may waive a Codex re-review (CLAUDE.md review routing)`);
      }
      if (!DECISION_ID.test(String(entry.waived_decision ?? ""))) {
        add("WAIVER_UNAUTHORISED", `${id} is waived without waived_decision naming the founder decision (DEC-YYYYMMDD-X)`);
      } else if (!decisionExists(root, entry.waived_decision)) {
        add("WAIVER_UNAUTHORISED", `${id} is waived citing ${entry.waived_decision}, which this repository does not record — a well-formed id is not a decision`);
      }
    }

    // The whole point: the debt has a date, and the date is enforced.
    if ((entry.status === "pending" || entry.status === "in_review") && DATE.test(String(policy.review_by))) {
      if (today > String(policy.review_by)) {
        add("REVIEW_OVERDUE", `${id} is still ${entry.status} after ${policy.review_by} — Codex was expected back; drain this register before starting work that adds to it`);
      }
    }
  }

  // ── history, against the merge-base ──────────────────────────────────────
  if (!options.skipHistory && gitAllowed) {
    const base = loadBaseBacklog(root, options.baseRef);
    if (!base) {
      warn("HISTORY_UNAVAILABLE", "no origin/main or main to compare against; history rules (deletion, regression, date moves) were not checked");
    } else if (base.doc && typeof base.doc === "object") {
      const baseEntries = Array.isArray(base.doc.entries) ? base.doc.entries : [];
      const headById = new Map(entries.filter((e) => e && typeof e === "object").map((e) => [e.id, e]));

      for (const prev of baseEntries) {
        if (!prev || typeof prev !== "object" || !prev.id) continue;
        const next = headById.get(prev.id);
        if (!next) {
          add("ROW_DELETED", `${prev.id} existed at ${base.ref} (${base.base.slice(0, 8)}) and is gone — debt is closed by a verdict or a founder waiver, never by removing the row`);
          continue;
        }
        const before = STATUS_RANK[prev.status];
        const after = STATUS_RANK[next.status];
        if (before !== undefined && after !== undefined) {
          // A closed row is terminal; say so specifically, before the generic
          // forward-only rule, because it is the more useful message.
          if (before === 2 && next.status !== prev.status) {
            add("STATUS_REGRESSED", `${prev.id} was closed as ${prev.status} and is now ${next.status} — a closed row is terminal; open a new row if the verdict was wrong`);
          } else if (after < before) {
            add("STATUS_REGRESSED", `${prev.id} moved from ${prev.status} back to ${next.status} — status moves forward only`);
          }
        }
        if (prev.commit && next.commit && String(prev.commit) !== String(next.commit)) {
          add("COMMIT_CHANGED", `${prev.id} named commit ${prev.commit} and now names ${next.commit} — the commit under review does not change; add a row for the new one`);
        }
        // A verdict, once recorded, is a fact. Editing it is a new claim.
        for (const field of ["codex_verdict", "codex_reviewed_on", "codex_evidence"]) {
          if (prev[field] !== undefined && next[field] !== undefined && String(prev[field]) !== String(next[field])) {
            add("STATUS_REGRESSED", `${prev.id} changed ${field} from ${JSON.stringify(prev[field])} to ${JSON.stringify(next[field])} — a recorded verdict is immutable`);
          }
        }
      }

      const prevDate = String(base.doc.policy?.review_by ?? "");
      const nextDate = String(policy.review_by ?? "");
      if (DATE.test(prevDate) && DATE.test(nextDate) && nextDate > prevDate) {
        const ext = policy.review_by_extension ?? {};
        if (!DECISION_ID.test(String(ext.decision ?? "")) || !ext.reason) {
          add("REVIEW_DATE_MOVED", `policy.review_by moved from ${prevDate} to ${nextDate} without policy.review_by_extension naming a founder decision and a reason — moving the date is the cheapest way to defuse every row at once`);
        } else if (!decisionExists(root, ext.decision)) {
          add("REVIEW_DATE_MOVED", `policy.review_by moved from ${prevDate} to ${nextDate} citing ${ext.decision}, which this repository does not record — the second review fabricated exactly such an id and the date moved`);
        }
      }
    }
  }

  return { findings, warnings, entries };
}
