/**
 * Field selection for `scripts/sync-manifest-canonical-to-db.ts`.
 *
 * ## Why this exists
 *
 * The sync script pushed **every** manifest-canonical field in one `UPDATE`.
 * That is correct for the migration it was written for — a data-source change
 * drifts many fields at once — and wrong for everything else, because there
 * was no way to authorise a narrower mutation than "all of it".
 *
 * It bit on 2026-08-28. A one-line `input_schema` change (enums on
 * `image-resize`'s `format`/`fit`, min/max on `quality`) needed a production
 * sync. A read-only preflight showed the write would ALSO have replaced
 * `output_schema` — a pre-existing drift in the sample-output example, dating
 * to #98 and unrelated to the change being shipped. The script's own comment
 * already named this failure mode:
 *
 *   > a re-run happily overwrites a *genuinely newer* prod value with a stale
 *   > manifest one. That near-miss is exactly what happened with
 *   > google-search's output_schema during the #160 sync.
 *
 * A founder grant can only be as narrow as the tool it authorises. So the
 * scope moves into the tool: `--fields input_schema` mutates that column and
 * no other, and the selected set is echoed into the log so the authorisation
 * boundary is reconstructable afterwards.
 *
 * ## Why the write lives here and not in the script
 *
 * The script executes top-level against a live database and sits outside the
 * tsconfig graph, so a test cannot import it — which is why the parity gate
 * next door had to resort to a source scan. Anything left in the script is
 * therefore unprovable. `buildAssignments` and `applyAssignments` are here so
 * the tests drive the SAME code the script does, rather than a reimplementation
 * of it that could agree with the tests and disagree with production.
 */

/** How a value reaches the column: plain parameter, jsonb, or text[]. */
export type SyncValueKind = "plain" | "json" | "textArray";

export interface CanonicalSyncField {
  /** Column name, which is also the manifest key and the CLI token. */
  readonly column: string;
  readonly kind: SyncValueKind;
  /**
   * Whether a manifest may omit it.
   *
   * Mirrors `checkAuthorityDrift` exactly: ABSENT means "leave the DB alone",
   * while an explicit `null` is a declared value that writes NULL — which is
   * how a cost-class transition clears its old quota fields. `required: true`
   * fields are always compared and always written when selected.
   */
  readonly optional: boolean;
  /**
   * What an explicit `null` in the manifest means for THIS column.
   *
   * The old UPDATE was not uniform and the difference is load-bearing:
   * `name ?? dbRow.name` PRESERVED the DB value when the manifest said null,
   * while `cost_class !== undefined ? … : dbRow…` WROTE the null — which is how
   * a cost-class transition clears its old quota fields. Collapsing both into
   * "null is a declared value" silently broadened the blast radius on six
   * columns and could turn a preserved value into a NOT NULL failure.
   * Reviewer-found; the per-field behaviour is restored here.
   */
  readonly nullMeans: "write" | "preserve";
  /**
   * True for columns the authority taxonomy does NOT mark manifest-canonical.
   *
   * `transparency_tag` is db-canonical and `freshness_category` is hybrid. The
   * script has always been able to push them — it is the migration escape
   * hatch, and it prints a loud warning when it does — but they are not
   * manifest-canonical, so a caller has to name them explicitly and cannot
   * reach them through a taxonomy-derived selection by accident.
   */
  readonly nonCanonical?: true;
}

/**
 * Every manifest-canonical column this script may write.
 *
 * Kept in sync with `FIELD_CATEGORIES` (`category: "manifest"`) by
 * `sync-script-field-parity.test.ts`. `slug` is deliberately absent: it is the
 * row's identity and the WHERE key, never a value to overwrite.
 */
export const CANONICAL_SYNC_FIELDS: readonly CanonicalSyncField[] = [
  { column: "name", kind: "plain", optional: true, nullMeans: "preserve" },
  { column: "description", kind: "plain", optional: false, nullMeans: "write" },
  { column: "category", kind: "plain", optional: false, nullMeans: "write" },
  { column: "input_schema", kind: "json", optional: false, nullMeans: "write" },
  { column: "output_schema", kind: "json", optional: false, nullMeans: "write" },
  { column: "data_source", kind: "plain", optional: false, nullMeans: "write" },
  { column: "maintenance_class", kind: "plain", optional: true, nullMeans: "preserve" },
  { column: "transparency_tag", kind: "plain", optional: true, nullMeans: "preserve", nonCanonical: true },
  { column: "freshness_category", kind: "plain", optional: true, nullMeans: "preserve", nonCanonical: true },
  { column: "output_field_reliability", kind: "json", optional: true, nullMeans: "write" },
  { column: "processes_personal_data", kind: "plain", optional: true, nullMeans: "preserve" },
  { column: "personal_data_categories", kind: "textArray", optional: true, nullMeans: "write" },
  { column: "gdpr_art_22_classification", kind: "plain", optional: true, nullMeans: "preserve" },
  { column: "cost_class", kind: "plain", optional: true, nullMeans: "write" },
  { column: "quota_window", kind: "plain", optional: true, nullMeans: "write" },
  { column: "quota_cap", kind: "plain", optional: true, nullMeans: "write" },
  { column: "quota_reset_dom", kind: "plain", optional: true, nullMeans: "write" },
] as const;

