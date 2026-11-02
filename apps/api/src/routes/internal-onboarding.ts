import { isValidAdminAuth } from "../lib/admin-auth.js";
import { withinOnboardingBudget } from "../lib/onboarding-budget.js";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import * as yaml from "js-yaml";
import { ADMIN_SECRET_MIN_LENGTH } from "../lib/admin-auth.js";
import { getDeactivatedCapabilities } from "../capabilities/auto-register.js";
import {
  runOnboarding,
  type OnboardingResult,
} from "../lib/onboarding-pipeline.js";
import {
  autonomousAuthority,
  describeAuthority,
} from "../lib/production-authority.js";
import { log } from "../lib/log.js";
import { Hono, type MiddlewareHandler } from "hono";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, transactions } from "../db/schema.js";
import {
  checkReadiness,
  checkAllReadiness,
  clearReadinessCache,
} from "../lib/capability-readiness.js";
import { apiError } from "../lib/errors.js";
import { estimateRoutingLatency } from "../lib/latency-estimate.js";
import type { AppEnv } from "../types.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;



export const internalOnboardingRoute = new Hono<AppEnv>();

// GET /v1/internal/onboarding/readiness?slug=xxx — single capability
// GET /v1/internal/onboarding/readiness — all capabilities
internalOnboardingRoute.get("/readiness", async (c) => {
  const slug = c.req.query("slug");

  if (slug) {
    const check = await checkReadiness(slug);
    return c.json(check);
  }

  const all = await checkAllReadiness();
  const checks = [...all.values()];
  const ready = checks.filter((c) => c.ready).length;
  const withIssues = checks.filter((c) => !c.ready && !c.deactivated).length;
  const deactivated = checks.filter((c) => c.deactivated).length;

  return c.json({
    summary: {
      total: checks.length,
      ready,
      with_issues: withIssues,
      deactivated,
    },
    capabilities: checks,
  });
});

// POST /v1/internal/onboarding/fix-latency — fix null avg_latency_ms (admin only)
internalOnboardingRoute.post("/fix-latency", async (c) => {
  if (!ADMIN_SECRET) {
    return c.json(
      apiError("unauthorized", "Admin endpoint is not configured.", { retryable: false, next_step: "Contact the service operator to configure this admin endpoint before retrying." }),
      503
    );
  }
  if (!isValidAdminAuth(c.req.header("Authorization"))) {
    return c.json(apiError("unauthorized", "Invalid admin secret.", { retryable: false, next_step: "Obtain valid admin credentials from the service operator and send them in the Authorization: Bearer <admin_secret> header." }), 401);
  }

  const db = getDb();

  const missing = await db
    .select({ id: capabilities.id, slug: capabilities.slug })
    .from(capabilities)
    .where(isNull(capabilities.avgLatencyMs));

  if (missing.length === 0) {
    return c.json({ updated: [], skipped: [], count: 0 });
  }

  const updated: Array<{
    slug: string;
    old_ms: null;
    new_ms: number;
    source: string;
  }> = [];
  const skipped: Array<{ slug: string; reason: string; samples: number }> = [];

  for (const cap of missing) {
    // Completed TRANSACTIONS, not test results (#438). A transaction row
    // exists only because the capability actually ran, so it needs no suite
    // filter and no duration threshold to mean what it says. The old query
    // medianed every test result for the slug, three quarters of which are
    // schema_check / negative / edge_case rows that return in single-digit
    // milliseconds without executing anything — see lib/latency-estimate.ts
    // for the measured breakdown.
    const executions = await db
      .select({ latencyMs: transactions.latencyMs })
      .from(transactions)
      .where(
        and(
          eq(transactions.capabilityId, cap.id),
          eq(transactions.status, "completed")
        )
      );

    const estimate = estimateRoutingLatency(
      executions
        .map((e) => e.latencyMs)
        .filter((ms): ms is number => ms != null)
    );

    // Refusing is a first-class outcome. The old implementation could not:
    // with too little evidence it wrote heuristicLatency(transparencyTag) —
    // 20 ms for anything `algorithmic` — a confident tiny number nothing
    // downstream could distinguish from a measurement. A null means
    // "unmeasured", which is true, and capability-readiness.ts already
    // reports it as an issue.
    if (estimate.value === null) {
      skipped.push({
        slug: cap.slug,
        reason: estimate.reason,
        samples: estimate.samples,
      });
      continue;
    }

    await db
      .update(capabilities)
      .set({ avgLatencyMs: estimate.value, updatedAt: new Date() })
      .where(eq(capabilities.slug, cap.slug));

    updated.push({
      slug: cap.slug,
      old_ms: null,
      new_ms: estimate.value,
      source: estimate.reason,
    });
  }

  clearReadinessCache();
  return c.json({ updated, skipped, count: updated.length });
});

