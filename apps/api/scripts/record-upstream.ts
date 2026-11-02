/**
 * Record, or re-check, the upstream responses behind the replay contract test
 * (`src/capabilities/upstream-replay-contract.test.ts`, H7c batch 2).
 *
 *   npx tsx scripts/record-upstream.ts --slug weather-lookup,lei-lookup   # capture and write
 *   npx tsx scripts/record-upstream.ts --check                            # live re-check every recording
 *   npx tsx scripts/record-upstream.ts --check --slug lei-lookup
 *
 * Capture runs the executor once, live, on its manifest's known_answer input,
 * through the same getExecutor wrapper production uses (manifest acquisition
 * method, so the honest user agent and robots.txt apply on page reads), with
 * `fetch` wrapped to record every exchange. It writes the recording only if:
 *   - the public catalogue lists the slug as free_unlimited or free_quota
 *     (one call inside a free quota). Paid classes are refused outright;
 *   - no request went to a ToS-prohibited target (tos-blocklist.ts);
 *   - the live output meets the known_answer contract;
 *   - no response body exceeds MAX_RECORDED_BODY_BYTES;
 *   - no value of any environment variable of 16+ characters appears in it.
 * E-mail addresses in bodies are replaced, and Set-Cookie values are dropped.
 * The vitest run that follows is the proof the recording replays.
 *
 * --check runs the same live call for every existing recording and reports
 * drift without writing: the live output no longer meets the contract, the
 * executor no longer asks the recorded requests, a recorded status moved, or
 * the recording is older than MAX_RECORDING_AGE_DAYS.
 * The weekly drift workflow runs it; a finding means re-capture (and, if the
 * contract broke live, a real upstream change to fix in the executor).
 *
 * Each slug runs in its own child process, so module-level caches shared by
 * executors (ECB rates, ESMA register) cannot hide a request from a recording.
 *
 * dispatcher-gate-exempt: invokes executors directly to record their live
 * upstream exchange; restricted to the free cost classes above, one call per
 * slug per run, no DB (allowlisted in check-no-direct-getexecutor-in-scripts.mjs).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  captureResponse,
  describeRequest,
  loadRecordings,
  MAX_RECORDED_BODY_BYTES,
  recordedResponse,
  recordingPath,
  redactEmails,
  requestKey,
  type RecordedExchange,
  type UpstreamRecording,
} from "../src/test-helpers/upstream-replay.js";
import { judgeKnownAnswer, loadExecutor, loadManifest } from "../src/test-helpers/known-answer-contract.js";
import { findProhibitedTarget } from "../src/lib/tos-blocklist.js";

const FREE_COST_CLASSES = new Set(["free_unlimited", "free_quota"]);

/**
 * Per-slug body reductions for content that names people or bloats the file
 * and that the known_answer contract does not depend on. Each says what it
 * removed; the replay test is the proof the contract still holds without it.
 */
