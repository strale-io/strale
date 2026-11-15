export type OsvSeverity = "critical" | "high" | "medium" | "low" | "unknown";

type OsvRecord = {
  database_specific?: { severity?: unknown };
  severity?: Array<{ type?: unknown; score?: unknown }>;
};

const NAMED_SEVERITIES: Record<string, Exclude<OsvSeverity, "unknown">> = {
  CRITICAL: "critical",
  HIGH: "high",
  MODERATE: "medium",
  MEDIUM: "medium",
  LOW: "low",
};

/** Return the rating carried by a full OSV advisory, without guessing low. */
export function osvSeverity(record: OsvRecord): OsvSeverity {
  const named = record.database_specific?.severity;
  if (typeof named === "string") {
    const result = NAMED_SEVERITIES[named.toUpperCase()];
    if (result) return result;
  }

  for (const entry of record.severity ?? []) {
    if (entry.type !== "CVSS_V3" || typeof entry.score !== "string") continue;
    const score = cvssV3BaseScore(entry.score);
    if (score === null) continue;
    if (score >= 9) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  }
  return "unknown";
}

/** FIRST CVSS v3.1 base-score formula (also valid for v3.0 base metrics). */
export function cvssV3BaseScore(vector: string): number | null {
  const parts = vector.split("/");
  if (parts[0] !== "CVSS:3.0" && parts[0] !== "CVSS:3.1") return null;
  const metrics = Object.fromEntries(parts.slice(1).map((part) => part.split(":")));
  const av = ({ N: 0.85, A: 0.62, L: 0.55, P: 0.2 } as Record<string, number>)[metrics.AV];
  const ac = ({ L: 0.77, H: 0.44 } as Record<string, number>)[metrics.AC];
  const ui = ({ N: 0.85, R: 0.62 } as Record<string, number>)[metrics.UI];
  const scope = metrics.S;
  const cia = { H: 0.56, L: 0.22, N: 0 };
  const c = cia[metrics.C as keyof typeof cia];
  const i = cia[metrics.I as keyof typeof cia];
  const a = cia[metrics.A as keyof typeof cia];
  const pr = scope === "U"
    ? ({ N: 0.85, L: 0.62, H: 0.27 } as Record<string, number>)[metrics.PR]
    : scope === "C" ? ({ N: 0.85, L: 0.68, H: 0.5 } as Record<string, number>)[metrics.PR] : undefined;
  if ([av, ac, ui, c, i, a, pr].some((value) => value === undefined)) return null;

  const impactSubscore = 1 - (1 - c!) * (1 - i!) * (1 - a!);
  const impact = scope === "U"
    ? 6.42 * impactSubscore
    : 7.52 * (impactSubscore - 0.029) - 3.25 * Math.pow(impactSubscore - 0.02, 15);
  if (impact <= 0) return 0;
  const exploitability = 8.22 * av! * ac! * pr! * ui!;
  const raw = scope === "U"
    ? Math.min(impact + exploitability, 10)
    : Math.min(1.08 * (impact + exploitability), 10);
  return Math.ceil(raw * 10) / 10;
}
