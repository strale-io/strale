/**
 * Auto-Remediation Engine — Sprint 7C
 *
 * 5 remediation rules applied to failing test suites:
 *   1. stale_date     (HIGH confidence)   → auto-update expired dates in test input
 *   2. dead_url       (MEDIUM confidence)  → replace dead URLs with known-good fallbacks
 *   3. field_rename   (MEDIUM confidence)  → auto-apply if single match in output schema
 *   4. field_removal  (LOW confidence)     → propose only, logged for manual review
 *   5. schema_drift   (LOW confidence)     → propose only, logged for manual review
 *
 * Confidence thresholds:
 *   HIGH   → auto-apply immediately
 *   MEDIUM → auto-apply if single unambiguous match
 *   LOW    → propose only (log to auto_remediation_log)
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { testSuites, testResults, capabilities } from "../db/schema.js";
import type { FailureClassification } from "./failure-classifier.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RemediationRule =
  | "stale_date"
  | "dead_url"
  | "field_rename"
  | "field_removal"
  | "schema_drift";

export type RemediationConfidence = "high" | "medium" | "low";

export interface RemediationAction {
  rule: RemediationRule;
  confidence: RemediationConfidence;
  description: string;
  applied: boolean;
  changes?: Record<string, unknown>;
}

interface RemediationLogEntry {
  timestamp: string;
  rule: RemediationRule;
  confidence: RemediationConfidence;
  applied: boolean;
  description: string;
  previousInput?: Record<string, unknown>;
  newInput?: Record<string, unknown>;
}

// ─── Date patterns ──────────────────────────────────────────────────────────

const DATE_FIELD_PATTERNS = /year|date|from_date|to_date|check_date|expires|valid_until|expiry/i;

// ─── Known-good fallback URLs per domain ────────────────────────────────────

const FALLBACK_URLS: Record<string, string> = {
  "example.com": "https://example.com",
  "httpbin.org": "https://httpbin.org/get",
  "jsonplaceholder.typicode.com": "https://jsonplaceholder.typicode.com/posts/1",
};

// ─── Rule implementations ───────────────────────────────────────────────────

/**
 * Rule 1: Stale Date — HIGH confidence, auto-apply.
 * Updates expired year/date fields in test input to current values.
 * Exported for use by self-heal.ts (inline remediation).
 */
export function checkStaleDate(
  input: Record<string, unknown>,
): RemediationAction | null {
  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().split("T")[0];
  const changes: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (!DATE_FIELD_PATTERNS.test(key)) continue;

    if (typeof value === "number" && value >= 2000 && value < currentYear) {
      changes[key] = currentYear;
    }

    if (typeof value === "string") {
      // YYYY format
      if (/^\d{4}$/.test(value) && parseInt(value, 10) < currentYear) {
        changes[key] = String(currentYear);
      }
      // YYYY-MM-DD format — shift to same month/day in current year
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value < today) {
        const monthDay = value.slice(4); // -MM-DD
        const updated = `${currentYear}${monthDay}`;
        // If the updated date is still in the past (e.g., Jan date in March),
        // just use today's date
        changes[key] = updated < today ? today : updated;
      }
    }
  }

  if (Object.keys(changes).length === 0) return null;

  return {
    rule: "stale_date",
    confidence: "high",
    description: `Updated stale date fields: ${Object.keys(changes).join(", ")}`,
    applied: true,
    changes,
  };
}

/**
 * Rule 2: Dead URL — MEDIUM confidence, auto-apply with fallback.
 * Replaces URLs in test input that point to unreachable hosts.
 * Exported for use by self-heal.ts (inline remediation).
 */
export function checkDeadUrl(
  input: Record<string, unknown>,
  failureReason: string,
): RemediationAction | null {
  // Only trigger on connection/DNS errors
  if (
    !/ECONNREFUSED|ENOTFOUND|fetch failed|ETIMEDOUT/i.test(failureReason)
  ) {
    return null;
  }

  const changes: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string" || !value.startsWith("http")) continue;

    try {
      const url = new URL(value);
      const fallback = FALLBACK_URLS[url.hostname];
      if (fallback && fallback !== value) {
        changes[key] = fallback;
      }
    } catch {
      // Not a valid URL — skip
    }
  }

  if (Object.keys(changes).length === 0) return null;

  return {
    rule: "dead_url",
    confidence: "medium",
    description: `Replaced dead URL(s): ${Object.keys(changes).join(", ")}`,
    applied: true,
    changes,
  };
}

