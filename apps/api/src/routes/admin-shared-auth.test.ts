import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
// Exercise real handlers with no DB or paid/network side effects. Successful auth
// reaches handler validation or these sentinels; it is not an assertion about DB work.
vi.mock("../db/index.js", () => ({ getDb: () => { throw new Error("handler reached DB"); } }));
vi.mock("../lib/dependency-health.js", () => ({ runDependencyHealthChecks: vi.fn(async () => []) }));
vi.mock("../lib/test-runner.js", () => ({ runTests: vi.fn(async () => []) }));
vi.mock("../lib/health-sweep.js", () => ({ runWeeklyHealthSweep: vi.fn(async () => ({})) }));
vi.mock("../lib/startup-migrations.js", () => ({ runStartupMigrations: vi.fn(async () => ({})) }));
vi.mock("../lib/digest-compiler.js", () => ({ compileWeeklyDigest: vi.fn(async () => ({})) }));
vi.mock("../lib/digest-formatter.js", () => ({ formatDigestEmail: vi.fn(() => ({})) }));
vi.mock("../lib/digest-sender.js", () => ({ isEmailConfigured: () => false, sendDigestEmail: vi.fn() }));
vi.mock("../lib/external-outage-digest.js", () => ({ sendExternalOutageDigest: vi.fn(async () => ({})) }));
vi.mock("../lib/admin-auth.js", async importOriginal => {
  const original = await importOriginal<typeof import("../lib/admin-auth.js")>();
  return { ...original, isValidAdminAuth: vi.fn(original.isValidAdminAuth) };
});
import { isValidAdminAuth } from "../lib/admin-auth.js";
import { internalTestsRoute } from "./internal-tests.js";
import { internalHealthMonitorRoute } from "./internal-health-monitor.js";
import { internalOnboardingRoute } from "./internal-onboarding.js";
const app = new Hono().route("/tests", internalTestsRoute).route("/health", internalHealthMonitorRoute).route("/onboarding", internalOnboardingRoute);
app.onError(() => new Response("handler reached", { status: 500 }));
const routes = [
  ["POST", "/tests/run"], ["GET", "/tests/health"], ["POST", "/tests/recalibrate"],
  ["POST", "/tests/patch-suite-rules"], ["GET", "/tests/cost-summary"],
  ["POST", "/tests/admin/apply-migrations"], ["POST", "/tests/admin/run-script"],
  ["POST", "/health/capabilities/test/restore"], ["POST", "/health/capabilities/test/publish"],
  ["POST", "/health/capabilities/test/unpublish"], ["POST", "/health/capabilities/test/suspend"],
  ["POST", "/health/capabilities/test/revalidate"], ["GET", "/health/platform-status"],
  ["POST", "/health/health-sweep"], ["POST", "/health/health-monitor/send-digest"],
  ["POST", "/health/health-monitor/send-external-outage-digest"], ["POST", "/onboarding/fix-latency"],
];
beforeEach(() => vi.clearAllMocks());
describe.each(routes)("H6 shared admin auth %s %s", (method, path) => {
  it.each([undefined, "Bearer wrong", `Bearer ${process.env.ADMIN_SECRET}`])("delegates %s to the shared constant-time check", async auth => {
    const response = await app.request(path, { method, headers: { ...(auth ? { Authorization: auth } : {}), "Content-Type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) });
    expect(isValidAdminAuth).toHaveBeenCalledWith(auth);
    if (auth === `Bearer ${process.env.ADMIN_SECRET}`) {
      expect(response.status).not.toBe(401); expect(response.status).not.toBe(404);
      expect(vi.mocked(isValidAdminAuth).mock.results[0].value).toBe(true);
    } else expect(response.status).toBe(401);
  });
});
