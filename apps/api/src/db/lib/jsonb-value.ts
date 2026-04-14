/**
 * Guard for reading JSONB column values off raw `db.execute(sql`...`)` rows.
 *
 * Background: raw `db.execute(sql`...`)` bypasses Drizzle's typed-column
 * parser, so JSONB values can arrive as JSON strings (postgres-js driver
 * default) rather than parsed objects. Spreading a string with
 * `{ ...value }` produces a char-indexed object
 * (`{"0":"{","1":"\"",...}`), which then gets persisted as a corrupted
 * JSONB value. This is the exact shape repaired by
 * `scripts/fix-corrupted-output-schemas.ts`.
 *
 * Always call `readJsonbObject()` before spreading a JSONB value that
 * came from a raw SQL query. It returns an object, never a string.
 */
export function readJsonbObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      throw new Error(`Expected object JSONB, got ${typeof parsed}`);
    } catch (e) {
      throw new Error(
        `Failed to parse JSONB string: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    // Detect a char-indexed object (corrupted shape from prior spread-on-string
    // bug). Fail loudly so a caller that reads already-corrupted data doesn't
    // silently compound the corruption.
    const obj = value as Record<string, unknown>;
    if ("0" in obj && "1" in obj && !("type" in obj) && !("properties" in obj)) {
      throw new Error(
        "JSONB value appears to be char-indexed (corrupted from a prior spread-on-string bug). " +
        "Run scripts/fix-corrupted-output-schemas.ts --apply to repair before retrying.",
      );
    }
    return obj;
  }
  throw new Error(`Unexpected JSONB value type: ${typeof value}`);
}
