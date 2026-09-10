/**
 * The one mapping from a manifest's known_answer `expected_fields` to the
 * `validation_rules.checks` a test suite row carries.
 *
 * Two writers build these rows: `scripts/onboard.ts` at insert time and
 * `scripts/sync-known-answer-fixtures.ts` when a reviewed manifest is pushed
 * back to the database. Each carried its own copy of the mapping, the second
 * one commented "same mapping onboard.ts uses" — the duplicated-rule shape
 * behind the 2026-09-10 solution-revival incident. One function now, and the
 * test fails if either writer grows a private copy again.
 *
 * `reliability` is authoring metadata and is deliberately not copied: the
 * runner never reads it from a row.
 */
import type { ManifestExpectedField } from "./capability-manifest-types.js";

export interface KnownAnswerCheck {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

export function expectedFieldsToChecks(fields: readonly ManifestExpectedField[]): KnownAnswerCheck[] {
  return fields.map((ef) => {
    const check: KnownAnswerCheck = { field: ef.field, operator: ef.operator };
    if (ef.value !== undefined) check.value = ef.value;
    if (ef.values !== undefined) check.values = ef.values;
    return check;
  });
}

/** One line per check, stable enough to compare two rule sets by string. */
export function describeCheck(c: KnownAnswerCheck): string {
  const v = c.value !== undefined ? ` ${JSON.stringify(c.value)}` : c.values !== undefined ? ` ${JSON.stringify(c.values)}` : "";
  return `${c.field} ${c.operator}${v}`;
}

/**
 * What replacing `current` (a row's `validation_rules`, any shape) with `next`
 * would remove and add. Used by the sync script's dry run so an operator sees
 * the assertions a production write drops before making it.
 */
export function diffChecks(current: unknown, next: readonly KnownAnswerCheck[]): { removed: string[]; added: string[]; kept: number } {
  const raw = (current as { checks?: unknown } | null | undefined)?.checks;
  const before = (Array.isArray(raw) ? raw : [])
    .filter((c): c is KnownAnswerCheck => typeof c === "object" && c !== null && typeof (c as KnownAnswerCheck).field === "string")
    .map(describeCheck);
  const after = next.map(describeCheck);
  return {
    removed: before.filter((c) => !after.includes(c)),
    added: after.filter((c) => !before.includes(c)),
    kept: after.filter((c) => before.includes(c)).length,
  };
}
