/**
 * The measurement contract.
 *
 * Five business conclusions were wrong on 2026-08-15, none of them from a SQL
 * bug — every query returned exactly what it asked for. The failures were in
 * the framing: which rows counted, over what window, against an instrument old
 * enough to answer, read from which version of the code.
 *
 * The first draft of this contract returned `{ value, trustworthy: false }`.
 * Cross-provider review pointed out that this enforces nothing: `value` is
 * always present, so a caller renders it and the flag goes unread — which is
 * precisely how "1 paying customer" reached a dashboard. A discriminated union
 * makes the untrustworthy case *unreachable* without handling it, because
 * there is no `value` to read until you have narrowed the status.
 *
 * That is the whole idea. Everything else here is bookkeeping.
 */

/** A closed time interval, always explicit — never implied by a function name. */
export interface Window {
  from: Date;
  to: Date;
  /** Plain English, rendered to humans verbatim: "last 7 days", "since 15 Aug 11:00". */
  label: string;
}

/** Which rows were counted. Named once, never re-expressed as an inline filter. */
export type PopulationId =
  | "external_customers"    // excludes internal accounts (canonical helper)
  | "agent_visit_days"      // NOT agents — the id rotates daily by design
  | "monitor_visit_days"    // health checkers, indexers, scoring engines
  | "all_transactions";

/** Why a measurement could not be made. Each maps to one of the August failures. */
export type UnavailableReason =
  | { kind: "instrument_too_young"; instrument: string; enabledAt: Date | null }
  | { kind: "instrument_absent"; instrument: string }
  | { kind: "window_not_covered"; instrument: string; availableFrom: Date }
  | { kind: "steps_disagree"; detail: string }
  | { kind: "no_data" };

export interface InstrumentEvidence {
  id: string;
  /** When this instrument began recording. Null when we genuinely do not know. */
  enabledAt: Date | null;
  /** Fraction of eligible rows carrying it, 0–1. Undefined when not applicable. */
  coverage?: number;
}

/**
 * A measurement. Note there is no `value` on the `unavailable` arm: rendering a
 * number you were not entitled to requires deliberately inventing one.
 */
export type Measurement<T> =
  | {
      status: "observed";
      value: T;
      window: Window;
      population: PopulationId;
      instruments: InstrumentEvidence[];
      /** Plain English qualifier shown alongside the number, when one is needed. */
      caveat?: string;
    }
  | {
      status: "estimated";
      value: T;
      window: Window;
      population: PopulationId;
      /** How it was derived. Required — an estimate without a method is a guess. */
      methodology: string;
      instruments: InstrumentEvidence[];
      caveat?: string;
    }
  | {
      status: "unavailable";
      reason: UnavailableReason;
      requestedWindow: Window;
      /** The window that *could* be answered, when one exists. */
      availableWindow?: Window;
      population: PopulationId;
    };

/** Human-readable explanation of an unavailable measurement, for display. */
export function explainUnavailable(reason: UnavailableReason): string {
  switch (reason.kind) {
    case "instrument_too_young":
      return reason.enabledAt
        ? `we only started recording this on ${reason.enabledAt.toISOString().slice(0, 10)}`
        : "we have not been recording this long enough";
    case "instrument_absent":
      return `we do not record ${reason.instrument} yet`;
    case "window_not_covered":
      return `we can only answer this from ${reason.availableFrom.toISOString().slice(0, 10)}`;
    case "steps_disagree":
      return reason.detail;
    case "no_data":
      return "nothing happened in this period";
  }
}

/**
 * Render helper that cannot be bypassed by accident: callers must supply how to
 * format a real value, and get the caveat text for free. Exhaustive switch, so
 * a new status becomes a compile error rather than a silently unrendered case.
 */
export function renderMeasurement<T>(
  m: Measurement<T>,
  format: (value: T) => string,
  placeholder = "—",
): { text: string; note: string; trustworthy: boolean } {
  switch (m.status) {
    case "observed":
      return { text: format(m.value), note: m.caveat ?? "", trustworthy: true };
    case "estimated":
      return {
        text: format(m.value),
        note: m.caveat ? `${m.methodology}. ${m.caveat}` : m.methodology,
        trustworthy: false,
      };
    case "unavailable":
      return { text: placeholder, note: explainUnavailable(m.reason), trustworthy: false };
  }
}
