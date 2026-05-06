/**
 * Regression test for the Browserless v2 OSS-tier flag-filtering failure
 * mode discovered 2026-05-06 (Phase 2 of the chromium bug fix).
 *
 * **What this guards.** Browserless v2 OSS tier filters per-request launch
 * flags through an undocumented allowlist. Of the 4 flags we send, only
 * `--no-sandbox` survived in production — the chromium service's own debug
 * log under v2 showed Chrome launched with just `--remote-debugging-port`,
 * `--no-sandbox`, `--disable-features=LocalNetworkAccessChecks`, and
 * `--user-data-dir`. `--disable-dev-shm-usage` is load-bearing on Railway's
 * small `/dev/shm`; without it Chrome aborts with SIGABRT and every scraping
 * capability breaks.
 *
 * Phase 3 (this test ships with) pinned the chromium service to Browserless
 * v1, which has no allowlist filter. The pin is a Railway dashboard config,
 * not a repo value, so this file does NOT verify the live service. What it
 * verifies is the helper-side contract: the canonical 4-flag list MUST be
 * present in the encoded `?launch=` payload byte-for-byte. Anyone touching
 * `browserless-launch.ts` sees this test and the explicit list.
 *
 * Phase 2 journal: https://www.notion.so/35867c87082c81cc87f4fc82e1f5ebba
 */

import { describe, expect, it } from "vitest";
import {
  BROWSERLESS_LAUNCH_ARGS,
  buildBrowserlessRequestUrl,
} from "./browserless-launch.js";

const REQUIRED_FLAGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-setuid-sandbox",
] as const;

describe("chromium launch-arg flag-filtering regression (Phase 2 / 2026-05-06)", () => {
  it("BROWSERLESS_LAUNCH_ARGS is the canonical 4-flag list, in order, byte-for-byte", () => {
    expect([...BROWSERLESS_LAUNCH_ARGS]).toEqual([...REQUIRED_FLAGS]);
  });

  it("the encoded URL payload contains every required flag string byte-for-byte (helper contract only — service-side filtering is NOT verified here)", () => {
    const url = buildBrowserlessRequestUrl(
      "http://chromium.railway.internal:8080",
      "/content",
      "test-token",
    );
    const launchMatch = url.match(/launch=([^&]+)/);
    expect(launchMatch).not.toBeNull();
    const decoded = Buffer.from(launchMatch![1], "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { args: string[] };
    for (const flag of REQUIRED_FLAGS) {
      expect(parsed.args).toContain(flag);
    }
  });

  it("the launch payload's args array equals the canonical list exactly (catches accidental additions and reorderings too)", () => {
    const url = buildBrowserlessRequestUrl(
      "http://chromium.railway.internal:8080",
      "/content",
      "test-token",
    );
    const launchMatch = url.match(/launch=([^&]+)/);
    const decoded = Buffer.from(launchMatch![1], "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { args: string[] };
    expect(parsed.args).toEqual([...REQUIRED_FLAGS]);
  });
});
