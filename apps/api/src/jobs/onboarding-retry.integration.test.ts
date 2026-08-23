/**
 * The onboarding retry sweeper against a real Postgres (WP10, risk CR-08).
 *
 * `capability-persistence.ts` has marked failed post-commit hooks with
 * `lifecycle_state = 'hook_failed'` since DEC-20260421-B, and promised a
 * sweeper three times in its own comments. None was ever written: before this
 * package a grep for `hook_failed` across `src/` returned the writer and its
 * test file and nothing else. The marker was write-only.
 *
 * The consequence is not cosmetic. The hook is what generates a capability's
 * test suites, so a capability whose hook failed has none, is never selected
 * by the scheduler, and produces no quality signal — permanently, silently.
 *
 * These tests run against real rows because the sweeper's two load-bearing
 * decisions are SQL: the candidate query's NOT EXISTS anti-join against
 * escalation events (what stops an unfixable capability retrying forever), and
 * the conditional UPDATE that restores lifecycle_state only from 'hook_failed'.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/** The hook itself is exercised by the onboarding suites; here it is a lever. */
const hookMock = vi.fn<(slug: string) => Promise<void>>();
vi.mock("../lib/capability-onboarding.js", () => ({
  onCapabilityCreated: (slug: string) => hookMock(slug),
}));

const { runOnboardingRetryOnce, MAX_ATTEMPTS, RETRY_EVENT, ESCALATION_ACTION } = await import(
  "./onboarding-retry.js"
);

describeMaybe("onboarding retry sweeper against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const slugs = new Set<string>();

  function newSlug(label: string): string {
    const slug = `wp10-${label}-${randomUUID().slice(0, 8)}`;
    slugs.add(slug);
    return slug;
  }

  async function seedCapability(slug: string, lifecycleState: string) {
    await db.execute(sql`
      INSERT INTO capabilities (slug, name, description, category, price_cents,
                                input_schema, output_schema, lifecycle_state)
      VALUES (${slug}, ${slug}, 'wp10 fixture', 'validation', 1,
              '{}'::jsonb, '{}'::jsonb, ${lifecycleState})
    `);
  }

  async function lifecycleOf(slug: string): Promise<string | undefined> {
    const rows = await db.execute(
      sql`SELECT lifecycle_state FROM capabilities WHERE slug = ${slug}`,
    );
    return (rows as unknown as Array<{ lifecycle_state: string }>)[0]?.lifecycle_state;
  }

  async function eventsFor(slug: string, action?: string) {
    const rows = await db.execute(sql`
      SELECT action_taken, details FROM health_monitor_events
       WHERE event_type = ${RETRY_EVENT} AND capability_slug = ${slug}
         ${action ? sql`AND action_taken = ${action}` : sql``}
       ORDER BY created_at
    `);
    return rows as unknown as Array<{ action_taken: string; details: unknown }>;
  }

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    hookMock.mockReset();
    for (const slug of slugs) {
      await db.execute(sql`DELETE FROM health_monitor_events WHERE capability_slug = ${slug}`);
      await db.execute(sql`DELETE FROM capabilities WHERE slug = ${slug}`);
    }
    slugs.clear();
  });

  it("re-runs the hook for a hook_failed capability and returns it to draft", async () => {
    const slug = newSlug("recovers");
    await seedCapability(slug, "hook_failed");
    hookMock.mockResolvedValue(undefined);

    const outcome = await runOnboardingRetryOnce();

    expect(hookMock).toHaveBeenCalledWith(slug);
    expect(outcome.recovered).toContain(slug);
    expect(await lifecycleOf(slug)).toBe("draft");

    const events = await eventsFor(slug, "recovered");
    expect(events).toHaveLength(1);
  });

  it("leaves capabilities in other lifecycle states alone", async () => {
    const active = newSlug("active");
    const draft = newSlug("draft");
    await seedCapability(active, "active");
    await seedCapability(draft, "draft");
    hookMock.mockResolvedValue(undefined);

    const outcome = await runOnboardingRetryOnce();

    expect(outcome.examined).toBe(0);
    expect(hookMock).not.toHaveBeenCalled();
    expect(await lifecycleOf(active)).toBe("active");
    expect(await lifecycleOf(draft)).toBe("draft");
  });

  it("does not promote a recovered capability onto the served catalog", async () => {
    // 'draft' is deliberate. A capability that just completed onboarding has
    // earned nothing; publishing is capability-promotion's decision and
    // requires a green week of real results.
    const slug = newSlug("notpromoted");
    await seedCapability(slug, "hook_failed");
    hookMock.mockResolvedValue(undefined);

    await runOnboardingRetryOnce();

    expect(await lifecycleOf(slug)).not.toBe("active");
    expect(await lifecycleOf(slug)).toBe("draft");
  });

  it("records the failure and keeps the capability marked when the hook still throws", async () => {
    const slug = newSlug("stillfails");
    await seedCapability(slug, "hook_failed");
    hookMock.mockRejectedValue(new Error("gate 3: schema incoherent"));

    const outcome = await runOnboardingRetryOnce();

    expect(outcome.stillFailing).toContain(slug);
    expect(outcome.escalated).toEqual([]);
    expect(await lifecycleOf(slug)).toBe("hook_failed");

    const failures = await eventsFor(slug, "retry_failed");
    expect(failures).toHaveLength(1);
    expect(JSON.stringify(failures[0].details)).toContain("gate 3: schema incoherent");
  });

  it("escalates after MAX_ATTEMPTS and then stops retrying that capability", async () => {
    const slug = newSlug("exhausts");
    await seedCapability(slug, "hook_failed");
    hookMock.mockRejectedValue(new Error("deterministically broken"));

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await runOnboardingRetryOnce();
    }

    const escalations = await eventsFor(slug, ESCALATION_ACTION);
    expect(escalations).toHaveLength(1);
    expect(JSON.stringify(escalations[0].details)).toContain("will not be scheduled for testing");

    // The anti-join must now exclude it: a hook that fails the same way five
    // times will not start working on the sixth, and retrying forever would
    // bury the escalation the operator is supposed to act on.
    const callsBefore = hookMock.mock.calls.length;
    const outcome = await runOnboardingRetryOnce();

    expect(outcome.examined).toBe(0);
    expect(hookMock.mock.calls.length).toBe(callsBefore);
  });

  it("counts attempts per capability, not globally", async () => {
    const doomed = newSlug("doomed");
    const fresh = newSlug("fresh");
    await seedCapability(doomed, "hook_failed");
    hookMock.mockRejectedValue(new Error("nope"));

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await runOnboardingRetryOnce();
    }
    expect(await eventsFor(doomed, ESCALATION_ACTION)).toHaveLength(1);

    // A different capability failing once must not inherit the first one's
    // exhausted budget.
    await seedCapability(fresh, "hook_failed");
    const outcome = await runOnboardingRetryOnce();

    expect(outcome.stillFailing).toContain(fresh);
    expect(outcome.escalated).not.toContain(fresh);
    expect(await eventsFor(fresh, ESCALATION_ACTION)).toHaveLength(0);
  });

  it("is a no-op when nothing is in hook_failed — the current production state", async () => {
    const outcome = await runOnboardingRetryOnce();
    expect(outcome).toEqual({ examined: 0, recovered: [], stillFailing: [], escalated: [] });
    expect(hookMock).not.toHaveBeenCalled();
  });
});