/**
 * Rule 3: Field Rename — MEDIUM confidence, auto-apply if single match.
 * Detects when a validation check references a field that no longer exists
 * but a similarly-named field is present in the actual output.
 */
function checkFieldRename(
  validationRules: { checks: Array<{ field: string }> },
  actualOutput: Record<string, unknown> | null,
): RemediationAction | null {
  if (!actualOutput || !validationRules?.checks) return null;

  const outputKeys = flattenKeys(actualOutput);
  const changes: Record<string, string> = {};

  for (const check of validationRules.checks) {
    const field = check.field;
    // Field exists — no rename needed
    if (getNestedValue(actualOutput, field) !== undefined) continue;

    // Find similar field names (case-insensitive match, underscore/camelCase variants)
    const candidates = outputKeys.filter((k) => {
      const a = field.toLowerCase().replace(/[_-]/g, "");
      const b = k.toLowerCase().replace(/[_-]/g, "");
      return a === b && field !== k;
    });

    if (candidates.length === 1) {
      changes[field] = candidates[0];
    }
  }

  if (Object.keys(changes).length === 0) return null;

  return {
    rule: "field_rename",
    confidence: "medium",
    description: `Detected field rename(s): ${Object.entries(changes).map(([o, n]) => `${o} → ${n}`).join(", ")}`,
    applied: true,
    changes,
  };
}

/**
 * Rule 4: Field Removal — LOW confidence, propose only.
 * Detects when validation checks reference fields that are completely absent
 * from actual output (no similar match found).
 */
function checkFieldRemoval(
  validationRules: { checks: Array<{ field: string }> },
  actualOutput: Record<string, unknown> | null,
): RemediationAction | null {
  if (!actualOutput || !validationRules?.checks) return null;

  const removedFields: string[] = [];

  for (const check of validationRules.checks) {
    if (getNestedValue(actualOutput, check.field) === undefined) {
      removedFields.push(check.field);
    }
  }

  if (removedFields.length === 0) return null;

  return {
    rule: "field_removal",
    confidence: "low",
    description: `Fields no longer in output: ${removedFields.join(", ")}`,
    applied: false,
    changes: { removed_fields: removedFields },
  };
}

/**
 * Rule 5: Schema Drift — LOW confidence, propose only.
 * Detects when actual output has new fields not in the capability's output_schema.
 */
function checkSchemaDrift(
  actualOutput: Record<string, unknown> | null,
  outputSchema: Record<string, unknown> | null,
): RemediationAction | null {
  if (!actualOutput || !outputSchema) return null;

  const schemaProperties = (outputSchema as { properties?: Record<string, unknown> }).properties;
  if (!schemaProperties) return null;

  const schemaKeys = new Set(Object.keys(schemaProperties));
  const newFields = Object.keys(actualOutput).filter((k) => !schemaKeys.has(k));

  if (newFields.length === 0) return null;

  return {
    rule: "schema_drift",
    confidence: "low",
    description: `New fields in output not in schema: ${newFields.join(", ")}`,
    applied: false,
    changes: { new_fields: newFields },
  };
}

// ─── Main remediation function ──────────────────────────────────────────────

/**
 * Analyze a failing test suite and apply/propose remediations.
 * Called by the health sweep for suites with recent failures.
 */