const REDUCERS: Record<string, { what: string; reduce: (body: string) => string }> = {
  "pypi-package-info": {
    what: "info.description (the published README, which names its author) replaced with a placeholder",
    reduce: (body) => {
      const data = JSON.parse(body) as { info?: { description?: string } };
      if (data.info?.description) data.info.description = "Fixture README: removed by the recorder.";
      return JSON.stringify(data);
    },
  },
  "cve-lookup": {
    what: "every advisory's details text replaced with a placeholder (advisory prose can credit a named reporter); summary kept",
    reduce: (body) => {
      const data = JSON.parse(body) as { vulns?: Array<Record<string, unknown>> };
      for (const vuln of data.vulns ?? []) {
        if (typeof vuln.details === "string") vuln.details = "Fixture details: removed by the recorder.";
        delete vuln.credits;
      }
      return JSON.stringify(data);
    },
  },
  "cve-details": {
    what: "references hosted on twitter.com, x.com or github.com dropped (they name individual researchers)",
    reduce: (body) => {
      const data = JSON.parse(body) as { vulnerabilities?: Array<{ cve?: { references?: Array<{ url?: string }> } }> };
      for (const v of data.vulnerabilities ?? []) {
        if (v.cve?.references) {
          v.cve.references = v.cve.references.filter((r) => !/^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|github\.com)\//i.test(r.url ?? ""));
        }
      }
      return JSON.stringify(data);
    },
  },
  "ted-procurement": {
    what: "every notice's description-proc text replaced with a placeholder (free text that can name a buyer's contact person)",
    reduce: (body) => {
      const data = JSON.parse(body) as { notices?: Array<Record<string, unknown>> };
      for (const notice of data.notices ?? []) {
        const desc = notice["description-proc"];
        if (desc && typeof desc === "object") {
          notice["description-proc"] = Object.fromEntries(Object.keys(desc).map((lang) => [lang, "Fixture description: removed by the recorder."]));
        }
      }
      return JSON.stringify(data);
    },
  },
};
const CATALOGUE_URL = "https://api.strale.io/v1/capabilities";
/** --check reports a recording older than this even when nothing drifted, so shapes do not fossilise. */
const MAX_RECORDING_AGE_DAYS = 90;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function costClassOf(slug: string): Promise<string | undefined> {
  const res = await fetch(CATALOGUE_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`catalogue returned HTTP ${res.status}`);
  const body = (await res.json()) as { capabilities: { slug: string; cost_class?: string }[] };
  return body.capabilities.find((c) => c.slug === slug)?.cost_class;
}

/** Run one slug live with fetch recorded. Returns the exchanges and the contract verdict. */
async function runLive(slug: string): Promise<{ exchanges: RecordedExchange[]; failures: string[]; oversize: string[] }> {
  const manifest = loadManifest(slug);
  const input = manifest.test_fixtures?.known_answer?.input;
  if (!input) throw new Error(`${slug}: manifest has no known_answer input`);
  const executor = await loadExecutor(manifest);
  if (!executor) throw new Error(`${slug}: no executor registered`);

  const realFetch = globalThis.fetch;
  const exchanges: RecordedExchange[] = [];
  const oversize: string[] = [];
  globalThis.fetch = async (target: RequestInfo | URL, init?: RequestInit) => {
    const request = await describeRequest(target, init);
    const prohibited = findProhibitedTarget(request.url);
    if (prohibited) throw new Error(`${slug}: refusing to record a ToS-prohibited target ${request.url}`);
    // The executor reads the recorded copy, exactly what replay will hand it.
    const { oversize: tooBig, ...recorded } = await captureResponse(await realFetch(target, init));
    if (tooBig) {
      oversize.push(requestKey(request));
      throw new Error(`response over ${MAX_RECORDED_BODY_BYTES} bytes`);
    }
    exchanges.push({ request, response: recorded });
    return recordedResponse(request.url, recorded);
  };
  try {
    const result = await executor(structuredClone(input));
    return { exchanges, failures: judgeKnownAnswer(manifest, result.output), oversize };
  } catch (err) {
    return { exchanges, failures: [`executor threw: ${err instanceof Error ? err.message : String(err)}`], oversize };
  } finally {
    globalThis.fetch = realFetch;
  }
}

function leakedSecrets(text: string): string[] {
  return Object.entries(process.env)
    .filter(([, value]) => typeof value === "string" && value.length >= 16 && text.includes(value))
    .map(([name]) => name);
}

async function notFree(slug: string): Promise<string | undefined> {
  const costClass = await costClassOf(slug);
  return costClass && FREE_COST_CLASSES.has(costClass) ? undefined : `cost_class ${costClass ?? "unlisted"} is not free; not calling it`;
}

