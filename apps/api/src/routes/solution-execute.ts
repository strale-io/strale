/**
 * Retired DEC-20260503-A 2026-05-04. Phase 1b removal: separate to-do.
 *
 * POST /v1/solutions/:slug/execute is retired with the rest of the
 * public solutions surface. The underlying executor lives in
 * lib/solution-executor.ts and is preserved for any future bundled-
 * product module that may reuse it.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types.js";

export const solutionExecuteRoute = new Hono<AppEnv>();

const goneBody = {
  error_code: "gone",
  message:
    "Solutions surface retired per DEC-20260503-A. Visit https://strale.io for Counterparty Assurance.",
  deprecated_at: "2026-05-04",
  alternative: "https://strale.io",
};

// POST /v1/solutions/:slug/execute — retired
solutionExecuteRoute.post("/:slug/execute", (c) => c.json(goneBody, 410));