export const CANONICAL_SYNC_FIELD_NAMES: readonly string[] = CANONICAL_SYNC_FIELDS.map(
  (f) => f.column,
);

/** Raised for a bad CLI selection. Carries an exit-worthy message. */
export class FieldSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldSelectionError";
  }
}

export interface FieldSelection {
  readonly fields: readonly string[];
  /** How the caller expressed it, for the audit line. */
  readonly mode: "explicit" | "all";
}

/**
 * Parse `--fields a,b` / `--all-fields` from argv.
 *
 * **Full sync is explicit.** Omitting both used to mean "write everything",
 * and a destructive default that fires when you say nothing is the wrong
 * default for a tool whose whole risk is writing more than you meant. Callers
 * that genuinely want the old behaviour say `--all-fields` and it is visible
 * in the log, the shell history and the audit line.
 */
export function parseFieldSelection(argv: readonly string[]): FieldSelection {
  const wantsAll = argv.includes("--all-fields");
  const all = argv
    .map((a, i) => (a === "--fields" || a.startsWith("--fields=") ? i : -1))
    .filter((i) => i !== -1);

  // Reviewer-found: `findIndex` took the first occurrence, so
  // `--fields=input_schema --fields=price_cents` succeeded and SILENTLY IGNORED
  // the second — narrow, but it falsifies "unknown field names are refused".
  // Two scopes is an ambiguous instruction; refuse rather than pick one.
  if (all.length > 1) {
    throw new FieldSelectionError("--fields was given more than once; pass a single list.");
  }
  const idx = all.length === 1 ? all[0]! : -1;

  if (wantsAll && idx !== -1) {
    throw new FieldSelectionError(
      "Pass either --fields <list> or --all-fields, not both.",
    );
  }

  if (wantsAll) {
    return { fields: CANONICAL_SYNC_FIELD_NAMES, mode: "all" };
  }

  if (idx === -1) {
    throw new FieldSelectionError(
      "Refusing to write without an explicit field scope.\n" +
        "  Narrow (preferred):  --fields input_schema\n" +
        "  Everything:          --all-fields\n" +
        `  Allowed fields: ${CANONICAL_SYNC_FIELD_NAMES.join(", ")}`,
    );
  }

  const token = argv[idx]!;
  const raw = token.startsWith("--fields=") ? token.slice("--fields=".length) : argv[idx + 1];

  if (raw === undefined || raw.startsWith("--")) {
    throw new FieldSelectionError("--fields requires a comma-separated list of field names.");
  }

  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (requested.length === 0) {
    throw new FieldSelectionError("--fields was given an empty list; nothing to sync.");
  }

  const unknown = requested.filter((f) => !CANONICAL_SYNC_FIELD_NAMES.includes(f));
  if (unknown.length > 0) {
    throw new FieldSelectionError(
      `Not manifest-canonical field(s): ${unknown.join(", ")}.\n` +
        `  Allowed: ${CANONICAL_SYNC_FIELD_NAMES.join(", ")}`,
    );
  }

  // Deduplicate but keep the caller's order, so the audit line reads back as
  // what was typed.
  const seen = new Set<string>();
  const fields = requested.filter((f) => (seen.has(f) ? false : (seen.add(f), true)));
  return { fields, mode: "explicit" };
}

export interface Assignment {
  readonly column: string;
  readonly kind: SyncValueKind;
  readonly value: unknown;
}

/**
 * The columns to write, derived from the selection ALONE.
 *
 * Two properties this must hold, and the tests state both:
 *
 *  - it never returns a column outside `selected` — there is no path that
 *    falls back to "all fields";
 *  - a selected field the manifest OMITS is skipped rather than written as
 *    undefined, matching the absent-means-leave-alone rule.
 */
