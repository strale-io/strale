import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env from monorepo root
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { serve } from "@hono/node-server";
import { autoRegisterCapabilities } from "./capabilities/auto-register.js";
import { getRegisteredCount } from "./capabilities/index.js";

const MIN_EXPECTED_EXECUTORS = 200;

async function main() {
  // Register all capability executors before importing app
  // (app.ts previously did this via synchronous side-effect imports)
  await autoRegisterCapabilities();

  // Health gate: refuse to start if registration catastrophically failed.
  // Throws instead of exiting so main().catch can page the operator —
  // direct process.exit here would reproduce the 2026-07-02 silent-death mode.
  const count = getRegisteredCount();
  if (count < MIN_EXPECTED_EXECUTORS) {
    const { StartupFatalError } = await import("./lib/startup-fatal.js");
    throw new StartupFatalError(
      `Only ${count} executors registered (expected >= ${MIN_EXPECTED_EXECUTORS}). ` +
        `This usually means the auto-register file filter is broken — check auto-register.ts.`,
      `The API refused to start because most of its capabilities failed to load. ` +
        `This is a code problem from the latest deploy, not an outage that heals itself. ` +
        `Roll back: Railway dashboard -> Deployments -> pick the previous working deploy -> Redeploy.`,
    );
  }
  console.log(`[startup] Health gate passed: ${count} executors registered`);

  // Cert-audit C11: surface alerting/log-sink misconfiguration loudly so
  // production doesn't drift into "alerts only land in stdout" without
  // operations noticing.
  const { assertAlertingConfigured } = await import("./lib/alerting.js");
  assertAlertingConfigured();

  // Execution receipts (Phase 5): the process must be able to name the commit
  // it is serving BEFORE it serves anything.
  //
  // Every receipt records which code produced the result. A process that
  // cannot identify its own build would emit commitments nobody can later
  // interpret, and it would do so silently -- so this refuses to boot instead.
  //
  // Placed here, before any database work, because it is a synchronous
  // environment read: a deployment that cannot satisfy it should fail in a
  // second, not after migrations.
  //
  // Verified against the platform before wiring (PHASE-5-DEPLOY-IDENTITY-
  // EVIDENCE.md): 994 of the last 1000 deployments carry a full 40-hex
  // commitHash, and the redeploy path -- which is also how Railway expresses
  // rollback -- is 25 for 25. The six that carry nothing are repo=null CLI
  // upload deploys from 2026-04-05/06, four of which served production. That
  // path is real, so the guidance below names it.
  //
  // Refusing is safe: the service healthchecks /health/deep, and a failed
  // healthcheck does not cut over -- the previous deployment keeps serving.
  const { assertDeployIdentity } = await import("./lib/receipt/deploy-identity.js");
  try {
    const identity = assertDeployIdentity();
    console.log(
      "[startup] Deploy identity: " +
        identity.deployCommit +
        (identity.enforced ? "" : " (sentinel; not enforced outside production)"),
    );
  } catch (err) {
    const { StartupFatalError } = await import("./lib/startup-fatal.js");
    throw new StartupFatalError(
      (err as Error).message,
      "This deployment has no git commit identity, so it cannot produce " +
        "execution receipts and refused to start. Railway sets " +
        "RAILWAY_GIT_COMMIT_SHA only for deploys originating from a GitHub " +
        "commit -- a CLI upload deploy (railway up) has none, and this " +
        "project used that path on 2026-04-05/06. " +
        "Production is NOT down: this deploy failed its healthcheck and " +
        "Railway kept the previous deployment serving. " +
        "Fix: deploy from git instead -- push to main, or Railway dashboard " +
        "-> Deployments -> Redeploy on any git-sourced deployment.",
    );
  }

  // Validate required provider env vars
  const { getActiveProviders } = await import("./lib/dependency-manifest.js");
  const missingVars: string[] = [];
  for (const provider of getActiveProviders()) {
    if (provider.envVar && !process.env[provider.envVar]) {
      missingVars.push(`${provider.envVar} (${provider.displayName})`);
    }
  }
  if (missingVars.length > 0) {
    console.warn(
      "[startup] Missing provider env vars — affected capabilities will use fallbacks:\n" +
        missingVars.map((v) => `  - ${v}`).join("\n"),
    );
  } else {
    console.log("[startup] All provider env vars present.");
  }

  // x402 facilitator selection — logged at boot so a flag flip is verifiable
  // from the deploy log (DEC-20260504-C: confirm the deploy produced the
  // expected effect, don't assume). The import also forces
  // resolveFacilitatorSelection's fail-fast to run before traffic is served.
  const { getFacilitatorSelection } = await import("./lib/x402-gateway.js");
  const facilitatorSelection = getFacilitatorSelection();
  console.log(
    `[startup] x402 facilitator: ${facilitatorSelection.kind} (mode=${facilitatorSelection.mode}) ${facilitatorSelection.url}`,
  );

  // Manifest hygiene: unauthenticated providers must either declare a pool of
  // fallback base URLs (so one throttled endpoint doesn't trip the probe) or
  // explicitly accept the risk. This enforces the lesson from the publicnode
  // 429 incident — a single free endpoint is not a production dependency.
  const risky = getActiveProviders().filter(
    (p) =>
      p.authType === "none" &&
      (!p.fallbackBaseUrls || p.fallbackBaseUrls.length === 0) &&
      p.tier === "free",
  );
  if (risky.length > 0) {
    console.warn(
      "[startup] Unauthenticated providers with no fallback pool — add `fallbackBaseUrls` or document the opaque rate limit:\n" +
        risky.map((p) => `  - ${p.name} (${p.displayName})`).join("\n"),
    );
  }

  // Apply startup migrations BEFORE schema validation. Each block is
  // idempotent (IF NOT EXISTS / WHERE filter) so a re-run on a healthy
  // DB is a no-op. Blocking — if any block throws, the process aborts
  // before the API listens. Replaces the previously-dead
  // apps/api/scripts/apply-migrations.ts (excluded from build by
  // tsconfig and never invoked by the Dockerfile CMD).
  //
  // 2026-07-02 outage: this is the boot's first DB touchpoint, and a
  // transient CONNECT_TIMEOUT here used to be instantly fatal — Railway's
  // restartPolicyMaxRetries=10 burned through in minutes and left the
  // service CRASHED for hours after Postgres recovered. Transient
  // connectivity errors at the three pre-listen DB touchpoints now
  // wait-and-retry in-process. `startedAt` is shared across all three
  // wraps so the budget (default 10 min, STARTUP_DB_RETRY_BUDGET_MS to
  // override) is per BOOT, not per call site. Only thrown connectivity
  // errors are retried — invariant failures (schema mismatch, cost-class
  // STRICT) throw StartupFatalError and abort immediately via
  // main().catch, and real migration failures still abort immediately.
  //
  // PLATFORM CONSTRAINT: this retry loop runs BEFORE the server listens.
  //
  // This comment used to say healthcheckPath was null, "verified 2026-07-02",
  // and warned about what would happen if one were ever configured. One HAS
  // been configured since, so that warning is now a live condition rather
  // than a hypothetical: the build log of the current deployment reads
  // "Path: /health/deep, Retry window: 20s", and 20s is far below this
  // budget's 600s default (STARTUP_DB_RETRY_BUDGET_MS).
  //
  // Consequence, stated plainly: during database degradation the deploy is
  // killed at 20s and this budget never applies. The fix is the Railway
  // healthcheck window, not this code, so nothing is changed here beyond
  // correcting a comment that had gone false. Confirmed 2026-08-23, when a
  // good build failed with "1/1 replicas never became healthy" and a
  // redeploy of the identical commit went green.
  const { withStartupDbRetry } = await import("./lib/startup-db-retry.js");
  const { runStartupMigrations } = await import("./lib/startup-migrations.js");
  const dbRetryStartedAt = Date.now();
  await withStartupDbRetry("startup-migrations", () => runStartupMigrations(), {
    startedAt: dbRetryStartedAt,
  });

  // Schema validation: fail fast if DB is missing columns the code expects.
  // Runs AFTER migrations so it sees the post-migration state.
  const { validateSchema } = await import("./lib/schema-validator.js");
  await withStartupDbRetry("schema-validation", () => validateSchema(), {
    startedAt: dbRetryStartedAt,
  });

  // Phase A0b cost-class taxonomy invariant. Runs AFTER validateSchema
  // because the column must exist before the query reads it. GRACE
  // (default) surfaces a count + one log line per unclassified cap;
  // STRICT aborts boot on any unclassified row. Flip to STRICT after
  // one operational cycle confirms the GRACE log line stays empty for
  // the expected backfill horizon.
  const { assertCostClassTaxonomy, resolveCostClassMode } = await import(
    "./lib/cost-class-invariant.js"
  );
  await withStartupDbRetry(
    "cost-class-invariant",
    () => assertCostClassTaxonomy({ mode: resolveCostClassMode(process.env.COST_CLASS_MODE) }),
    { startedAt: dbRetryStartedAt },
  );

  // Import app after executors are registered
  const { app, warmCatalog } = await import("./app.js");

  // WP10 (CR-08): the durable job coordinator. Started BEFORE the jobs that
  // register with it, because its poll cycle reads the registry at each tick
  // rather than capturing it here — and because a job registering against a
  // stopped coordinator would look scheduled and never run.
  //
  // This is the single remaining boot-relative timer on the platform, and it
  // deliberately holds no business fact: it only asks `job_schedule` what is
  // due. Every cadence it acts on survives the restart that resets it.
  const { startJobCoordinator } = await import("./lib/job-coordinator.js");
  startJobCoordinator();

  const { startTestScheduler } = await import("./jobs/test-scheduler.js");

  startTestScheduler();

  // WP10 (CR-08): re-runs the post-commit onboarding hook for capabilities
  // left in lifecycle_state='hook_failed'. capability-persistence.ts has
  // promised this sweeper since DEC-20260421-B; until now nothing read the
  // marker, so a capability whose hook failed kept zero test suites forever.
  const { startOnboardingRetry } = await import("./jobs/onboarding-retry.js");
  startOnboardingRetry();

  const { startInvariantChecker } = await import("./jobs/invariant-checker.js");
  startInvariantChecker();

  // DEC-20260812-A quality floor (Readiness P3): daily tick quarantining
  // capabilities below the real-traffic completion floor. Self-throttled to
  // 3 quarantines/run; deactivation is proposal-only. 15-min startup delay;
  // advisory lock 20260812 dedups across instances.
  const { startQualityFloor } = await import("./jobs/quality-floor.js");
  startQualityFloor();

  // The floor's counterpart: publishes capabilities that have earned a green
  // week but have no code path back onto the catalog (the SQS lifecycle engine
  // that used to do this was deleted 2026-05-05). Self-throttled to 3
  // promotions/run; 20-min startup delay so it never races the floor on boot;
  // advisory lock 20260816.
  const { startCapabilityPromotion } = await import("./jobs/capability-promotion.js");
  startCapabilityPromotion();

  const { startActivationDrip } = await import("./jobs/activation-drip.js");
  startActivationDrip();

  const { startDbRetention } = await import("./jobs/db-retention.js");
  startDbRetention();

  // F-0-009 Stage 2: integrity hashing is now two-phase. The worker
  // picks up pending transactions and fills in the hash chain.
  const { startIntegrityHashRetry } = await import("./jobs/integrity-hash-retry.js");
  startIntegrityHashRetry();

  // WP3: releases wallet reservations a crash abandoned, and marks their
  // executions failed so a polling client reaches a terminal state. Bounded
  // per tick — its first production run has a backlog of 11 rows stranded
  // since April, and draining a long-silent backlog in one burst is what took
  // Postgres down on 2026-05-04 (DEC-20260504-B).
  const { startReservationReconciler } = await import("./jobs/reservation-reconciler.js");
  const { startSettlementReconciler } = await import("./jobs/settlement-reconciler.js");
  const { assertReservationTtlExceedsExecutionTimeout } = await import(
    "./lib/wallet-reservations.js"
  );
  // Fail loudly at boot rather than silently refunding live executions: the
  // executor's hard timeout is env-tunable, and if it is raised above the
  // reservation TTL the reconciler starts releasing work that is still running.
  assertReservationTtlExceedsExecutionTimeout(
    parseInt(process.env.EXEC_HARD_TIMEOUT_MS ?? "300000", 10),
  );
  startReservationReconciler();
  // WP5: the x402 half. Nothing read x402_orphan_settlements before this —
  // "awaiting reconciliation" meant awaiting a human who had to notice first.
  startSettlementReconciler();

  // Monthly REINDEX CONCURRENTLY on `transactions` — prevents B-tree
  // bloat drift that caused the 2026-04-16 outage. Uses the dedicated-
  // connection advisory-lock pattern because REINDEX CONCURRENTLY can't
  // run inside a transaction.
  const { startReindexTransactions } = await import("./jobs/reindex-transactions.js");
  startReindexTransactions();

  // Nightly EE-directors ingest from RIK Ariregister CC BY 4.0 open
  // data. Refreshes the `ee_directors` cache that backs the
  // `estonian-company-data` handler's `legal_representatives[]`
  // (DEC-20260518-E). 10-minute startup delay + 24h interval; advisory
  // lock 20260518 dedups across replicas.
  const { startEeDirectorsIngest } = await import("./jobs/ingest-ee-directors.js");
  startEeDirectorsIngest();

  // CY directors / officers monthly ingest — DRCOR open-data CSV
  // (DEC-20260518-E Phase 6). Same pattern as EE; weekly tick with
  // Last-Modified skip since DRCOR refreshes monthly. Advisory lock
  // 20260519 dedups across replicas.
  const { startCyDirectorsIngest } = await import("./jobs/ingest-cy-directors.js");
  startCyDirectorsIngest();

  // x402 settlement-volume tripwire — companion to the v2 challenge
  // migration (task #31). A v1-payer die-off is invisible from our side
  // except as falling settlement volume; this watches it and pages with
  // the rollback instructions.
  const { startX402SettlementWatch } = await import("./jobs/x402-settlement-watch.js");
  startX402SettlementWatch();

  // Revenue concentration is ~99% in one wallet. The settlement watch above
  // catches the payment rail breaking; this catches the money stopping for any
  // other reason — including the customer simply leaving.
  const { startRevenueHeartbeat } = await import("./jobs/revenue-heartbeat.js");
  startRevenueHeartbeat();

  const port = parseInt(process.env.PORT || "3000", 10);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Strale API running on http://localhost:${info.port}`);

    // Pre-warm suggest catalog after env + server are ready
    warmCatalog().catch((err: Error) =>
      console.warn("[suggest] Catalog warm-up failed:", err.message),
    );
  });

  // Cert-audit C3 follow-up: graceful shutdown on SIGTERM/SIGINT.
  // Cleanups run LIFO. HTTP server (registered last) drains in-flight
  // requests first; DB pool (registered first) is closed only after the
  // last request has returned. Without this, Railway redeploys truncate
  // requests mid-flight and tear down the pool under SIGKILL at +30s.
  const { onShutdown, installShutdownHandlers } = await import("./lib/shutdown.js");
  const { closeDbPool } = await import("./db/index.js");

  onShutdown("db-pool", () => closeDbPool());
  onShutdown(
    "http-server",
    () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  );

  installShutdownHandlers();
}

