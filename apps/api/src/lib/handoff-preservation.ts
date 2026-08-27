/**
 * Is a handoff file on disk actually at risk of being lost?
 *
 * `session-close-check.ts` warns about handoff records that "exist only on
 * disk — losing this directory loses them". It decided that with
 * `git ls-files --error-unmatch`, which asks a narrower question than the
 * warning claims: *is this path in the index of the branch this checkout
 * happens to be sitting on*.
 *
 * Those come apart whenever the checkout is not on main. On 2026-08-27 the
 * primary checkout sat on a branch 48 commits behind main, and the check
 * reported two incident records — the process-violation writeup and the
 * stranded-settlement investigation — as unsaved and one directory deletion
 * from being lost. Both were byte-identical to the copies already on
 * `origin/main`; nothing was at risk, and a session acting on the warning
 * would have spent its morning re-committing files that were already stored.
 *
 * That is failure family F1: an alert firing on something correct. The repair
 * belongs in the instrument, not in the thing it points at.
 *
 * The predicate below asks the question the warning's own wording implies —
 * *is this content stored anywhere git will still have it tomorrow* — and
 * answers it from three independent pieces of evidence. It is deliberately a
 * superset of the old safe-set: everything the old check considered safe is
 * still safe here, so this can only withdraw false positives and cannot
 * introduce a new silence.
 */

export interface PreservationEvidence {
  /** Blob hash of the file as it currently sits on disk. */
  readonly workingBlob: string;
  /** Is the path in the index of the branch this checkout is on? */
  readonly trackedHere: boolean;
  /** Blob hash at the same path on `origin/main`, or null if absent there. */
  readonly mainBlob: string | null;
  /**
   * Blob hash at the same path on the current branch's pushed upstream, or
   * null when there is no upstream or the path is absent from it. Work that
   * is committed and pushed to its own branch is preserved even though it has
   * not reached main.
   */
  readonly upstreamBlob: string | null;
}

/**
 * True when the file's content is not recoverable from anything git has been
 * shown — i.e. the warning is genuine and the record really would be lost with
 * the directory.
 */
export function handoffIsAtRisk(e: PreservationEvidence): boolean {
  if (e.trackedHere) return false;
  if (e.mainBlob !== null && e.mainBlob === e.workingBlob) return false;
  if (e.upstreamBlob !== null && e.upstreamBlob === e.workingBlob) return false;
  return true;
}

/**
 * Why a file was cleared, for the operator reading the check's output. Returns
 * null when the file is at risk.
 */
export function preservationReason(e: PreservationEvidence): string | null {
  if (e.trackedHere) return "tracked on this branch";
  if (e.mainBlob !== null && e.mainBlob === e.workingBlob) return "identical copy on origin/main";
  if (e.upstreamBlob !== null && e.upstreamBlob === e.workingBlob) return "identical copy on this branch's upstream";
  return null;
}