export function buildAssignments(
  selected: readonly string[],
  manifest: Readonly<Record<string, unknown>>,
): Assignment[] {
  const selectedSet = new Set(selected);
  const assignments: Assignment[] = [];

  for (const field of CANONICAL_SYNC_FIELDS) {
    if (!selectedSet.has(field.column)) continue;

    const value = manifest[field.column];
    // Absent from the manifest: leave the DB value alone.
    if (value === undefined) continue;
    // Explicit null: written only for the columns whose old behaviour wrote it.
    if (value === null && field.nullMeans === "preserve") continue;

    assignments.push({ column: field.column, kind: field.kind, value });
  }

  return assignments;
}

/** Columns a selection asked for but the manifest does not declare. */
export function unwritableSelected(
  selected: readonly string[],
  manifest: Readonly<Record<string, unknown>>,
): string[] {
  return selected.filter((f) => manifest[f] === undefined);
}

/**
 * A postgres.js-shaped client. Narrowed to what this needs so a test can pass
 * a real connection without dragging the driver's full type surface in.
 */
export interface SqlLike {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> & {
    then: Promise<unknown[]>["then"];
  };
  json(value: unknown): unknown;
  array(value: unknown, oid?: number): unknown;
  unsafe(query: string, params?: unknown[]): Promise<unknown[]>;
}

/** postgres OID for text[]. */
const TEXT_ARRAY_OID = 1009;

/**
 * Execute the UPDATE for exactly these assignments.
 *
 * The SET list is built from `assignments` and nothing else. There is no
 * template listing every column, so "forgot to filter" cannot produce a
 * full-table overwrite — the failure mode would be an empty SET, which is
 * refused above rather than silently widened.
 */
export async function applyAssignments(
  sql: SqlLike,
  slug: string,
  assignments: readonly Assignment[],
): Promise<number> {
  if (assignments.length === 0) {
    throw new FieldSelectionError("Refusing to run an UPDATE with no columns to set.");
  }

  // REVALIDATE at the sink, not only at the CLI.
  //
  // `Assignment.column` is a string, and this function is exported. A caller
  // that hand-built `{ column: "description = description, price_cents" }`
  // would otherwise produce a valid SET clause that writes a column nobody
  // authorised. The CLI path cannot do this — buildAssignments rematerialises
  // names from constants — but the sink is the thing that concatenates, so the
  // sink is where the check belongs. Reviewer-found.
  const illegal = assignments.filter((a) => !CANONICAL_SYNC_FIELD_NAMES.includes(a.column));
  if (illegal.length > 0) {
    throw new FieldSelectionError(
      `Refusing to write non-canonical column(s): ${illegal.map((a) => a.column).join(", ")}.`,
    );
  }

  // Column names come from CANONICAL_SYNC_FIELDS, never from user input — the
  // selection is validated against that list before reaching here — so they
  // are safe to interpolate. Values are always bound parameters.
  //
  // The casts are load-bearing, not decoration. Passing a JSON string as an
  // untyped parameter into a jsonb column stores it DOUBLE-ENCODED: the column
  // ends up holding the string `"{\"type\":\"object\"…}"` rather than the
  // object. The unit tests could not see this — they inspect the SQL that gets
  // built, not what the database ends up containing — and it took the
  // real-Postgres integration test to surface it. `::jsonb` makes the server
  // parse the text, and `::text[]` does the same job for the array column.
  const setSql = assignments
    .map((a, i) => {
      const p = `$${i + 2}`;
      if (a.kind === "json") return `${a.column} = ${p}::jsonb`;
      if (a.kind === "textArray") return `${a.column} = ${p}::text[]`;
      return `${a.column} = ${p}`;
    })
    .join(", ");
  // Pass the OBJECT, never a pre-stringified JSON string.
  //
  // Measured against a real Postgres 17: `JSON.stringify(value)` as the
  // parameter stores the value DOUBLE-ENCODED — the column ends up holding the
  // JSON *string* `"{\"type\":\"object\"…}"` rather than the object — with or
  // without a ::jsonb cast, because postgres.js serialises what it is given.
  // Handing it the object lets it serialise exactly once. A JS array likewise
  // binds correctly to text[] on its own.
  //
  // The unit tests could not see this: they read the SQL that gets built, not
  // what the database ends up containing. The real-Postgres integration test is
  // what caught it, twice — the first fix (adding the cast) was still wrong.
  const params = assignments.map((a) => a.value);

  const rows = await sql.unsafe(
    `UPDATE capabilities SET ${setSql} WHERE slug = $1 RETURNING slug`,
    [slug, ...params],
  );
  return rows.length;
}

/** Every column name this module could ever write. Used by the guard test. */
export function writableColumns(): readonly string[] {
  return CANONICAL_SYNC_FIELD_NAMES;
}

export { TEXT_ARRAY_OID };
