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
  // The Railway service currently has healthcheckPath: null (verified
  // 2026-07-02), so nothing kills a slow boot. If a deploy healthcheck is
  // ever configured on /health, its timeout MUST exceed
  // STARTUP_DB_RETRY_BUDGET_MS (Railway's default healthcheck timeout is
  // 300s < our 600s budget) or deploys during DB degradation get killed
  // mid-retry and the budget silently never applies.
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
  const { startTestScheduler } = await import("./jobs/test-scheduler.js");

  startTestScheduler();

  const { startInvariantChecker } = await import("./jobs/invariant-checker.js");
  startInvariantChecker();

  // DEC-20260812-A quality floor (Readiness P3): daily tick quarantining
  // capabilities below the real-traffic completion floor. Self-throttled to
  // 3 quarantines/run; deactivation is proposal-only. 15-min startup delay;
  // advisory lock 20260812 dedups across instances.
  const { startQualityFloor } = await import("./jobs/quality-floor.js");
  startQualityFloor();

  const { startActivationDrip } = await import("./jobs/activation-drip.js");
  startActivationDrip();

  const { startDbRetention } = await import("./jobs/db-retention.js");
  startDbRetention();

  // F-0-009 Stage 2: integrity hashing is now two-phase. The worker
  // picks up pending transactions and fills in the hash chain.
  const { startIntegrityHashRetry } = await import("./jobs/integrity-hash-retry.js");
  startIntegrityHashRetry();

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
