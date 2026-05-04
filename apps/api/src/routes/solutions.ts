/**
 * Retired DEC-20260503-A 2026-05-04. Phase 1b removal: separate to-do.
 *
 * The public solutions surface is retired per DEC-20260503-A (dual-domain
 * architecture: strale.dev = atomic capabilities, strale.io = bundled
 * products). Bundled products (Counterparty Assurance) are being built
 * fresh on strale.io and do not reuse the solutions catalog.
 *
 * All public solutions routes return 410 Gone with a structured
 * deprecation body. The route registration is kept in app.ts so the
 * 410 is reachable; full handler removal is phase 1b.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types.js";

export const solutionsRoute = new Hono<AppEnv>();

const goneBody = {
  error_code: "gone",
  message:
    "Solutions surface retired per DEC-20260503-A. Visit https://strale.io for Counterparty Assurance.",
  deprecated_at: "2026-05-04",
  alternative: "https://strale.io",
};

// GET /v1/solutions — retired
solutionsRoute.get("/", (c) => c.json(goneBody, 410));

// GET /v1/solutions/:slug — retired
solutionsRoute.get("/:slug", (c) => c.json(goneBody, 410));
