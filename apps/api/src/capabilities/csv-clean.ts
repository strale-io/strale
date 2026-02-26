import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("csv-clean", async (input: CapabilityInput) => {
  const raw = ((input.csv as string) ?? (input.data as string) ?? (input.task as string) ?? "").trim();
  if (!raw) throw new Error("'csv' is required. Provide a CSV string to clean.");

  const issuesFixed: string[] = [];

  // Strip BOM
  let csv = raw;
  if (csv.charCodeAt(0) === 0xFEFF) {
    csv = csv.slice(1);
    issuesFixed.push("Removed BOM (Byte Order Mark)");
  }

  // Normalize line endings
  csv = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Detect delimiter
  const firstLines = csv.split("\n").slice(0, 5);
  const delimiter = detectDelimiter(firstLines);
  if (delimiter !== ",") {
    issuesFixed.push(`Detected delimiter: '${delimiter}' (converted to comma)`);
  }

  // Parse rows respecting quoted fields
  const rows = parseCSV(csv, delimiter);

  if (rows.length === 0) throw new Error("CSV has no data rows.");

  // Trim whitespace in all fields
  let trimmedCount = 0;
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const trimmed = row[i].trim();
      if (trimmed !== row[i]) trimmedCount++;
      row[i] = trimmed;
    }
  }
  if (trimmedCount > 0) issuesFixed.push(`Trimmed whitespace in ${trimmedCount} fields`);

  // Normalize column count (pad short rows, flag long rows)
  const maxCols = Math.max(...rows.map((r) => r.length));
  const headerCols = rows[0]?.length ?? 0;
  let paddedRows = 0;
  let truncatedRows = 0;
  for (const row of rows) {
    if (row.length < headerCols) {
      while (row.length < headerCols) row.push("");
      paddedRows++;
    } else if (row.length > headerCols && headerCols > 0) {
      // Trailing commas might cause extra empty fields
      while (row.length > headerCols && row[row.length - 1] === "") {
        row.pop();
        truncatedRows++;
      }
    }
  }
  if (paddedRows > 0) issuesFixed.push(`Padded ${paddedRows} short rows to match header`);
  if (truncatedRows > 0) issuesFixed.push(`Removed trailing empty columns from rows`);

  // Remove completely empty rows
  const nonEmptyRows = rows.filter((r) => r.some((f) => f !== ""));
  const removedEmpty = rows.length - nonEmptyRows.length;
  if (removedEmpty > 0) issuesFixed.push(`Removed ${removedEmpty} empty rows`);

  // Rebuild as standard CSV (comma-delimited, properly quoted)
  const cleanCsv = nonEmptyRows
    .map((row) =>
      row.map((field) => {
        if (field.includes(",") || field.includes('"') || field.includes("\n")) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      }).join(",")
    )
    .join("\n");

  return {
    output: {
      csv: cleanCsv,
      detected_delimiter: delimiter,
      row_count: nonEmptyRows.length,
      column_count: nonEmptyRows[0]?.length ?? 0,
      issues_fixed: issuesFixed,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function detectDelimiter(lines: string[]): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = 0;

  for (const delim of candidates) {
    const counts = lines.map((l) => {
      // Count occurrences outside quotes
      let count = 0;
      let inQuote = false;
      for (const ch of l) {
        if (ch === '"') inQuote = !inQuote;
        else if (ch === delim && !inQuote) count++;
      }
      return count;
    });
    // Good delimiter: consistent count across lines, and count > 0
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;
    const consistent = new Set(nonZero).size === 1;
    const score = nonZero[0] * (consistent ? 2 : 1) * nonZero.length;
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

function parseCSV(csv: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuote = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuote) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField);
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }
  // Last field/row
  currentRow.push(currentField);
  if (currentRow.some((f) => f !== "")) {
    rows.push(currentRow);
  }

  return rows;
}
