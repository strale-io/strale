/**
 * Upstream replay contract tests for network executors (H7c batch 2,
 * architecture review §7.1 and §7.4 item 4).
 *
 * offline-contract.test.ts judges the executors that need no network. This
 * file judges executors that call an upstream: each recording under
 * __fixtures__/upstream/ holds what the upstream answered once, live, on the
 * manifest's known_answer input (captured by scripts/record-upstream.ts). The
 * real executor runs on that input with `fetch` answering only from the
 * recording, DNS stubbed and the clock frozen at the capture moment, and its
 * output is judged with the production runner's own rules. A change that
 * breaks how the executor builds its request or parses the answer fails CI.
 *
 * A saved executor output would prove nothing here (§7.1); a replayed
 * upstream answer does, and the perturbation test below proves it per slug:
 * with the recorded bodies emptied, the contract must fail.
 *
 * What this cannot see is the upstream changing. That is the weekly
 * `record-upstream.ts --check` run in weekly-drift.yml; see the README in
 * __fixtures__/upstream/ for re-capture.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getDeactivatedCapabilities } from "./auto-register.js";
import { createReplayFetch, loadRecordings, type UpstreamRecording } from "../test-helpers/upstream-replay.js";
import { judgeKnownAnswer, knownAnswerCheckCount, loadExecutor, loadManifest } from "../test-helpers/known-answer-contract.js";

// validateUrl resolves the host before every safeFetch; without this the
// replay would still touch DNS. A failed lookup is what validateUrl tolerates.
vi.mock("dns/promises", () => {
  const offline = async () => {
    throw Object.assign(new Error("DNS blocked in upstream replay test"), { code: "ENOTFOUND" });
  };
  return { default: { resolve4: offline, resolve6: offline }, resolve4: offline, resolve6: offline };
});

const NETWORK_SOURCE_TYPES = new Set(["api", "scrape"]);

/**
 * Floor on the number of executors judged here. A gate whose input set
 * shrinks to nothing passes vacuously (LESSONS.md F5). Raise it as recordings
 * are added; never lower it to make a red run green.
 */
const MIN_RECORDED = 21;

/**
 * Modules that reach the network without `fetch`. An executor whose import
 * graph uses one would make real I/O under replay, so it may not be recorded.
 * The two allowed files are fetch's own SSRF guard: safe-fetch.ts hands its
 * agents to fetch (stubbed here), and url-validator.ts uses dns/promises
 * (mocked above).
 */
const NETWORK_MODULE = /(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\(\s*)["'](?:node:)?(?:dns|net|tls|http|https|http2|dgram|undici)(?:\/promises)?["']/;
const ALLOWED_NETWORK_FILES = new Set(["lib/safe-fetch.ts", "lib/url-validator.ts"]);
const SRC = resolve(import.meta.dirname, "..");

function importGraph(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file) || !existsSync(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  for (const m of source.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
    importGraph(resolve(dirname(file), m[1]).replace(/\.js$/, ".ts"), seen);
  }
  return seen;
}

const recordings = loadRecordings();
const deactivated = getDeactivatedCapabilities();

async function replay(recording: UpstreamRecording, perturb: boolean) {
  vi.setSystemTime(new Date(recording.recorded_at));
  const replayFetch = createReplayFetch(recording.exchanges, { perturb });
  vi.stubGlobal("fetch", replayFetch.fetch);
  const manifest = loadManifest(recording.slug);
  const executor = await loadExecutor(manifest);
  if (!executor) throw new Error(`${recording.slug}: no executor registered`);
  try {
    const result = await executor(structuredClone(recording.input));
    return { replayFetch, failures: judgeKnownAnswer(manifest, result.output) };
  } catch (err) {
    return { replayFetch, failures: [`executor threw: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

beforeEach(() => {
  // A fresh module graph per run: module-level caches (ECB rates, the ESMA
  // register) would otherwise answer from an earlier test and skip the replay.
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("upstream replay contract: network executors", () => {
  it(`judges at least ${MIN_RECORDED} executors`, () => {
    expect(recordings.length).toBeGreaterThanOrEqual(MIN_RECORDED);
  });

  it("records only active network executors, each on its current known_answer input", () => {
    const problems = recordings.flatMap((r) => {
      const manifest = loadManifest(r.slug);
      const out: string[] = [];
      if (!NETWORK_SOURCE_TYPES.has(String(manifest.data_source_type))) out.push(`${r.slug}: data_source_type ${manifest.data_source_type} belongs in offline-contract.test.ts`);
      if (deactivated.has(r.slug)) out.push(`${r.slug}: deactivated; delete its recording`);
      if (knownAnswerCheckCount(manifest) === 0) out.push(`${r.slug}: known_answer asserts nothing`);
      if (JSON.stringify(r.input) !== JSON.stringify(manifest.test_fixtures?.known_answer?.input)) {
        out.push(`${r.slug}: manifest known_answer input changed since the recording; re-capture with scripts/record-upstream.ts`);
      }
      return out;
    });
    expect(problems).toEqual([]);
  });

  it("records no executor that reaches the network without fetch", () => {
    const reaching = recordings.flatMap((r) =>
      [...importGraph(resolve(SRC, "capabilities", `${r.slug}.ts`))]
        .map((file) => file.slice(SRC.length + 1))
        .filter((rel) => !ALLOWED_NETWORK_FILES.has(rel) && NETWORK_MODULE.test(readFileSync(resolve(SRC, rel), "utf8")))
        .map((rel) => `${r.slug} -> ${rel}`),
    );
    expect(reaching).toEqual([]);
  });

  it.each(recordings.map((r) => [r.slug, r] as const))("%s meets its known answer on the recorded upstream", async (slug, recording) => {
    const { replayFetch, failures } = await replay(recording, false);
    expect(replayFetch.misses, `${slug}: requests the recording cannot answer`).toEqual([]);
    expect(replayFetch.served.length, `${slug}: never asked the upstream`).toBeGreaterThan(0);
    expect(failures, slug).toEqual([]);
  }, 30_000);

  it.each(recordings.map((r) => [r.slug, r] as const))("%s fails its known answer when the upstream content is gone", async (slug, recording) => {
    const { failures } = await replay(recording, true);
    expect(failures.length, `${slug}: contract passes without the recorded content, so the test above proves nothing about parsing`).toBeGreaterThan(0);
  }, 30_000);
});