// Mounted separately before the admin wall, exclusively at the internal path.
// It is deliberately absent from the public-ops alias of internalOnboardingRoute.
export function createOnboardingRunRoute(
  deps: {
    pipeline?: typeof runOnboarding;
    database?: typeof getDb;
    secret?: () => string | undefined;
    manifestDirectory?: string;
    budgetMs?: number;
  } = {}
) {
  const route = new Hono<AppEnv>();
  const pipeline = deps.pipeline ?? runOnboarding;
  const directory =
    deps.manifestDirectory ??
    resolve(import.meta.dirname, "../../../../manifests");
  const runs = new Map<
    string,
    {
      id: string;
      slug: string;
      mode: "onboard" | "backfill" | "limitations";
      status: "running" | "success" | "failed" | "timeout";
      started_at: string;
      finished_at?: string;
      result?: OnboardingResult;
      errors: Array<{ code: string; message: string }>;
    }
  >();
  let activeId: string | undefined;

  const runAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
    const secret = deps.secret
      ? deps.secret()
      : process.env.ONBOARDING_RUN_SECRET;
    if (!secret || secret.length < ADMIN_SECRET_MIN_LENGTH) {
      return c.json(
        {
          error: {
            code: "not_configured",
            message:
              "Set ONBOARDING_RUN_SECRET to at least 32 characters in Railway.",
          },
        },
        503
      );
    }
    if (secret === ADMIN_SECRET) {
      return c.json({ error: { code: "misconfigured", message: "ONBOARDING_RUN_SECRET must differ from ADMIN_SECRET." } }, 503);
    }
    const expected = Buffer.from(`Bearer ${secret}`, "utf-8");
    const provided = Buffer.from(c.req.header("Authorization") ?? "", "utf-8");
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return c.json(
        {
          error: {
            code: "unauthorized",
            message:
              "The onboarding secret does not match. Check the GitHub environment secret.",
          },
        },
        401
      );
    }
    return next();
  };
  route.post("/run", runAuth, bodyLimit({ maxSize: 4096 }), async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: "invalid_body",
            message: "Send a JSON object with slug and mode.",
          },
        },
        400
      );
    }
    const parsed = onboardingRunBody.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "invalid_body",
            message:
              "Use a lowercase hyphenated slug, mode onboard, backfill or limitations, and boolean discover/fix flags.",
          },
        },
        400
      );
    }
    const input = parsed.data;
    if (input.mode !== "limitations" && getDeactivatedCapabilities().has(input.slug)) {
      return c.json(
        {
          error: {
            code: "deactivated",
            message:
              "This capability is deliberately deactivated. Resolve its deactivation before onboarding.",
          },
        },
        422
      );
    }
    let manifestYaml: string;
    try {
      const path = realpathSync(resolve(directory, `${input.slug}.yaml`));
      if (dirname(path) !== realpathSync(directory)) {
        return c.json(
          {
            error: {
              code: "invalid_manifest_path",
              message:
                "Manifest must be inside the deployed manifests directory.",
            },
          },
          400
        );
      }
      manifestYaml = readFileSync(path, "utf-8");
    } catch {
      return c.json(
        {
          error: {
            code: "manifest_not_found",
            message:
              "Manifest is missing from this deployment. Merge it to main and wait for the API deployment.",
          },
        },
        404
      );
    }
    try {
      const manifest = yaml.load(manifestYaml) as { slug?: unknown } | null;
      if (manifest?.slug !== input.slug) throw new Error("slug mismatch");
    } catch {
      return c.json(
        {
          error: {
            code: "invalid_manifest",
            message:
              "The deployed manifest is invalid or its slug does not match its filename.",
          },
        },
        422
      );
    }
    if (activeId) {
      return c.json(
        {
          error: {
            code: "busy",
            message:
              "An onboarding run is still active. Wait for it to finish before retrying.",
          },
          run_id: activeId,
        },
        409
      );
    }
    // Retain at most 100 completed runs, for the life of this API process.
    while (runs.size >= 100) runs.delete(runs.keys().next().value!);
    const id = randomUUID();
    const run: typeof runs extends Map<string, infer R> ? R : never = {
      id,
      slug: input.slug,
      mode: input.mode,
      status: "running",
      started_at: new Date().toISOString(),
      errors: [],
    };
    activeId = id;
    runs.set(id, run);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      run.status = "timeout";
      run.finished_at = new Date().toISOString();
      run.errors = [
        {
          code: "timeout",
          message:
            "Time budget exceeded. Some rows may already be committed. Wait until busy is false and inspect the result before retrying.",
        },
      ];
      controller.abort();
      // The abort race releases the lock. Bounded handles refuse new writes;
      // already-issued database queries may still drain.
    }, deps.budgetMs ?? 300_000);
    const authority = describeAuthority(
      autonomousAuthority("capability_onboarding", "DEC-20260812-A")
    );
    log.info(
      {
        label: "onboarding-run-start",
        run_id: id,
        slug: input.slug,
        mode: input.mode,
        authority,
      },
      "onboarding-run-start"
    );
    void Promise.resolve()
      .then(async () => {
        const result = await withinOnboardingBudget(pipeline((deps.database ?? getDb)(), {
          manifestYaml,
          mode: input.mode,
          discover: input.discover,
          fix: input.fix,
          // The workflow click acknowledges the CLI's backfill banner; column
          // authority and manifest gates remain enforced, with no bypass exposed.
          force: true,
          signal: controller.signal,
        }), controller.signal);
        run.result = result;
        if (run.status !== "timeout") {
          const ready = input.mode === "limitations" || result.readiness?.ready === true;
          run.status =
            result.status === "success" && ready ? "success" : "failed";
          run.errors = [...result.errors];
          if (result.status === "skipped")
            run.errors.push({
              code: "already_exists",
              message:
                "Capability already exists. Choose backfill to update it.",
            });
          if (!ready)
            run.errors.push({
              code: "not_ready",
              message:
                "Readiness has unresolved issues. Inspect the result before retrying.",
            });
        }
      })
      .catch(() => {
        log.error(
          {
            label: "onboarding-run-failed",
            run_id: id,
            slug: input.slug,
            stage: "pipeline",
            authority,
          },
          "onboarding-run-failed"
        );
        if (run.status !== "timeout") {
          run.status = "failed";
          run.errors = [
            {
              code: "pipeline_error",
              message:
                "Onboarding failed. Check API logs before retrying; some rows may already be committed.",
            },
          ];
        }
      })
      .finally(() => {
        clearTimeout(timer);
        run.finished_at ??= new Date().toISOString();
        if (activeId === id) activeId = undefined;
        log.info(
          {
            label: "onboarding-run-finish",
            run_id: id,
            slug: input.slug,
            status: run.status,
            authority,
          },
          "onboarding-run-finish"
        );
      });
    return c.json({ ...run, busy: true }, 202);
  });
  route.get("/run/:id", runAuth, (c) => {
    const run = runs.get(c.req.param("id"));
    if (!run)
      return c.json(
        {
          error: {
            code: "run_not_found",
            message:
              "Run was not found. The API may have restarted. Check readiness and API logs before retrying.",
          },
        },
        404
      );
    return c.json({ ...run, busy: activeId === run.id });
  });
  return route;
}

const onboardingRunBody = z
  .object({
    slug: z
      .string()
      .max(100)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    mode: z.enum(["onboard", "backfill", "limitations"]),
    discover: z.boolean().optional(),
    fix: z.boolean().optional(),
  })
  .strict();

export const onboardingRunRoute = createOnboardingRunRoute();