export async function analyzeAndRemediate(
  suite: typeof testSuites.$inferSelect,
): Promise<RemediationAction[]> {
  const db = getDb();
  const input = suite.input as Record<string, unknown>;
  const validationRules = suite.validationRules as { checks: Array<{ field: string; operator: string; value?: unknown }> };
  const lastCls = suite.lastClassification as { verdict: FailureClassification; reason: string } | null;

  if (!lastCls) return [];

  // Get the most recent actual output for field analysis
  const [latestResult] = await db
    .select({
      actualOutput: testResults.actualOutput,
      failureReason: testResults.failureReason,
    })
    .from(testResults)
    .where(eq(testResults.testSuiteId, suite.id))
    .orderBy(eq(testResults.executedAt, testResults.executedAt)) // most recent
    .limit(1);

  const actualOutput = (latestResult?.actualOutput ?? null) as Record<string, unknown> | null;
  const failureReason = latestResult?.failureReason ?? lastCls.reason ?? "";

  // Get capability output_schema for drift detection
  const [cap] = await db
    .select({ outputSchema: capabilities.outputSchema })
    .from(capabilities)
    .where(eq(capabilities.slug, suite.capabilitySlug))
    .limit(1);

  const outputSchema = (cap?.outputSchema ?? null) as Record<string, unknown> | null;

  const actions: RemediationAction[] = [];

  // Rule 1: Stale date (HIGH — auto-apply)
  if (lastCls.verdict === "stale_input") {
    const action = checkStaleDate(input);
    if (action) actions.push(action);
  }

  // Rule 2: Dead URL (MEDIUM — auto-apply with fallback)
  if (lastCls.verdict === "upstream_transient" || lastCls.verdict === "test_infrastructure") {
    const action = checkDeadUrl(input, failureReason);
    if (action) actions.push(action);
  }

  // Rule 3: Field rename (MEDIUM — auto-apply if single match)
  if (lastCls.verdict === "upstream_changed" || lastCls.verdict === "test_design") {
    const action = checkFieldRename(validationRules, actualOutput);
    if (action) actions.push(action);
  }

  // Rule 4: Field removal (LOW — propose only)
  if (lastCls.verdict === "upstream_changed" || lastCls.verdict === "test_design") {
    const action = checkFieldRemoval(validationRules, actualOutput);
    if (action) actions.push(action);
  }

  // Rule 5: Schema drift (LOW — propose only)
  if (actualOutput) {
    const action = checkSchemaDrift(actualOutput, outputSchema);
    if (action) actions.push(action);
  }

  return actions;
}

/**
 * Apply approved remediation actions to a test suite.
 * Only applies actions with applied=true. Logs all actions.
 */
export async function applyRemediation(
  suiteId: string,
  actions: RemediationAction[],
): Promise<void> {
  if (actions.length === 0) return;

  const db = getDb();

  // Get current suite
  const [suite] = await db
    .select()
    .from(testSuites)
    .where(eq(testSuites.id, suiteId))
    .limit(1);

  if (!suite) return;

  const input = { ...(suite.input as Record<string, unknown>) };
  const validationRules = suite.validationRules as { checks: Array<{ field: string; operator: string; value?: unknown; values?: unknown[] }> };
  let inputModified = false;
  let rulesModified = false;

  const logEntries: RemediationLogEntry[] = [];
  const previousInput = { ...input };

  for (const action of actions) {
    if (!action.applied || !action.changes) {
      // Log propose-only actions
      logEntries.push({
        timestamp: new Date().toISOString(),
        rule: action.rule,
        confidence: action.confidence,
        applied: false,
        description: action.description,
      });
      continue;
    }

    switch (action.rule) {
      case "stale_date": {
        // Update date fields in input
        for (const [key, value] of Object.entries(action.changes)) {
          input[key] = value;
        }
        inputModified = true;
        break;
      }

      case "dead_url": {
        // Replace URLs in input
        for (const [key, value] of Object.entries(action.changes)) {
          input[key] = value;
        }
        inputModified = true;
        break;
      }

      case "field_rename": {
        // Update field references in validation rules
        const renames = action.changes as Record<string, string>;
        if (validationRules?.checks) {
          for (const check of validationRules.checks) {
            if (check.field in renames) {
              check.field = renames[check.field];
              rulesModified = true;
            }
          }
        }
        break;
      }
    }

    logEntries.push({
      timestamp: new Date().toISOString(),
      rule: action.rule,
      confidence: action.confidence,
      applied: true,
      description: action.description,
      previousInput: inputModified ? previousInput : undefined,
      newInput: inputModified ? { ...input } : undefined,
    });
  }

  // Build update set
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (inputModified) {
    updates.input = input;
  }

  if (rulesModified) {
    updates.validationRules = validationRules;
  }

  // Append to remediation log
  const existingLog = (suite.autoRemediationLog ?? []) as RemediationLogEntry[];
  updates.autoRemediationLog = [...existingLog, ...logEntries];

  await db
    .update(testSuites)
    .set(updates)
    .where(eq(testSuites.id, suiteId));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    }
  }
  return keys;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
