/**
 * The Codex re-review backlog (DEC-20260903-A).
 *
 * Work that shipped without the Codex review path owes it. This checker makes
 * that debt refuse to rot: a row naming a commit the repository does not have,
 * a row marked reviewed with no verdict, or a row still pending past its
 * review date are all findings rather than a stale file nobody re-reads.
 *
 * The failure this exists to prevent is specific. "We'll get Codex to look at
 * it later" is a sentence with no mechanism behind it, and the register that
 * records such promises is exactly the kind of document that drifts — see the
 * F7 family. So the register is checked, and the check knows the date.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export const BACKLOG_PATH = "docs/programs/codex-review-backlog.yaml";

const STATUSES = new Set(["pending", "in_review", "reviewed", "waived"]);
const PRIORITIES = new Set(["high", "medium", "low"]);
const VERDICTS = new Set(["PASS", "FAIL"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_SHA = /^[0-9a-f]{7,40}$/;

export function loadBacklog(root) {
  return parseYaml(readFileSync(resolve(root, BACKLOG_PATH), "utf8"));
}

/** Does this repository actually contain that commit? */
function commitExists(root, sha) {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} root
 * @param {{ today?: string, gitAvailable?: boolean }} [options]
 *   `today` is injectable so the overdue rule is testable without waiting.
 */
export function checkBacklog(root, options = {}) {
  const findings = [];
  const add = (code, detail) => findings.push({ code, file: BACKLOG_PATH, detail });

  let doc;
  try {
    doc = loadBacklog(root);
  } catch (error) {
    add("BACKLOG_UNREADABLE", String(error));
    return { findings, entries: [] };
  }

  if (!doc || typeof doc !== "object") {
    add("BACKLOG_UNREADABLE", "the register is not a mapping");
    return { findings, entries: [] };
  }

  const policy = doc.policy ?? {};
  if (!DATE.test(String(policy.review_by ?? ""))) {
    add("POLICY_INVALID", "policy.review_by must be a YYYY-MM-DD date — it is what makes a pending row overdue");
  }
  if (!policy.decision) {
    add("POLICY_INVALID", "policy.decision must name the founder decision that authorised shipping without Codex");
  }

  const entries = Array.isArray(doc.entries) ? doc.entries : [];
  if (!Array.isArray(doc.entries)) add("BACKLOG_UNREADABLE", "entries must be a list");

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const seen = new Set();

  for (const entry of entries) {
    const id = entry?.id ?? "(no id)";
    if (!entry || typeof entry !== "object") {
      add("ENTRY_INVALID", "an entry is not a mapping");
      continue;
    }
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
    if (entry.merged && !DATE.test(String(entry.merged))) {
      add("ENTRY_INVALID", `${id} merged must be YYYY-MM-DD`);
    }

    // A row that names a commit this repository does not have is a row nobody
    // can review. Skipped when git is unavailable rather than guessed at.
    if (entry.commit && options.gitAvailable !== false) {
      if (!SHORT_SHA.test(String(entry.commit))) {
        add("COMMIT_MISSING", `${id} commit ${entry.commit} is not a sha`);
      } else if (!commitExists(root, String(entry.commit))) {
        add("COMMIT_MISSING", `${id} names commit ${entry.commit}, which is not in this repository — a row nobody can review`);
      }
    }

    // Closing a row requires a verdict. Otherwise "reviewed" means "somebody
    // said so", which is the shape this register exists to refuse.
    if (entry.status === "reviewed") {
      if (!VERDICTS.has(String(entry.codex_verdict))) {
        add("VERDICT_MISSING", `${id} is reviewed but codex_verdict is not PASS or FAIL`);
      }
      if (!entry.codex_reviewed_on || !DATE.test(String(entry.codex_reviewed_on))) {
        add("VERDICT_MISSING", `${id} is reviewed but codex_reviewed_on is not a date`);
      }
    }
    if (entry.status === "waived" && !entry.waived_reason) {
      add("WAIVER_UNEXPLAINED", `${id} is waived with no waived_reason — a waiver without a reason is a deletion`);
    }

    // The whole point: the debt has a date, and the date is enforced.
    if ((entry.status === "pending" || entry.status === "in_review") && DATE.test(String(policy.review_by))) {
      if (today > String(policy.review_by)) {
        add(
          "REVIEW_OVERDUE",
          `${id} is still ${entry.status} after ${policy.review_by} — Codex was expected back; drain this register before starting work that adds to it`,
        );
      }
    }
  }

  return { findings, entries };
}