main().catch(async (err) => {
  console.error("Fatal startup error:", err);

  // 2026-07-02 outage: the process died silently 10 times and nobody was
  // paged. Best-effort email before exit (production only; RESEND_API_KEY
  // is set on Railway). Race against a 10s cap so a hung network can't
  // keep a dead process alive.
  //
  // This catch is the ONLY fatal-startup path — startup guards throw
  // (StartupFatalError where they have operator guidance) rather than
  // calling process.exit directly, so every boot death sends this page.
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    try {
      const { sendAlert } = await import("./lib/alerting.js");
      const { isTransientDbConnectError } = await import("./lib/startup-db-retry.js");
      const { StartupFatalError } = await import("./lib/startup-fatal.js");
      const guidance =
        err instanceof StartupFatalError
          ? err.operatorGuidance
          : isTransientDbConnectError(err)
            ? `This looks like TRANSIENT DB CONNECTIVITY (retry budget exhausted, DB likely still ` +
              `degraded). Check Postgres in the Railway dashboard (project: Strale). ` +
              `Once the DB is healthy, if the service shows CRASHED, run: railway redeploy --service strale`
            : `This does NOT look like a transient DB issue. Likely causes: a broken deploy ` +
              `(bad migration, missing env var, or a code/import error). What to do: ` +
              `1) Open Railway deploy logs for the strale service. ` +
              `2) If this started right after a deploy, roll back: Railway dashboard -> ` +
              `Deployments -> previous working deploy -> Redeploy. ` +
              `3) If nothing was deployed recently, keep this email — the stack trace below ` +
              `is what a debugging session needs.`;
      await Promise.race([
        sendAlert({
          subject: "API failed to start",
          severity: "critical",
          body:
            `Strale API startup aborted with a fatal error. Railway restarts it per the ` +
            `service restart policy (default: up to 10 times), then the service stays ` +
            `CRASHED until redeployed.\n\n` +
            `${guidance}\n\n` +
            `Dashboard: https://railway.com/project/16920e2f-8258-47db-86c0-60ec9d7edc13\n\n` +
            `Error: ${err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err)}`,
        }),
        new Promise<void>((r) => setTimeout(r, 10_000)),
      ]);
    } catch {
      // Alerting must never mask the original fatal error.
    }
  }

  process.exit(1);
});
