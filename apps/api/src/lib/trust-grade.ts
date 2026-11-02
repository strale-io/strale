// Freshness display for capability responses.

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
