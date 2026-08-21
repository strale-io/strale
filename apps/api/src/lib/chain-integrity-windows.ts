/**
 * Known windows where the audit chain did not provide a property it normally
 * provides.
 *
 * This file exists so the knowledge does not live only in a pull request and
 * someone's memory. If a customer, an auditor or a future maintainer asks "was
 * this record's ordering evidenced in June 2026?", the answer has to come from
 * the system rather than from whoever happens to remember the incident.
 *
 * History is deliberately not rewritten. Recomputing the affected hashes would
 * erase the evidence that the break happened, which is the opposite of what an
 * audit chain is for — and a rewritten chain is a far worse thing for a
 * regulator to find than a documented break with a cause, a date and a fix.
 *
 * Adding an entry here is an admission, not a formality. Entries are permanent.
 */

export type ChainProperty =
  /** Row content is unaltered since it was hashed. */
  | "row_integrity"
  /** Rows are in a provable sequence, and none has been removed. */
  | "ordering_and_completeness";

export interface ChainIntegrityWindow {
  id: string;
  /** Inclusive start, ISO 8601. */
  from: string;
  /** Inclusive end, ISO 8601. Null while a window is still open. */
  to: string | null;
  /** What the chain did NOT provide during the window. */
  lost: ChainProperty[];
  cause: string;
  remedy: string;
  /** What a reader can still rely on, so the disclosure is not read as worse than it is. */
  unaffected: string;
}

export const CHAIN_INTEGRITY_WINDOWS: readonly ChainIntegrityWindow[] = [
  {
    id: "2026-05-04-null-completed-at-head",
    from: "2026-05-04T13:45:36.776Z",
    // Closed by the WP7 deploy, which moved head selection onto a monotonic
    // sequence assigned at hash time.
    to: "2026-08-21T12:10:22.625Z",
    lost: ["ordering_and_completeness"],
    cause:
      "Head selection ordered by completed_at DESC. PostgreSQL sorts NULLs " +
      "first under DESC, so a health-probe row written with a null completed_at " +
      "occupied the head position permanently and every subsequent batch linked " +
      "to it. The chain became a star with one parent and 150,719 children. A " +
      "star has no sequence, so it cannot evidence ordering or the absence of a " +
      "deletion.",
    remedy:
      "The head is now the last row the hashing worker actually processed, read " +
      "from a monotonic sequence assigned at hash time, so no wall-clock column " +
      "can capture it. The probe endpoint that produced the offending rows no " +
      "longer leaves them behind. A daily branch-topology check reports any new " +
      "fork.",
    unaffected:
      "Per-row integrity. Each row's hash still covers its own content and its " +
      "stored parent, so alteration of an individual record remains detectable " +
      "throughout the window; a 300-row sample verified 99.7% for records inside " +
      "the 90-day content-retention horizon. The exceptions are rows whose " +
      "content was zeroed by the 90-day GDPR redaction, which is by design and " +
      "is separately disclosed by /v1/verify.",
  },
];

/** Windows overlapping an instant — used to qualify a verification result. */
export function windowsCovering(at: Date): ChainIntegrityWindow[] {
  const t = at.getTime();
  return CHAIN_INTEGRITY_WINDOWS.filter((w) => {
    const from = Date.parse(w.from);
    const to = w.to ? Date.parse(w.to) : Number.POSITIVE_INFINITY;
    return t >= from && t <= to;
  });
}

/** True when ordering cannot be evidenced for a record created at this instant. */
export function orderingEvidenceUnavailable(at: Date): boolean {
  return windowsCovering(at).some((w) =>
    w.lost.includes("ordering_and_completeness"),
  );
}

/**
 * Customer-facing disclosure text for a record inside a known window.
 *
 * DRAFT — deliberately not wired into any response. `/v1/verify` already
 * discloses redaction, and this is written in the same register: state what is
 * unavailable, state what remains true, name the cause and the fix, and do not
 * editorialise. But it is a claim about the reliability of an audit trail, and
 * the charter puts regulator-facing claims with the founder rather than with
 * the platform. This function exists so the wording can be read and approved as
 * a concrete thing rather than described in the abstract.
 */
export function orderingDisclosureText(at: Date): string | null {
  const window = windowsCovering(at).find((w) =>
    w.lost.includes("ordering_and_completeness"),
  );
  if (!window) return null;

  return (
    "This record was created during a period when Strale's audit chain did not " +
    "evidence ordering. Between " +
    window.from.slice(0, 10) +
    " and " +
    (window.to ?? "").slice(0, 10) +
    ", a defect in how the chain's head was selected caused newly hashed records " +
    "to link to the same predecessor rather than forming a sequence. The record " +
    "itself is intact: its content hash still covers its own data and its recorded " +
    "predecessor, so alteration of this record remains detectable. What cannot be " +
    "demonstrated for this period is the order of records relative to one another, " +
    "or that no record was removed. The defect was corrected on " +
    (window.to ?? "").slice(0, 10) +
    "; records created after that date carry full ordering evidence. Strale has " +
    "deliberately not recomputed the affected hashes, because doing so would remove " +
    "the evidence that the gap occurred."
  );
}
