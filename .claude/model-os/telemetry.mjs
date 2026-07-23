#!/usr/bin/env node
// Privacy-bounded operational telemetry. This module stores only an explicit
// allowlist of identifiers, hashes, counters, timestamps, and reason codes.

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { appendBoundedJsonl, resolveStateDir } from "./state-store.mjs";

export const TELEMETRY_SCHEMA_VERSION = 1;
export const TELEMETRY_FILE = "runs.jsonl";
export const MAX_EVENT_BYTES = 4096;

const BASE_FIELDS = new Set(["schema_version", "id", "run_id", "at", "component", "event", "status"]);
const EVENT_FIELDS = new Map([
  ["selection.completed", ["duration_ms", "profile_hash", "selected_model", "route_id", "role", "effort", "fallback_count", "warning_count",
    "selection_basis", "task_fit", "evidence_confidence", "predicted_success", "expected_verified_tokens"]],
  ["selection.failed", ["duration_ms", "profile_hash", "reason_code"]],
  ["maintenance.started", ["reason_code"]],
  ["maintenance.completed", ["duration_ms", "counts", "reason_code"]],
  ["maintenance.failed", ["duration_ms", "reason_code"]],
  ["evaluation.completed", ["duration_ms", "candidate_id", "evidence_hash", "reason_code"]],
  ["evaluation.failed", ["duration_ms", "candidate_id", "reason_code"]],
  ["lifecycle.transitioned", ["candidate_id", "provider", "from_state", "to_state", "reason_code", "attempt_count", "retry_eligible", "evidence_ids"]],
  ["lifecycle.rejected", ["candidate_id", "provider", "from_state", "to_state", "reason_code"]],
  ["rumor.watched", ["provider", "watch_label", "claim_hash", "source_class"]],
  ["phase.plan.completed", ["phase_id", "selected_model", "status", "reason_code", "gross_savings_tokens", "net_savings_tokens", "overhead_tokens", "hysteresis_tokens", "switch_count"]],
  ["phase.plan.rejected", ["phase_id", "reason_code"]],
  ["phase.execution.completed", ["task_id", "phase_id", "action", "planned_model", "selected_model", "observed_model", "receipt_id",
    "reason_code", "gross_savings_tokens", "net_savings_tokens", "reported_tokens", "duration_ms", "fallback"]],
  ["phase.execution.failed", ["task_id", "phase_id", "action", "planned_model", "selected_model", "receipt_id", "reason_code", "duration_ms"]],
  ["task.evidence.completed", ["task_id", "receipt_count", "verified_passes", "verified_failures", "performance_group_count"]],
  ["quota.recovery.probed", ["resource_id", "route_id", "selected_model", "reason_code", "attempt_count", "retry_eligible"]],
  ["quota.recovery.detected", ["resource_id", "route_id", "selected_model", "reason_code", "attempt_count", "retry_eligible"]],
]);
const COMPONENTS = new Set(["selection", "maintenance", "evaluation", "lifecycle", "phase", "task", "quota"]);
const STATUSES = new Set(["started", "completed", "failed", "rejected", "stay", "switch", "watch"]);
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/|+_-]{0,239}$/;
const HASH = /^[a-f0-9]{64}$/;
const SENSITIVE = /(?:\bsk-[A-Za-z0-9_-]{8,}|\bgh[pousr]_[A-Za-z0-9]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}|\bxox[baprs]-[A-Za-z0-9-]{8,}|\bAKIA[A-Z0-9]{12,}|\bAIza[A-Za-z0-9_-]{12,}|bearer\s+|private\s+key|begin\s+[A-Z ]*private|password\s*[:=]|api[_ -]?key\s*[:=]|transcript|prompt\s*(?:text|content)?\s*[:=])/i;
// Same pattern as SENSITIVE, but global so sanitizeBoundedText redacts every occurrence, not just
// the first (SENSITIVE itself stays a plain .test()-only pattern for validateTelemetryEvent).
const SENSITIVE_GLOBAL = new RegExp(SENSITIVE.source, "gi");

