/**
 * SQS Matrix — 5×5 lookup table mapping QP grade × RP grade → combined SQS score.
 *
 * The matrix encodes the principle that both code quality AND reliability
 * matter, but poor reliability caps the combined score more aggressively
 * than poor code quality alone.
 *
 *        RP→   A      B      C      D      F
 *  QP ↓
 *   A       95     82     65     45     30
 *   B       85     75     58     40     25
 *   C       70     62     50     35     20
 *   D       55     48     38     28     15
 *   F       35     30     22     15     10
 */

import type { QPResult } from "./quality-profile.js";
import type { RPResult } from "./reliability-profile.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MatrixSQSResult {
  score: number; // 0-100
  label: string; // "Excellent" | "Good" | "Fair" | "Poor" | "Degraded" | "Pending"
  qp_grade: string;
  rp_grade: string;
  qp_score: number;
  rp_score: number;
  pending: boolean;
}

// ─── Matrix ─────────────────────────────────────────────────────────────────

type Grade = "A" | "B" | "C" | "D" | "F";
const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

const MATRIX: Record<Grade, Record<Grade, number>> = {
  //             RP:A  RP:B  RP:C  RP:D  RP:F
  A: { A: 95, B: 82, C: 65, D: 45, F: 30 },
  B: { A: 85, B: 75, C: 58, D: 40, F: 25 },
  C: { A: 70, B: 62, C: 50, D: 35, F: 20 },
  D: { A: 55, B: 48, C: 38, D: 28, F: 15 },
  F: { A: 35, B: 30, C: 22, D: 15, F: 10 },
};

function scoreToLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 25) return "Poor";
  return "Degraded";
}

// ─── Computation ────────────────────────────────────────────────────────────

/**
 * Look up the combined SQS score from the matrix.
 * If either profile is pending, returns a pending result.
 */
export function computeMatrixSQS(qp: QPResult, rp: RPResult): MatrixSQSResult {
  if (qp.pending || rp.pending) {
    return {
      score: 0,
      label: "Pending",
      qp_grade: qp.grade,
      rp_grade: rp.grade,
      qp_score: qp.score,
      rp_score: rp.score,
      pending: true,
    };
  }

  const qpGrade = qp.grade as Grade;
  const rpGrade = rp.grade as Grade;

  // Direct lookup
  const baseScore = MATRIX[qpGrade]?.[rpGrade] ?? 50;

  // Fine-tune: interpolate within the cell based on actual scores
  // This gives more granularity than just the 25 discrete cells.
  // Find the position within the grade band and adjust ±3 points.
  const qpBandPos = gradePosition(qp.score, qpGrade);
  const rpBandPos = gradePosition(rp.score, rpGrade);
  const adjustment = Math.round(((qpBandPos + rpBandPos) / 2) * 3 * 10) / 10;

  const score = Math.max(0, Math.min(100, Math.round((baseScore + adjustment) * 10) / 10));

  return {
    score,
    label: scoreToLabel(score),
    qp_grade: qpGrade,
    rp_grade: rpGrade,
    qp_score: qp.score,
    rp_score: rp.score,
    pending: false,
  };
}

/**
 * Returns -1 to +1 indicating position within the grade band.
 * -1 = bottom of band, 0 = middle, +1 = top.
 */
function gradePosition(score: number, grade: Grade): number {
  const bands: Record<Grade, [number, number]> = {
    A: [90, 100],
    B: [75, 89.9],
    C: [50, 74.9],
    D: [25, 49.9],
    F: [0, 24.9],
  };

  const [low, high] = bands[grade];
  const range = high - low;
  if (range === 0) return 0;

  // Normalize to -1..+1
  return ((score - low) / range) * 2 - 1;
}

/**
 * Export the raw matrix for verification/display purposes.
 */
export function getMatrix(): Record<string, Record<string, number>> {
  return MATRIX;
}
