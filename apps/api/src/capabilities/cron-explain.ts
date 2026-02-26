import { registerCapability, type CapabilityInput } from "./index.js";

const FIELD_NAMES = ["minute", "hour", "day of month", "month", "day of week"];
const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

registerCapability("cron-explain", async (input: CapabilityInput) => {
  const cronExpression = ((input.cron_expression as string) ?? (input.cron as string) ?? (input.task as string) ?? "").trim();
  if (!cronExpression) throw new Error("'cron_expression' is required.");

  const timezone = ((input.timezone as string) ?? "UTC").trim();
  const numNext = Math.min((input.num_next as number) ?? 5, 20);

  const parts = cronExpression.split(/\s+/);
  if (parts.length < 5 || parts.length > 7) {
    return {
      output: { cron_expression: cronExpression, is_valid: false, error: "Cron expression must have 5-7 fields." },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  // Validate and explain each field
  const explanation = explainCron(parts);
  const nextRuns = getNextRuns(parts, numNext);

  return {
    output: {
      cron_expression: cronExpression,
      is_valid: true,
      explanation,
      timezone,
      next_runs: nextRuns.map((d) => d.toISOString()),
      field_breakdown: parts.slice(0, 5).map((p, i) => ({
        field: FIELD_NAMES[i],
        value: p,
        meaning: explainField(p, i),
      })),
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function explainCron(parts: string[]): string {
  const [min, hour, dom, month, dow] = parts;
  const pieces: string[] = [];

  // Time
  if (min === "*" && hour === "*") {
    pieces.push("Every minute");
  } else if (min.includes("/")) {
    const interval = min.split("/")[1];
    pieces.push(`Every ${interval} minutes`);
  } else if (hour === "*") {
    pieces.push(`At minute ${min} of every hour`);
  } else if (min === "0" && !hour.includes(",") && !hour.includes("/") && !hour.includes("-")) {
    pieces.push(`At ${hour}:00`);
  } else {
    pieces.push(`At ${hour}:${min.padStart(2, "0")}`);
  }

  // Day of month
  if (dom !== "*" && dom !== "?") {
    if (dom.includes(",")) {
      pieces.push(`on days ${dom} of the month`);
    } else if (dom.includes("-")) {
      pieces.push(`on days ${dom} of the month`);
    } else if (dom.includes("/")) {
      pieces.push(`every ${dom.split("/")[1]} days`);
    } else {
      pieces.push(`on day ${dom} of the month`);
    }
  }

  // Month
  if (month !== "*") {
    if (month.includes(",")) {
      const months = month.split(",").map((m) => MONTH_NAMES[Number(m)] ?? m);
      pieces.push(`in ${months.join(", ")}`);
    } else if (month.includes("-")) {
      const [s, e] = month.split("-");
      pieces.push(`from ${MONTH_NAMES[Number(s)] ?? s} to ${MONTH_NAMES[Number(e)] ?? e}`);
    } else {
      pieces.push(`in ${MONTH_NAMES[Number(month)] ?? month}`);
    }
  }

  // Day of week
  if (dow !== "*" && dow !== "?") {
    if (dow.includes(",")) {
      const days = dow.split(",").map((d) => DAY_NAMES[Number(d)] ?? d);
      pieces.push(`on ${days.join(", ")}`);
    } else if (dow.includes("-")) {
      const [s, e] = dow.split("-");
      pieces.push(`${DAY_NAMES[Number(s)] ?? s} through ${DAY_NAMES[Number(e)] ?? e}`);
    } else {
      pieces.push(`on ${DAY_NAMES[Number(dow)] ?? dow}`);
    }
  }

  return pieces.join(", ");
}

function explainField(value: string, fieldIndex: number): string {
  if (value === "*" || value === "?") return "every value";
  if (value.includes("/")) {
    const [start, step] = value.split("/");
    return `every ${step} starting at ${start === "*" ? "0" : start}`;
  }
  if (value.includes(",")) return `at values: ${value}`;
  if (value.includes("-")) return `range ${value}`;

  if (fieldIndex === 3 && MONTH_NAMES[Number(value)]) return MONTH_NAMES[Number(value)];
  if (fieldIndex === 4 && DAY_NAMES[Number(value)]) return DAY_NAMES[Number(value)];
  return `at ${value}`;
}

function getNextRuns(parts: string[], count: number): Date[] {
  const runs: Date[] = [];
  const now = new Date();
  const check = new Date(now);
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1);

  const maxIterations = 525960; // ~1 year of minutes
  let iterations = 0;

  while (runs.length < count && iterations < maxIterations) {
    if (matchesCron(check, parts)) {
      runs.push(new Date(check));
    }
    check.setMinutes(check.getMinutes() + 1);
    iterations++;
  }

  return runs;
}

function matchesCron(date: Date, parts: string[]): boolean {
  const [min, hour, dom, month, dow] = parts;
  return (
    matchesField(date.getMinutes(), min, 0, 59) &&
    matchesField(date.getHours(), hour, 0, 23) &&
    matchesField(date.getDate(), dom, 1, 31) &&
    matchesField(date.getMonth() + 1, month, 1, 12) &&
    matchesField(date.getDay(), dow, 0, 6)
  );
}

function matchesField(value: number, pattern: string, min: number, max: number): boolean {
  if (pattern === "*" || pattern === "?") return true;

  for (const part of pattern.split(",")) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = Number(stepStr);
      const start = range === "*" ? min : Number(range);
      for (let v = start; v <= max; v += step) {
        if (v === value) return true;
      }
    } else if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      if (value >= s && value <= e) return true;
    } else {
      if (Number(part) === value) return true;
    }
  }
  return false;
}