function finiteNonNegative(value, name, integer = false) {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be a non-negative ${integer ? "integer" : "number"}`);
  }
}

function safeString(value, name, { hash = false, optional = false } = {}) {
  if (optional && value == null) return;
  if (typeof value !== "string" || !(hash ? HASH : SAFE_TOKEN).test(value) || SENSITIVE.test(value)) {
    throw new Error(`${name} must be a bounded safe ${hash ? "hash" : "identifier"}`);
  }
}

function validateCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 20) {
    throw new Error("counts must be an object with at most 20 entries");
  }
  for (const [key, count] of Object.entries(value)) {
    safeString(key, "counts key");
    finiteNonNegative(count, `counts.${key}`, true);
  }
}

export function validateTelemetryEvent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("telemetry event must be an object");
  const event = input.event;
  if (!EVENT_FIELDS.has(event)) throw new Error(`telemetry event '${event || "missing"}' is unsupported`);
  const allowed = new Set([...BASE_FIELDS, ...EVENT_FIELDS.get(event)]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`telemetry field '${key}' is not allowed`);
  const row = { schema_version: TELEMETRY_SCHEMA_VERSION, id: input.id || randomUUID(), ...input };
  if (row.schema_version !== TELEMETRY_SCHEMA_VERSION) throw new Error("telemetry schema version unsupported");
  safeString(row.id, "id");
  safeString(row.run_id, "run_id");
  if (typeof row.at !== "string" || !Number.isFinite(Date.parse(row.at))) throw new Error("at must be an ISO timestamp");
  if (!COMPONENTS.has(row.component)) throw new Error("component is unsupported");
  if (!STATUSES.has(row.status)) throw new Error("status is unsupported");
  for (const field of ["planned_model", "selected_model", "route_id", "role", "effort", "reason_code", "candidate_id", "provider",
    "from_state", "to_state", "task_id", "phase_id", "action", "observed_model", "receipt_id",
    "watch_label", "source_class", "selection_basis", "resource_id"]) {
    if (field in row) safeString(row[field], field, { optional: true });
  }
  for (const field of ["profile_hash", "evidence_hash", "claim_hash"]) {
    if (field in row) safeString(row[field], field, { hash: true, optional: true });
  }
  for (const field of ["duration_ms", "fallback_count", "warning_count", "attempt_count", "gross_savings_tokens",
    "net_savings_tokens", "overhead_tokens", "hysteresis_tokens", "switch_count", "task_fit", "evidence_confidence",
    "predicted_success", "expected_verified_tokens", "reported_tokens", "receipt_count", "verified_passes",
    "verified_failures", "performance_group_count"]) {
    if (field in row) finiteNonNegative(row[field], field, ["fallback_count", "warning_count", "attempt_count", "switch_count",
      "receipt_count", "verified_passes", "verified_failures", "performance_group_count"].includes(field));
  }
  if ("retry_eligible" in row && typeof row.retry_eligible !== "boolean") throw new Error("retry_eligible must be boolean");
  if ("fallback" in row && typeof row.fallback !== "boolean") throw new Error("fallback must be boolean");
  if ("counts" in row) validateCounts(row.counts);
  if ("evidence_ids" in row) {
    if (!Array.isArray(row.evidence_ids) || row.evidence_ids.length > 20) throw new Error("evidence_ids must contain at most 20 identifiers");
    row.evidence_ids.forEach((value) => safeString(value, "evidence_ids item"));
  }
  const bytes = Buffer.byteLength(JSON.stringify(row), "utf8");
  if (bytes > MAX_EVENT_BYTES) throw new Error(`telemetry event exceeds ${MAX_EVENT_BYTES} bytes`);
  return row;
}

export function appendTelemetryEvent(input, { stateDir = null, maxEntries = 2000 } = {}) {
  const row = validateTelemetryEvent(input);
  appendBoundedJsonl({ stateDir: resolveStateDir(stateDir), fileName: TELEMETRY_FILE, row, maxEntries });
  return row;
}

export function readTelemetry({ stateDir = null, maxRows = 2000 } = {}) {
  const file = path.join(resolveStateDir(stateDir), TELEMETRY_FILE);
  if (!existsSync(file)) return { rows: [], errors: [], file };
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.trim()).slice(-maxRows);
  const rows = [];
  const errors = [];
  lines.forEach((line, index) => {
    try { rows.push(validateTelemetryEvent(JSON.parse(line))); }
    catch (error) { errors.push(`line ${index + 1}: ${error.message}`); }
  });
  return { rows, errors, file };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => key !== "taskText" && key !== "task_text")
    .map((key) => [key, canonical(value[key])]));
}

export function hashOperationalValue(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function telemetryReason(error, fallback = "operation-failed") {
  const text = String(error?.message || error || "").toLowerCase();
  if (/schema|json|parse|invalid/.test(text)) return "invalid-state";
  if (/lock|busy|contention/.test(text)) return "lock-contention";
  if (/timeout|timed out/.test(text)) return "timeout";
  if (/auth/.test(text)) return "authentication-failed";
  if (/quota|exhaust/.test(text)) return "capacity-unavailable";
  return fallback;
}

// Bounded, redacted free text for stores that intentionally accept unstructured strings
// (dispatch receipts' reason/detail fields, outcomes.mjs notes) — unlike the structured
// telemetry event allowlist above, these fields legitimately hold provider error text, so
// this truncates and redacts rather than rejecting outright. Never throws: a receipt must
// still record that a failure happened even when the failure text itself is sensitive.
export function sanitizeBoundedText(text, { maxLength = 500 } = {}) {
  if (text == null) return null;
  const value = typeof text === "string" ? text : String(text);
  const redacted = value.replace(SENSITIVE_GLOBAL, "[redacted]");
  return redacted.length > maxLength ? redacted.slice(0, maxLength) : redacted;
}

export function telemetryEnabled(env = process.env) {
  return env.MODEL_OS_TELEMETRY !== "0";
}
