import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("log-parse", async (input: CapabilityInput) => {
  const logs = ((input.logs as string) ?? (input.log as string) ?? (input.task as string) ?? "").trim();
  if (!logs) throw new Error("'logs' (log text to parse) is required.");

  const lines = logs.split("\n").filter(l => l.trim());

  const patterns: Record<string, RegExp> = {
    iso_bracket: /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*\[(\w+)\]\s*(.*)/,
    iso_space: /^(\d{4}-\d{2}-\d{2}\s+[\d:]+(?:\.\d+)?)\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\s+(.*)/i,
    syslog: /^(\w{3}\s+\d+\s+[\d:]+)\s+(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s*(.*)/,
    laravel: /^\[(\d{4}-\d{2}-\d{2}\s+[\d:]+)\]\s+\w+\.(\w+):\s*(.*)/,
    logfmt: /level=(\w+)\s+ts=(\S+)\s+msg="([^"]*)"/,
    json_log: /^\s*\{.*"(?:level|severity)".*\}/,
  };

  interface ParsedLine {
    line_number: number;
    raw: string;
    timestamp?: string;
    level?: string;
    message?: string;
    source?: string;
    pid?: string;
    format?: string;
  }

  const parsed: ParsedLine[] = [];
  const levels: Record<string, number> = {};
  let detectedFormat = "unknown";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const entry: ParsedLine = { line_number: i + 1, raw: line };

    if (patterns.json_log.test(line)) {
      try {
        const j = JSON.parse(line);
        entry.timestamp = j.timestamp ?? j.ts ?? j.time;
        entry.level = (j.level ?? j.severity ?? "").toUpperCase();
        entry.message = j.message ?? j.msg ?? j.error;
        entry.format = "json";
        detectedFormat = "json";
      } catch { /* fall through */ }
    }

    if (!entry.format) {
      for (const [fmt, re] of Object.entries(patterns)) {
        if (fmt === "json_log") continue;
        const m = line.match(re);
        if (m) {
          if (fmt === "logfmt") {
            entry.level = m[1].toUpperCase();
            entry.timestamp = m[2];
            entry.message = m[3];
          } else if (fmt === "syslog") {
            entry.timestamp = m[1];
            entry.source = m[2] + (m[3] ? `/${m[3]}` : "");
            if (m[4]) entry.pid = m[4];
            entry.message = m[5];
          } else {
            entry.timestamp = m[1];
            entry.level = m[2]?.toUpperCase();
            entry.message = m[3];
          }
          entry.format = fmt;
          detectedFormat = fmt;
          break;
        }
      }
    }

    if (!entry.format) {
      entry.message = line;
      entry.format = "unknown";
    }

    if (entry.level) {
      levels[entry.level] = (levels[entry.level] ?? 0) + 1;
    }

    parsed.push(entry);
  }

  const errors = parsed.filter(p => p.level === "ERROR" || p.level === "FATAL");
  const warnings = parsed.filter(p => p.level === "WARN" || p.level === "WARNING");

  return {
    output: {
      total_lines: lines.length,
      detected_format: detectedFormat,
      level_counts: levels,
      error_count: errors.length,
      warning_count: warnings.length,
      errors: errors.slice(0, 50),
      warnings: warnings.slice(0, 20),
      parsed_sample: parsed.slice(0, 10),
      time_range: {
        first: parsed.find(p => p.timestamp)?.timestamp ?? null,
        last: [...parsed].reverse().find(p => p.timestamp)?.timestamp ?? null,
      },
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
