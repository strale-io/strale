/** Shared constants for SQS computation across legacy, QP, and RP modules. */

/** Minimum test runs before a capability qualifies for a real SQS score. */
export const MIN_RUNS = 5;

/** Rolling window size for test result analysis. */
export const ROLLING_RUNS = 10;

/** Linear decay weights: run 1 (most recent) = 1.00, run 10 (oldest) = 0.30. */
export const RECENCY_WEIGHTS = [1.00, 0.95, 0.90, 0.85, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30];