async function captureOne(slug: string): Promise<string[]> {
  const refused = await notFree(slug);
  if (refused) return [refused];
  const recordedAt = new Date().toISOString();
  const { exchanges, failures, oversize } = await runLive(slug);
  if (oversize.length) failures.push(`response over ${MAX_RECORDED_BODY_BYTES} bytes: ${oversize.join(", ")}`);
  else if (exchanges.length === 0) failures.push("the executor made no fetch call; nothing to record");
  if (failures.length) return failures;

  const redactions: string[] = [];
  const reducer = REDUCERS[slug];
  if (reducer) {
    for (const { response } of exchanges) if (response.status === 200) response.body = reducer.reduce(response.body);
    redactions.push(reducer.what);
  }
  const emails = redactEmails(exchanges);
  if (emails) redactions.push(`${emails} e-mail address(es) replaced with redacted@example.invalid`);
  if (exchanges.some((e) => e.response.headers["set-cookie"])) redactions.push("Set-Cookie values replaced with 'redacted'");

  const recording: UpstreamRecording = {
    slug,
    recorded_at: recordedAt,
    input: loadManifest(slug).test_fixtures!.known_answer!.input!,
    redactions,
    exchanges,
  };
  const text = `${JSON.stringify(recording, null, 2)}\n`;
  const leaked = leakedSecrets(text);
  if (leaked.length) return [`recording contains the value of ${leaked.join(", ")}; not writing`];
  writeFileSync(recordingPath(slug), text);
  return [];
}

async function checkOne(slug: string): Promise<string[]> {
  const path = recordingPath(slug);
  if (!existsSync(path)) return ["no recording"];
  const recording = JSON.parse(readFileSync(path, "utf8")) as UpstreamRecording;
  const refused = await notFree(slug);
  if (refused) return [refused];
  const { exchanges, failures, oversize } = await runLive(slug);
  const drift = failures.map((f) => `live contract: ${f}`);
  for (const key of oversize) drift.push(`response now over ${MAX_RECORDED_BODY_BYTES} bytes: ${key}`);
  const live = new Map(exchanges.map((e) => [requestKey(e.request), e.response.status]));
  for (const { request, response } of recording.exchanges) {
    const status = live.get(requestKey(request));
    if (status === undefined) drift.push(`no longer requested: ${requestKey(request)}`);
    else if (status !== response.status) drift.push(`status ${response.status} -> ${status}: ${requestKey(request)}`);
  }
  const days = Math.round((Date.now() - Date.parse(recording.recorded_at)) / 86_400_000);
  if (days > MAX_RECORDING_AGE_DAYS) drift.push(`recording is older than ${MAX_RECORDING_AGE_DAYS} days; re-capture`);
  return drift.map((d) => `${d} (recorded ${days} days ago)`);
}

async function main(): Promise<number> {
  const check = process.argv.includes("--check");
  const child = arg("--child");
  if (child) {
    // A child whose event loop drains on a never-settled promise exits with
    // this code instead of a silent 0 the parent would count as recorded.
    process.exitCode = 3;
    const problems = check ? await checkOne(child) : await captureOne(child);
    for (const p of problems) console.log(`  ${child}: ${p}`);
    if (!problems.length) console.log(`  ${child}: ${check ? "no drift" : `recorded ${recordingPath(child)}`}`);
    return problems.length ? 1 : 0;
  }

  const slugs = arg("--slug")?.split(",").map((s) => s.trim()).filter(Boolean)
    ?? (check ? loadRecordings().map((r) => r.slug) : undefined);
  if (!slugs?.length) {
    console.error("usage: record-upstream.ts --slug a,b | --check [--slug a,b]");
    return 2;
  }
  let failed = 0;
  for (const slug of slugs) {
    const run = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), "--child", slug, ...(check ? ["--check"] : [])], {
      stdio: "inherit",
      timeout: 120_000,
    });
    if (run.status !== 0) failed++;
  }
  console.log(`${slugs.length - failed}/${slugs.length} ${check ? "without drift" : "recorded"}`);
  if (!check && failed < slugs.length) console.log("Next: npx vitest run src/capabilities/upstream-replay-contract.test.ts");
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => {
  console.error(err);
  process.exit(1);
});
