import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("schema-infer", async (input: CapabilityInput) => {
  const rawData = input.data;
  if (!rawData) throw new Error("'data' (JSON array or CSV string) is required.");

  let rows: Record<string, unknown>[];
  let formatDetected: string;

  if (typeof rawData === "string") {
    // Parse CSV
    const parsed = parseCsv(rawData.trim());
    rows = parsed;
    formatDetected = "csv";
  } else if (Array.isArray(rawData)) {
    rows = rawData as Record<string, unknown>[];
    formatDetected = "json";
  } else {
    throw new Error("'data' must be a JSON array or CSV string.");
  }

  if (rows.length === 0) throw new Error("Data is empty.");

  // Collect all field names
  const fieldNames = new Set<string>();
  for (const row of rows) {
    if (typeof row === "object" && row !== null) {
      for (const key of Object.keys(row)) fieldNames.add(key);
    }
  }

  const fields = Array.from(fieldNames).map((name) => {
    const values = rows.map((r) => (r as Record<string, unknown>)?.[name]).filter((v) => v !== undefined && v !== null && v !== "");
    const nullCount = rows.length - values.length;

    // Infer type
    const types = new Set(values.map((v) => {
      if (typeof v === "number") return "number";
      if (typeof v === "boolean") return "boolean";
      if (typeof v === "string") {
        if (/^-?\d+$/.test(v)) return "integer";
        if (/^-?\d+\.\d+$/.test(v)) return "number";
        if (v === "true" || v === "false") return "boolean";
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "date";
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "email";
        return "string";
      }
      if (Array.isArray(v)) return "array";
      if (typeof v === "object") return "object";
      return "unknown";
    }));

    const type = types.size === 1 ? [...types][0] : "mixed";
    const numericValues = values.filter((v) => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)))).map(Number);
    const uniqueValues = new Set(values.map(String));

    const field: Record<string, unknown> = {
      name,
      type,
      nullable: nullCount > 0,
      unique: uniqueValues.size === values.length && values.length > 0,
      completeness_percent: Math.round((values.length / rows.length) * 100),
      sample_values: values.slice(0, 5),
    };

    if (numericValues.length > 0) {
      field.min = Math.min(...numericValues);
      field.max = Math.max(...numericValues);
      field.mean = Math.round((numericValues.reduce((a, b) => a + b, 0) / numericValues.length) * 100) / 100;
    }

    return field;
  });

  return {
    output: {
      fields,
      total_rows: rows.length,
      total_fields: fields.length,
      format_detected: formatDetected,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function parseCsv(csv: string): Record<string, unknown>[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV must have at least a header row and one data row.");

  const delimiter = csv.includes("\t") ? "\t" : csv.includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += char;
  }
  result.push(current.trim());
  return result;
}
