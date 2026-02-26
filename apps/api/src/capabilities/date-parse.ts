import { registerCapability, type CapabilityInput } from "./index.js";

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // Swedish
  januari: 1, februari: 2, mars: 3, maj: 5, juni: 6, juli: 7, augusti: 8,
  september_sv: 9, oktober: 10, december_sv: 12,
  // German
  januar: 1, marz: 3, märz: 3, mai: 5, oktober_de: 10, dezember: 12,
  // French
  janvier: 1, février: 2, fevrier: 2, avril: 4, juin: 6, juillet: 7,
  août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

registerCapability("date-parse", async (input: CapabilityInput) => {
  const dateString = ((input.date_string as string) ?? (input.date as string) ?? (input.task as string) ?? "").trim();
  if (!dateString) throw new Error("'date_string' is required.");

  const preferredFormat = ((input.preferred_format as string) ?? "").toUpperCase(); // DMY, MDY, YMD

  const result = parseDate(dateString, preferredFormat);

  return {
    output: result,
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function parseDate(input: string, preferredFormat: string): Record<string, unknown> {
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  let isAmbiguous = false;
  const possibleInterpretations: string[] = [];

  const cleaned = input.trim().replace(/\.$/, "").replace(/\s+/g, " ");

  // ISO 8601: 2025-03-04 or 2025-03-04T...
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  }

  // ISO week: 2025-W14
  if (!day) {
    const weekMatch = cleaned.match(/^(\d{4})-?W(\d{1,2})(?:-?(\d))?$/i);
    if (weekMatch) {
      year = Number(weekMatch[1]);
      const week = Number(weekMatch[2]);
      const weekDay = Number(weekMatch[3] ?? 1);
      const jan4 = new Date(year, 0, 4);
      const start = new Date(jan4.getTime() - (jan4.getDay() || 7) * 86400000 + 86400000);
      const target = new Date(start.getTime() + ((week - 1) * 7 + weekDay - 1) * 86400000);
      day = target.getDate();
      month = target.getMonth() + 1;
      year = target.getFullYear();
    }
  }

  // Named month: "March 4, 2025", "4 March 2025", "4. mars 2025"
  if (!day) {
    const lower = cleaned.toLowerCase().replace(/[.,]/g, "");
    for (const [name, m] of Object.entries(MONTH_NAMES)) {
      const idx = lower.indexOf(name);
      if (idx >= 0) {
        month = m;
        const rest = lower.replace(name, " ").replace(/\s+/g, " ").trim();
        const nums = rest.match(/\d+/g)?.map(Number) ?? [];
        if (nums.length >= 2) {
          const [a, b] = nums;
          if (a > 31) { year = expandYear(a); day = b; }
          else if (b > 31) { day = a; year = expandYear(b); }
          else { day = a; year = expandYear(b); }
        } else if (nums.length === 1) {
          if (nums[0] > 31) { year = expandYear(nums[0]); day = 1; }
          else { day = nums[0]; year = new Date().getFullYear(); }
        }
        break;
      }
    }
  }

  // Numeric: DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, etc.
  if (!day) {
    const numMatch = cleaned.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
    if (numMatch) {
      const [, a, b, c] = numMatch.map(Number);
      if (a > 31) {
        // YMD
        year = a; month = b; day = c;
      } else if (c > 31 || c > 12) {
        // Either DMY or MDY — c is year
        year = expandYear(c);
        if (preferredFormat === "MDY") {
          month = a; day = b;
        } else if (preferredFormat === "DMY") {
          day = a; month = b;
        } else {
          // Ambiguous
          if (a > 12) { day = a; month = b; }
          else if (b > 12) { month = a; day = b; }
          else {
            isAmbiguous = true;
            day = a; month = b; // Default DMY
            possibleInterpretations.push(`${year}-${pad(b)}-${pad(a)} (MDY interpretation)`);
            possibleInterpretations.push(`${year}-${pad(a)}-${pad(b)} (DMY interpretation)`);
          }
        }
      }
    }
  }

  if (day === null || month === null) {
    // Last resort: try native Date parsing
    const d = new Date(input);
    if (!isNaN(d.getTime())) {
      day = d.getDate();
      month = d.getMonth() + 1;
      year = d.getFullYear();
    } else {
      return { input, parsed: false, error: "Could not parse date string." };
    }
  }

  if (!year) year = new Date().getFullYear();
  year = expandYear(year);

  const date = new Date(year, month - 1, day);
  const isoDate = `${year}-${pad(month)}-${pad(day)}`;
  const dayOfWeek = DAY_NAMES[date.getDay()];

  return {
    input,
    parsed: true,
    iso_date: isoDate,
    day,
    month,
    year,
    day_of_week: dayOfWeek,
    is_ambiguous: isAmbiguous,
    possible_interpretations: possibleInterpretations.length > 0 ? possibleInterpretations : undefined,
  };
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y > 50 ? 1900 + y : 2000 + y;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
