// ─── Trust Grade System ──────────────────────────────────────────────────────
// Combines SQS score, freshness category, and latency into a unified Trust Grade.
// Spec: Notion page 31e67c87-082c-816a-9b61-cee6fb83f66c

// ─── Freshness Grading ──────────────────────────────────────────────────────

export type FreshnessGrade = "A" | "B" | "C" | null;

export interface FreshnessInfo {
  category: "live-fetch" | "reference-data" | "computed";
  grade: FreshnessGrade;
  label: string;
  data_update_cycle_days?: number | null;
  dataset_last_updated?: string | null;
}

/**
 * Compute freshness grade for a capability.
 *
 * - live-fetch: always grade A (data fetched fresh on every call)
 * - reference-data: graded by dataset age vs update cycle
 *   - A: dataset_last_updated within 1x cycle
 *   - B: within 2x cycle
 *   - C: older than 2x cycle or unknown
 * - computed: no freshness concept (grade = null)
 */
export function computeFreshnessGrade(params: {
  freshnessCategory: string | null;
  dataUpdateCycleDays: number | null;
  datasetLastUpdated: Date | null;
}): FreshnessInfo | null {
  const { freshnessCategory, dataUpdateCycleDays, datasetLastUpdated } = params;

  if (!freshnessCategory) return null;

  if (freshnessCategory === "live-fetch") {
    return {
      category: "live-fetch",
      grade: "A",
      label: "Real-time",
    };
  }

  if (freshnessCategory === "computed") {
    return {
      category: "computed",
      grade: null,
      label: "Computed (no data dependency)",
    };
  }

  if (freshnessCategory === "reference-data") {
    if (!dataUpdateCycleDays) {
      return {
        category: "reference-data",
        grade: "C",
        label: "Reference data (update cycle unknown)",
        data_update_cycle_days: null,
        dataset_last_updated: null,
      };
    }

    if (!datasetLastUpdated) {
      // We know the cycle but haven't tracked when it was last updated
      return {
        category: "reference-data",
        grade: "B",
        label: "Reference data (last update not tracked)",
        data_update_cycle_days: dataUpdateCycleDays,
        dataset_last_updated: null,
      };
    }

    const ageDays =
      (Date.now() - datasetLastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    const cycle = dataUpdateCycleDays;

    let grade: FreshnessGrade;
    let label: string;

    if (ageDays <= cycle) {
      grade = "A";
      label = `Reference data (updated ${Math.round(ageDays)}d ago, cycle ${cycle}d)`;
    } else if (ageDays <= cycle * 2) {
      grade = "B";
      label = `Reference data (${Math.round(ageDays)}d since update, cycle ${cycle}d)`;
    } else {
      grade = "C";
      label = `Reference data (stale: ${Math.round(ageDays)}d since update, cycle ${cycle}d)`;
    }

    return {
      category: "reference-data",
      grade,
      label,
      data_update_cycle_days: dataUpdateCycleDays,
      dataset_last_updated: datasetLastUpdated.toISOString(),
    };
  }

  return null;
}

// ─── Latency Grading ────────────────────────────────────────────────────────

export type LatencyGrade = "fast" | "normal" | "moderate" | "slow";

export interface PerformanceInfo {
  p95_ms: number | null;
  avg_ms: number | null;
  latency_grade: LatencyGrade | null;
  label: string;
}

/**
 * Grade latency based on p95 response time.
 *
 * Uses tiered thresholds for solutions based on step count:
 * - Capabilities (stepCount undefined or 1): Fast <1s, Normal 1-5s, Moderate 5-15s, Slow >15s
 * - Solutions 2-4 steps: Fast <3s, Normal 3-15s, Moderate 15-30s, Slow >30s
 * - Solutions 5+ steps: Fast <5s, Normal 5-30s, Moderate 30-60s, Slow >60s
 */
export function gradeLatency(p95Ms: number | null, stepCount?: number): LatencyGrade | null {
  if (p95Ms == null) return null;

  const steps = stepCount ?? 1;

  if (steps >= 5) {
    if (p95Ms < 5000) return "fast";
    if (p95Ms < 30000) return "normal";
    if (p95Ms < 60000) return "moderate";
    return "slow";
  }

  if (steps >= 2) {
    if (p95Ms < 3000) return "fast";
    if (p95Ms < 15000) return "normal";
    if (p95Ms < 30000) return "moderate";
    return "slow";
  }

  // Single capability
  if (p95Ms < 1000) return "fast";
  if (p95Ms < 5000) return "normal";
  if (p95Ms < 15000) return "moderate";
  return "slow";
}

export function buildPerformanceInfo(
  p95Ms: number | null,
  avgMs: number | null,
  stepCount?: number,
): PerformanceInfo {
  const grade = gradeLatency(p95Ms, stepCount);

  const steps = stepCount ?? 1;
  const labels: Record<LatencyGrade, string> = steps >= 5
    ? { fast: "Fast (<5s p95)", normal: "Normal (5-30s p95)", moderate: "Moderate (30-60s p95)", slow: "Slow (>60s p95)" }
    : steps >= 2
      ? { fast: "Fast (<3s p95)", normal: "Normal (3-15s p95)", moderate: "Moderate (15-30s p95)", slow: "Slow (>30s p95)" }
      : { fast: "Fast (<1s p95)", normal: "Normal (1-5s p95)", moderate: "Moderate (5-15s p95)", slow: "Slow (>15s p95)" };

  return {
    p95_ms: p95Ms,
    avg_ms: avgMs,
    latency_grade: grade,
    label: grade ? labels[grade] : "No performance data",
  };
}

// ─── Combined Trust Grade ───────────────────────────────────────────────────

export type TrustGrade = "A" | "B" | "C" | "D";

export interface TrustGradeInfo {
  grade: TrustGrade;
  label: string;
  components: {
    sqs: { score: number | null; grade: TrustGrade | null };
    freshness: { grade: FreshnessGrade | null };
    latency: { grade: LatencyGrade | null; mapped: TrustGrade | null };
  };
}

function sqsToGrade(score: number | null): TrustGrade | null {
  if (score == null) return null;
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function latencyToTrustGrade(grade: LatencyGrade | null): TrustGrade | null {
  if (!grade) return null;
  const map: Record<LatencyGrade, TrustGrade> = {
    fast: "A",
    normal: "B",
    moderate: "C",
    slow: "D",
  };
  return map[grade];
}

const GRADE_ORDER: TrustGrade[] = ["A", "B", "C", "D"];

/**
 * Compute combined Trust Grade from SQS, freshness, and latency.
 *
 * Rules:
 * - If SQS is pending, trust grade is null
 * - Combined grade = worst of (SQS grade, freshness grade, latency grade)
 * - Null components are ignored (computed caps have no freshness, new caps may lack latency data)
 */
export function computeTrustGrade(params: {
  sqsScore: number | null;
  sqsPending: boolean;
  freshnessGrade: FreshnessGrade | null;
  latencyGrade: LatencyGrade | null;
}): TrustGradeInfo | null {
  const { sqsScore, sqsPending, freshnessGrade, latencyGrade } = params;

  if (sqsPending) return null;

  const sqsGrade = sqsToGrade(sqsScore);
  const latencyMapped = latencyToTrustGrade(latencyGrade);

  // Collect non-null grades and take worst
  const grades: TrustGrade[] = [];
  if (sqsGrade) grades.push(sqsGrade);
  if (freshnessGrade) grades.push(freshnessGrade as TrustGrade); // A/B/C map directly
  if (latencyMapped) grades.push(latencyMapped);

  if (grades.length === 0) return null;

  const worst = grades.reduce((w, g) =>
    GRADE_ORDER.indexOf(g) > GRADE_ORDER.indexOf(w) ? g : w,
  );

  const labels: Record<TrustGrade, string> = {
    A: "Excellent",
    B: "Good",
    C: "Acceptable",
    D: "Degraded",
  };

  return {
    grade: worst,
    label: labels[worst],
    components: {
      sqs: { score: sqsScore, grade: sqsGrade },
      freshness: { grade: freshnessGrade },
      latency: { grade: latencyGrade, mapped: latencyMapped },
    },
  };
}
