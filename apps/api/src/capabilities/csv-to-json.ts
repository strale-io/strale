import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("csv-to-json", async (input: CapabilityInput) => {
  const csvString = ((input.csv_string as string) ?? (input.csv as string) ?? (input.task as string) ?? "").trim();
  if (!csvString) throw new Error("'csv_string' is required.");

  const hasHeader = (input.has_header as boolean) ?? true;
  const explicitDelimiter = (input.delimiter as string) ?? null;

  // Auto-detect delimiter
  const firstLine = csvString.split("\n")[0];
  let delimiter = explicitDelimiter;
  if (!delimiter) {
    const tabCount = (firstLine.match(/\t/g) ?? []).length;
    const semiCount = (firstLine.match(/;/g) ?? []).length;
    const commaCount = (firstLine.match(/,/g) ?? []).length;
    const pipeCount = (firstLine.match(/\|/g) ?? []).length;
    const counts: [string, number][] = [["\t", tabCount], [";", semiCount], [",", commaCount], ["|", pipeCount]];
    counts.sort((a, b) => b[1] - a[1]);
    delimiter = counts[0][1] > 0 ? counts[0][0] : ",";
  }

  const lines = csvString.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("CSV is empty.");

  const parseLine = (line: string): string[] => {
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
  };

  let columns: string[];
  let dataLines: string[];

  if (hasHeader) {
    columns = parseLine(lines[0]);
    dataLines = lines.slice(1);
  } else {
    const firstParsed = parseLine(lines[0]);
    columns = firstParsed.map((_, i) => `column_${i}`);
    dataLines = lines;
  }

  const data = dataLines.map((line) => {
    const values = parseLine(line);
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      const val = values[i] ?? "";
      // Auto-type: numbers and booleans
      if (/^-?\d+$/.test(val)) row[col] = parseInt(val, 10);
      else if (/^-?\d+\.\d+$/.test(val)) row[col] = parseFloat(val);
      else if (val.toLowerCase() === "true") row[col] = true;
      else if (val.toLowerCase() === "false") row[col] = false;
      else row[col] = val;
    });
    return row;
  });

  return {
    output: {
      data,
      columns,
      row_count: data.length,
      detected_delimiter: delimiter === "\t" ? "tab" : delimiter,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
