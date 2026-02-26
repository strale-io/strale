import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("json-to-csv", async (input: CapabilityInput) => {
  const data = input.data ?? input.json;
  if (!data) {
    throw new Error("'data' is required. Provide a JSON array of objects to convert to CSV.");
  }

  let rows: Record<string, unknown>[];
  if (typeof data === "string") {
    try {
      rows = JSON.parse(data);
    } catch {
      throw new Error("'data' must be a valid JSON array of objects.");
    }
  } else if (Array.isArray(data)) {
    rows = data as Record<string, unknown>[];
  } else if (typeof data === "object") {
    rows = [data as Record<string, unknown>];
  } else {
    throw new Error("'data' must be a JSON array of objects.");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("'data' must be a non-empty array of objects.");
  }

  const delimiter = ((input.delimiter as string) ?? ",").charAt(0);
  const includeHeaders = input.include_headers !== false;

  // Collect all unique keys preserving order
  const keySet = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === "object") {
      for (const key of Object.keys(row)) {
        keySet.add(key);
      }
    }
  }
  const headers = Array.from(keySet);

  // Build CSV
  const lines: string[] = [];

  if (includeHeaders) {
    lines.push(headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter));
  }

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const fields = headers.map((h) => {
      const val = (row as Record<string, unknown>)[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return escapeCsvField(JSON.stringify(val), delimiter);
      return escapeCsvField(String(val), delimiter);
    });
    lines.push(fields.join(delimiter));
  }

  const csv = lines.join("\n");

  return {
    output: {
      csv,
      row_count: rows.length,
      column_count: headers.length,
      columns: headers,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function escapeCsvField(field: string, delimiter: string): string {
  if (field.includes(delimiter) || field.includes('"') || field.includes("\n") || field.includes("\r")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
