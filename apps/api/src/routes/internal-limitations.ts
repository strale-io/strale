/**
 * PUBLIC ENDPOINTS — intentional, no auth required.
 *
 * Known limitations are public by design to support Strale's
 * transparency positioning. If this changes, add authMiddleware.
 */

import { Hono } from "hono";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  capabilityLimitations,
  solutions,
  solutionSteps,
} from "../db/schema.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const internalLimitationsRoute = new Hono<AppEnv>();

// GET /v1/internal/limitations/capabilities/:slug
internalLimitationsRoute.get("/capabilities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const rows = await db
    .select({
      text: capabilityLimitations.limitationText,
      category: capabilityLimitations.category,
      severity: capabilityLimitations.severity,
      affectedPercentage: capabilityLimitations.affectedPercentage,
      workaround: capabilityLimitations.workaround,
    })
    .from(capabilityLimitations)
    .where(
      and(
        eq(capabilityLimitations.capabilitySlug, slug),
        eq(capabilityLimitations.active, true),
      ),
    )
    .orderBy(asc(capabilityLimitations.sortOrder));

  return c.json({
    capability_slug: slug,
    limitations: rows.map((r) => ({
      text: r.text,
      category: r.category,
      severity: r.severity,
      affected_percentage: r.affectedPercentage
        ? parseFloat(r.affectedPercentage)
        : null,
      workaround: r.workaround,
    })),
  });
});

// GET /v1/internal/limitations/solutions/:slug
internalLimitationsRoute.get("/solutions/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const steps = await db
    .select({ capabilitySlug: solutionSteps.capabilitySlug })
    .from(solutionSteps)
    .innerJoin(solutions, eq(solutionSteps.solutionId, solutions.id))
    .where(eq(solutions.slug, slug))
    .orderBy(asc(solutionSteps.stepOrder));

  if (steps.length === 0) {
    return c.json(
      apiError("not_found", `Solution '${slug}' not found.`),
      404,
    );
  }

  const stepLimitations = await Promise.all(
    steps.map(async (step) => {
      const rows = await db
        .select({
          text: capabilityLimitations.limitationText,
          category: capabilityLimitations.category,
          severity: capabilityLimitations.severity,
          affectedPercentage: capabilityLimitations.affectedPercentage,
          workaround: capabilityLimitations.workaround,
        })
        .from(capabilityLimitations)
        .where(
          and(
            eq(capabilityLimitations.capabilitySlug, step.capabilitySlug),
            eq(capabilityLimitations.active, true),
          ),
        )
        .orderBy(asc(capabilityLimitations.sortOrder));

      return {
        capability_slug: step.capabilitySlug,
        limitations: rows.map((r) => ({
          text: r.text,
          category: r.category,
          severity: r.severity,
          affected_percentage: r.affectedPercentage
            ? parseFloat(r.affectedPercentage)
            : null,
          workaround: r.workaround,
        })),
      };
    }),
  );

  return c.json({
    solution_slug: slug,
    steps: stepLimitations,
  });
});
