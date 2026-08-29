/**
 * Does the close-check's own source differ from the version on `origin/main`?
 *
 * `session-close-check.ts` inspects whichever checkout it is installed in.
 * DAILY-RUN.md requires it to be run from the primary checkout for exactly
 * that reason — a worktree reports on the worktree, which is not the thing
 * that goes stale. What nobody noticed is the other half of the same fact:
 * the script is not only *reporting on* that checkout, it is *implemented by*
 * it. When the checkout is parked on an old branch, the script that runs is
 * the old script.
 *
 * That is not hypothetical. On 2026-08-29 the primary checkout sat on a
 * feature branch 68 commits behind main. The branch predates
 * `handoff-preservation.ts` entirely, so the run executed the pre-repair
 * orphaned-handoff test and reported five session records as one directory
 * deletion from oblivion. Three of the five were byte-identical to copies
 * already on `origin/main` and were never at risk. The repair for that exact
 * false alarm had been on main since 2026-08-27 (PR #407).
 *
 * The three preceding mornings each diagnosed the same symptom as a fresh
 * defect in the check and repaired it again; the 2026-08-28 brief concluded
 * the check itself was untrustworthy and should be treated as a pattern
 * rather than fixed a fourth time. The instrument was not the problem. It was
 * correct on main every one of those mornings.
 *
 * So this is family F7, state drift, not F5: an instrument degrading **exactly
 * when the condition it exists to detect is present** — a stale checkout makes
 * the staleness checker stale. The failure mode is silent by construction,
 * because a stale checker cannot know it is stale unless it is told to look.
 *
 * The predicate is pure so the interesting cases are testable without a git
 * repository. Callers supply the two blob hashes; `null` for either means the
 * comparison could not be made, and an unmakeable comparison is reported as
 * unknown rather than as agreement. Reporting "unknown" as "fine" would
 * reintroduce the silence this exists to break.
 */

export interface SelfStalenessEvidence {
  /** Blob hash of the running script as it sits in this checkout. */
  readonly localBlob: string | null;
  /** Blob hash of the same path on `origin/main`. */
  readonly mainBlob: string | null;
  /** Commits this checkout is behind `origin/main`. */
  readonly commitsBehind: number;
  /** Which branch this checkout is on, for the message. */
  readonly branch: string;
}

export type SelfStaleness =
  | { kind: "current" }
  | { kind: "unknown"; why: string }
  /** Differs from main AND this checkout is behind it — the dangerous case. */
  | { kind: "stale"; commitsBehind: number; branch: string; why: string }
  /**
   * Differs from main but the checkout is not behind it: local edits, or a
   * branch whose changes are not merged yet. Worth saying — the findings are
   * about the working copy rather than about main — but calling it "stale"
   * would be false, and a warning that misdescribes itself is how this whole
   * family started.
   */
  | { kind: "diverged"; branch: string; why: string };

/**
 * Whether this run's own logic can be trusted.
 *
 * The comparison is on the **file's content**, not on the commit count. A
 * checkout can be far behind main and still be running an identical copy of
 * this script, in which case its findings are sound and warning about them
 * would be noise. Only a content difference means the logic actually differs.
 * That distinction is the same one DAILY-RUN.md insists on for branches, and
 * for the same reason: squash merges make commit distance meaningless.
 */
export function selfStaleness(e: SelfStalenessEvidence): SelfStaleness {
  if (e.localBlob === null || e.mainBlob === null) {
    return {
      kind: "unknown",
      why:
        "Could not compare this script against origin/main (no network, no " +
        "origin/main ref, or the path is absent there). Its findings below are " +
        "unverified — re-run from a checkout known to be current before acting " +
        "on them.",
    };
  }
  if (e.localBlob === e.mainBlob) return { kind: "current" };
  if (e.commitsBehind === 0) {
    return {
      kind: "diverged",
      branch: e.branch,
      why:
        `This check differs from the copy on origin/main, but this checkout is ` +
        `not behind main — so the difference is local work on '${e.branch}', ` +
        `not a missing repair. Findings below describe this working copy.`,
    };
  }
  return {
    kind: "stale",
    commitsBehind: e.commitsBehind,
    branch: e.branch,
    why:
      `This checkout is on '${e.branch}' and the copy of this check running ` +
      `here differs from the one on origin/main (${e.commitsBehind} commit(s) ` +
      `behind). Every finding below was produced by that older logic, so a ` +
      `repair already merged to main may not be applied here and the findings ` +
      `may be false. Re-run from a current checkout before acting on them.`,
  };
}
