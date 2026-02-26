import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("data-quality-check", async (input: CapabilityInput) => {
  const data = input.data as Array<Record<string, unknown>> | undefined;
  const rules = (input.rules as Array<{ field: string; check: string; min?: number; max?: number; pattern?: string }>) ?? [];

  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error("'data' (JSON array of objects) is required.");
  }

  const issues: Array<{ row_index: number; field: string; issue_type: string; value: unknown; expected: string }> = [];

  // Built-in checks
  const builtinChecks: Record<string, (value: unknown) => boolean> = {
    email_format: (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    url_format: (v) => typeof v === "string" && /^https?:\/\/.+/.test(v),
    not_empty: (v) => v !== null && v !== undefined && v !== "",
    is_number: (v) => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v.trim() !== ""),
    is_date: (v) => typeof v === "string" && !isNaN(Date.parse(v)),
    no_whitespace_padding: (v) => typeof v === "string" && v === v.trim(),
    is_boolean: (v) => typeof v === "boolean" || v === "true" || v === "false",
    is_uuid: (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    is_positive: (v) => typeof v === "number" && v > 0,
  };

  // Apply explicit rules
  for (const rule of rules) {
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const value = row[rule.field];

      if (rule.check === "range") {
        const num = typeof value === "number" ? value : Number(value);
        if (isNaN(num) || (rule.min !== undefined && num < rule.min) || (rule.max !== undefined && num > rule.max)) {
          issues.push({ row_index: i, field: rule.field, issue_type: "out_of_range", value, expected: `${rule.min ?? ""}..${rule.max ?? ""}` });
        }
      } else if (rule.check === "pattern" && rule.pattern) {
        if (typeof value !== "string" || !new RegExp(rule.pattern).test(value)) {
          issues.push({ row_index: i, field: rule.field, issue_type: "pattern_mismatch", value, expected: rule.pattern });
        }
      } else if (builtinChecks[rule.check]) {
        if (!builtinChecks[rule.check](value)) {
          issues.push({ row_index: i, field: rule.field, issue_type: rule.check, value, expected: rule.check });
        }
      }
    }
  }

  // Auto-detect issues if no explicit rules
  if (rules.length === 0) {
    const fieldNames = new Set<string>();
    for (const row of data) {
      for (const key of Object.keys(row)) fieldNames.add(key);
    }

    for (const field of fieldNames) {
      for (let i = 0; i < data.length; i++) {
        const value = data[i][field];
        if (value === null || value === undefined || value === "") {
          issues.push({ row_index: i, field, issue_type: "null_or_empty", value, expected: "non-empty" });
        } else if (typeof value === "string" && value !== value.trim()) {
          issues.push({ row_index: i, field, issue_type: "whitespace_padding", value, expected: "trimmed" });
        }
      }
    }
  }

  // Field-level report
  const allFields = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) allFields.add(key);
  }

  const fieldReport = Array.from(allFields).map((field) => {
    const values = data.map((r) => r[field]);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
    const uniqueSet = new Set(nonNull.map(String));
    return {
      field,
      completeness: Math.round((nonNull.length / data.length) * 100),
      unique_count: uniqueSet.size,
      null_count: values.length - nonNull.length,
    };
  });

  const validRows = data.length - new Set(issues.map((i) => i.row_index)).size;
  const qualityScore = data.length > 0 ? Math.round((validRows / data.length) * 100) : 0;

  return {
    output: {
      total_rows: data.length,
      valid_rows: validRows,
      invalid_rows: data.length - validRows,
      quality_score: qualityScore,
      issues: issues.slice(0, 200), // Cap output
      issue_count: issues.length,
      field_report: fieldReport,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
