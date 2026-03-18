import { registerCapability, type CapabilityInput } from "./index.js";

interface ScoreBand {
  band: string;
  min: number;
  max: number;
  universal_risk: string;
  percentile_low: number;
  percentile_high: number;
  characteristics: string;
}

const SCORING_SYSTEMS: Record<string, { name: string; min: number; max: number; bands: ScoreBand[] }> = {
  fico: {
    name: "FICO Score",
    min: 300,
    max: 850,
    bands: [
      { band: "Exceptional", min: 800, max: 850, universal_risk: "very_low", percentile_low: 80, percentile_high: 100, characteristics: "Best rates, highest approval odds" },
      { band: "Very Good", min: 740, max: 799, universal_risk: "low", percentile_low: 60, percentile_high: 79, characteristics: "Better than average rates" },
      { band: "Good", min: 670, max: 739, universal_risk: "moderate", percentile_low: 40, percentile_high: 59, characteristics: "Acceptable to most lenders" },
      { band: "Fair", min: 580, max: 669, universal_risk: "elevated", percentile_low: 20, percentile_high: 39, characteristics: "Subprime rates, limited options" },
      { band: "Poor", min: 300, max: 579, universal_risk: "high", percentile_low: 0, percentile_high: 19, characteristics: "Difficulty getting approved" },
    ],
  },
  vantagescore: {
    name: "VantageScore",
    min: 300,
    max: 850,
    bands: [
      { band: "Excellent", min: 781, max: 850, universal_risk: "very_low", percentile_low: 80, percentile_high: 100, characteristics: "Best terms available" },
      { band: "Good", min: 661, max: 780, universal_risk: "low", percentile_low: 50, percentile_high: 79, characteristics: "Favorable terms" },
      { band: "Fair", min: 601, max: 660, universal_risk: "moderate", percentile_low: 30, percentile_high: 49, characteristics: "Standard terms" },
      { band: "Poor", min: 500, max: 600, universal_risk: "elevated", percentile_low: 10, percentile_high: 29, characteristics: "Limited options, higher rates" },
      { band: "Very Poor", min: 300, max: 499, universal_risk: "high", percentile_low: 0, percentile_high: 9, characteristics: "Very limited options" },
    ],
  },
  experian: {
    name: "Experian (UK)",
    min: 0,
    max: 999,
    bands: [
      { band: "Excellent", min: 961, max: 999, universal_risk: "very_low", percentile_low: 80, percentile_high: 100, characteristics: "Best rates and terms" },
      { band: "Good", min: 881, max: 960, universal_risk: "low", percentile_low: 60, percentile_high: 79, characteristics: "Good rates" },
      { band: "Fair", min: 721, max: 880, universal_risk: "moderate", percentile_low: 30, percentile_high: 59, characteristics: "Average terms" },
      { band: "Poor", min: 561, max: 720, universal_risk: "elevated", percentile_low: 10, percentile_high: 29, characteristics: "Limited options" },
      { band: "Very Poor", min: 0, max: 560, universal_risk: "high", percentile_low: 0, percentile_high: 9, characteristics: "Significant difficulty" },
    ],
  },
  equifax: {
    name: "Equifax (UK)",
    min: 0,
    max: 700,
    bands: [
      { band: "Excellent", min: 466, max: 700, universal_risk: "very_low", percentile_low: 80, percentile_high: 100, characteristics: "Best rates" },
      { band: "Good", min: 420, max: 465, universal_risk: "low", percentile_low: 60, percentile_high: 79, characteristics: "Good terms" },
      { band: "Fair", min: 380, max: 419, universal_risk: "moderate", percentile_low: 30, percentile_high: 59, characteristics: "Average terms" },
      { band: "Poor", min: 280, max: 379, universal_risk: "elevated", percentile_low: 10, percentile_high: 29, characteristics: "Limited options" },
      { band: "Very Poor", min: 0, max: 279, universal_risk: "high", percentile_low: 0, percentile_high: 9, characteristics: "Significant difficulty" },
    ],
  },
};

registerCapability("credit-score-band", async (input: CapabilityInput) => {
  const score = input.score as number;
  if (score === undefined || score === null) throw new Error("'score' is required (numeric).");
  if (typeof score !== "number") throw new Error("'score' must be a number.");

  const system = ((input.system as string) ?? "fico").toLowerCase();
  const scoring = SCORING_SYSTEMS[system];

  if (!scoring) {
    return {
      output: {
        score, system, error: `Unknown scoring system. Supported: ${Object.keys(SCORING_SYSTEMS).join(", ")}`,
      },
      provenance: { source: "strale-credit-reference", fetched_at: new Date().toISOString() },
    };
  }

  if (score < scoring.min || score > scoring.max) {
    return {
      output: {
        score, system, system_name: scoring.name,
        error: `Score ${score} is outside the valid range for ${scoring.name} (${scoring.min}-${scoring.max})`,
      },
      provenance: { source: "strale-credit-reference", fetched_at: new Date().toISOString() },
    };
  }

  const band = scoring.bands.find((b) => score >= b.min && score <= b.max)!;
  const bandIdx = scoring.bands.indexOf(band);
  const nextBand = bandIdx > 0 ? scoring.bands[bandIdx - 1] : null;

  return {
    output: {
      score,
      system,
      system_name: scoring.name,
      band: band.band,
      universal_risk_level: band.universal_risk,
      percentile_estimate: `${band.percentile_low}-${band.percentile_high}th`,
      typical_characteristics: band.characteristics,
      next_band_threshold: nextBand ? nextBand.min : null,
      next_band_name: nextBand?.band ?? null,
      points_to_next: nextBand ? nextBand.min - score : 0,
      score_range: { min: scoring.min, max: scoring.max },
    },
    provenance: { source: "strale-credit-reference", fetched_at: new Date().toISOString() },
  };
});
