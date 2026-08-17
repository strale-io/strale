/**
 * Pure matching/repair logic for scripts/repair-limitation-titles.ts,
 * extracted so it can be unit-tested — apps/api/scripts is outside
 * vitest's include glob (vitest.config.ts only picks up test files under
 * src/ and test/), which is exactly why this had no test coverage before
 * the Codex review caught the counting bug below.
 *
 * Nothing here touches the DB or the filesystem — every function takes
 * already-loaded data and returns a plan or a new value. The script owns
 * all I/O (loading manifests, running queries, deciding transaction
 * boundaries); this module owns the "given this data, what needs fixing"
 * logic.
 */

const COERCED_MISSING_TITLE_VALUES = new Set(["undefined", "null", "NaN"]);

/** True if `title` is JS null/undefined, empty/whitespace-only, or one of
 *  the known JS-coercion artifacts — i.e. "this isn't a real title". */
export function looksLikeMissingTitle(title: unknown): boolean {
  if (title === null || title === undefined) return true;
  if (typeof title !== "string") return false;
  const trimmed = title.trim();
  return trimmed === "" || COERCED_MISSING_TITLE_VALUES.has(trimmed);
}

export interface ManifestLimitation {
  title?: string | null;
  text: string;
  [k: string]: unknown;
}

/** Find the manifest limitation matching `text` for `slug`. Returns
 *  undefined if no manifest, no limitations array, or no text match. */
export function findManifestMatch(
  manifestLims: Map<string, ManifestLimitation[]>,
  slug: string,
  text: string,
): { match: ManifestLimitation | undefined; ambiguous: boolean } {
  const lims = manifestLims.get(slug);
  if (!lims) return { match: undefined, ambiguous: false };
  const norm = (s: string) => s.trim();
  const matches = lims.filter((l) => norm(l.text ?? "") === norm(text));
  return { match: matches[0], ambiguous: matches.length > 1 };
}

export interface RelationalRow {
  id: string;
  capability_slug: string;
  title: string | null;
  limitation_text: string;
}

export interface RelationalAction {
  rowId: string;
  slug: string;
  text: string;
  oldTitle: string | null;
  newTitle: string;
}

export interface UnrepairableEntry {
  slug: string;
  text: string;
  reason: string;
}

export interface RelationalPlan {
  actions: RelationalAction[];
  unrepairable: UnrepairableEntry[];
}

/** Pure: given rows already filtered to title='undefined', decide which
 *  are repairable from the manifest and which aren't. Does not touch the
 *  DB — the caller applies `actions` with its own CAS-guarded UPDATE. */
export function planRelationalRepairs(
  rows: RelationalRow[],
  manifestLims: Map<string, ManifestLimitation[]>,
  warn: (msg: string) => void = () => {},
): RelationalPlan {
  const actions: RelationalAction[] = [];
  const unrepairable: UnrepairableEntry[] = [];

  for (const row of rows) {
    const { match, ambiguous } = findManifestMatch(manifestLims, row.capability_slug, row.limitation_text);
    if (ambiguous) {
      warn(`${row.capability_slug}: multiple manifest limitations share the same text — using the first match`);
    }
    if (!match) {
      unrepairable.push({
        slug: row.capability_slug,
        text: row.limitation_text,
        reason: "no matching manifest limitation found (by slug + text)",
      });
      continue;
    }
    if (looksLikeMissingTitle(match.title)) {
      unrepairable.push({
        slug: row.capability_slug,
        text: row.limitation_text,
        reason: `manifest source also lacks a title (manifest title=${JSON.stringify(match.title ?? null)})`,
      });
      continue;
    }
    actions.push({
      rowId: row.id,
      slug: row.capability_slug,
      text: row.limitation_text,
      oldTitle: row.title,
      newTitle: match.title!,
    });
  }

  return { actions, unrepairable };
}

export interface JsonbRepairEntry {
  index: number;
  text: string;
  oldTitle: string;
  newTitle: string;
}

export interface JsonbRepairResult {
  /** A full copy of the input array with repairable entries fixed. Never
   *  mutates the array passed in. */
  newArray: Array<Record<string, unknown>>;
  /** Count of entries with title === "undefined" in the ORIGINAL array,
   *  computed before any mutation. This is the count that must be
   *  reported — computing it from `newArray` after repairs are applied
   *  would read back zero on a fully-repairable input, which is exactly
   *  the bug this function exists to make impossible (Codex review,
   *  2026-08-18: the original script counted after mutating in place). */
  affectedCount: number;
  repaired: JsonbRepairEntry[];
  unrepairable: Array<{ index: number; text: string; reason: string }>;
}

/**
 * Pure: given one capability's `onboarding_manifest -> 'limitations'`
 * array, find every entry with `title === "undefined"` and repair the
 * ones with a matching manifest title. Never mutates `arr` — returns a
 * new array. `affectedCount` is always computed from the pre-mutation
 * scan, independent of how many entries actually got repaired.
 */
export function repairJsonbLimitationsArray(
  arr: ReadonlyArray<Record<string, unknown>>,
  slug: string,
  manifestLims: Map<string, ManifestLimitation[]>,
  warn: (msg: string) => void = () => {},
): JsonbRepairResult {
  // Count BEFORE any mutation — see the affectedCount doc comment above.
  const affectedIndices: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]?.title === "undefined") affectedIndices.push(i);
  }

  const newArray = arr.map((entry) => ({ ...entry }));
  const repaired: JsonbRepairEntry[] = [];
  const unrepairable: JsonbRepairResult["unrepairable"] = [];

  for (const i of affectedIndices) {
    const entry = arr[i];
    const text = String(entry.text ?? "");
    const { match, ambiguous } = findManifestMatch(manifestLims, slug, text);
    if (ambiguous) {
      warn(`${slug} (onboarding_manifest): multiple manifest limitations share the same text — using the first match`);
    }
    if (!match) {
      unrepairable.push({ index: i, text, reason: "no matching manifest limitation found (by slug + text)" });
      continue;
    }
    if (looksLikeMissingTitle(match.title)) {
      unrepairable.push({
        index: i,
        text,
        reason: `manifest source also lacks a title (manifest title=${JSON.stringify(match.title ?? null)})`,
      });
      continue;
    }
    newArray[i] = { ...entry, title: match.title! };
    repaired.push({ index: i, text, oldTitle: entry.title as string, newTitle: match.title! });
  }

  return { newArray, affectedCount: affectedIndices.length, repaired, unrepairable };
}
