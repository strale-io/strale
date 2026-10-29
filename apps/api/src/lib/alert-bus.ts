/**
 * Second delivery channel for alerts: a comment on the agent bus.
 *
 * Incident 2026-10-28: a CRITICAL x402 page sat unseen in the inbox for 14
 * hours. The sessions that act on alerts read the agent bus, not that inbox,
 * so warnings and criticals are also posted there, as a comment on the issue
 * for channel `strale-planning`, in the bus message format that
 * `.claude/scripts/bus.mjs` reads:
 *
 *     From strale-alerts:
 *
 *     <body>
 *
 * The bus is a private GitHub repository. This repository is public, so its
 * name is never written here: it comes from BUS_REPO (owner/name), with
 * BUS_GITHUB_TOKEN, a fine-grained token holding Issues read/write on that one
 * repository. Both unset is the default and means this channel is off.
 *
 * Production cannot shell out to `gh`, so this speaks the REST API with fetch.
 * It is a side channel and must never cost the email path anything:
 * `deliverToBus` never throws, the caller does not await it, and every request
 * shares one short timeout. Failures are logged and dropped.
 *
 * The one caller that must wait is the fatal-startup page in index.ts, which
 * exits the process right after sending: it awaits `settleBusDeliveries()`
 * inside its own bounded race, or the post would die with the process.
 *
 * Not done here, on purpose: creating the channel issue. `bus.mjs` creates a
 * missing channel; an alert sender should not, so a missing channel is a
 * logged warning and nothing more.
 */

import { log, logWarn } from "./log.js";
import { suppressionReason } from "./alerting.js";

export const BUS_CHANNEL = "strale-planning";
export const BUS_SENDER = "strale-alerts";
const TIMEOUT_MS = 5_000;
// Re-resolve the channel issue at least this often: GitHub still accepts
// comments on a closed issue, but bus readers only list open channels.
const ISSUE_CACHE_MS = 60 * 60 * 1000;
const GITHUB_API = "https://api.github.com";
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

type BusConfig = { token: string; repo: string };

/** The bus target, or null when the channel is off or misconfigured. */
export function busConfig(env: NodeJS.ProcessEnv = process.env): BusConfig | null {
  const token = env.BUS_GITHUB_TOKEN?.trim();
  const repo = env.BUS_REPO?.trim();
  if (!token || !repo || !REPO_NAME.test(repo)) return null;
  return { token, repo };
}

/** Called once at boot: says whether alerts also go to the bus, never names the repo. */
export function logBusAlertingStatus(env: NodeJS.ProcessEnv = process.env): void {
  if (busConfig(env)) {
    log.info({ label: "alert-bus.enabled", channel: BUS_CHANNEL }, "alert-bus: warnings and criticals also post to the agent bus");
  } else if (env.BUS_GITHUB_TOKEN || env.BUS_REPO) {
    logWarn("alert-bus.misconfigured", "alert-bus: needs both BUS_GITHUB_TOKEN and BUS_REPO, with BUS_REPO in owner/name form; bus delivery is off");
  } else {
    log.info({ label: "alert-bus.disabled" }, "alert-bus: BUS_GITHUB_TOKEN/BUS_REPO unset; alerts go to email only");
  }
}

/** The comment body, in the bus message format. Same text the email carries. */
export function formatBusMessage(opts: { subject: string; body: string; severity: "warning" | "critical" }): string {
  return `From ${BUS_SENDER}:\n\n[Strale ${opts.severity.toUpperCase()}] ${opts.subject}\n\n${opts.body}`;
}

// The channel's issue number, once found. Channels are long-lived issues, so
// the lookup is cached for ISSUE_CACHE_MS; a failed post clears it early.
let cachedIssue: { repo: string; number: number; at: number } | null = null;

/** Test hook: forget the cached channel issue. */
export function resetBusCache(): void {
  cachedIssue = null;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "strale-alerts",
  };
}

async function findChannelIssue(cfg: BusConfig, fetchImpl: typeof fetch, signal: AbortSignal): Promise<number | null> {
  if (cachedIssue?.repo === cfg.repo && Date.now() - cachedIssue.at < ISSUE_CACHE_MS) return cachedIssue.number;
  const title = `channel: ${BUS_CHANNEL}`;
  for (let page = 1; page <= 5; page++) {
    const res = await fetchImpl(
      `${GITHUB_API}/repos/${cfg.repo}/issues?state=open&labels=channel&per_page=100&page=${page}`,
      { headers: headers(cfg.token), signal },
    );
    if (!res.ok) throw new Error(`channel lookup returned HTTP ${res.status}`);
    const batch = (await res.json()) as Array<{ number: number; title: string; pull_request?: unknown }>;
    const hit = batch.find((i) => !i.pull_request && i.title === title);
    if (hit) {
      cachedIssue = { repo: cfg.repo, number: hit.number, at: Date.now() };
      return hit.number;
    }
    if (batch.length < 100) return null;
  }
  return null;
}

/**
 * Post a warning or critical to the bus. Never throws and never needs to be
 * awaited; resolves to whether the comment was accepted, for tests and logs.
 */
export async function deliverToBus(
  opts: { subject: string; body: string; severity: "warning" | "critical" },
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<boolean> {
  const env = deps.env ?? process.env;
  try {
    // The same gate as email, checked here too so a direct caller cannot skip it.
    if (suppressionReason(env)) return false;
    const cfg = busConfig(env);
    if (!cfg) return false;
    const fetchImpl = deps.fetch ?? fetch;
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const issue = await findChannelIssue(cfg, fetchImpl, signal);
    if (issue === null) {
      logWarn("alert-bus.no-channel", `alert-bus: no open issue for channel ${BUS_CHANNEL}; not posted`, { severity: opts.severity });
      return false;
    }
    const res = await fetchImpl(`${GITHUB_API}/repos/${cfg.repo}/issues/${issue}/comments`, {
      method: "POST",
      headers: { ...headers(cfg.token), "Content-Type": "application/json" },
      body: JSON.stringify({ body: formatBusMessage(opts) }),
      signal,
    });
    if (!res.ok) {
      cachedIssue = null;
      throw new Error(`comment post returned HTTP ${res.status}`);
    }
    log.info({ label: "alert-bus.sent", severity: opts.severity, subject: opts.subject }, "alert-bus.sent");
    return true;
  } catch (err) {
    // Message only: the token is in a header, never in an error string, and
    // the repository name is deliberately not logged either.
    logWarn("alert-bus.send-failed", `alert-bus: ${(err as Error).message}`, { severity: opts.severity, subject: opts.subject });
    return false;
  }
}

const inFlight = new Set<Promise<boolean>>();

/** Start a delivery without waiting for it; settleBusDeliveries() can await it later. */
export function deliverToBusInBackground(opts: { subject: string; body: string; severity: "warning" | "critical" }): void {
  const p = deliverToBus(opts);
  inFlight.add(p);
  void p.finally(() => inFlight.delete(p));
}

/** Resolves once every delivery started so far has finished (each is bounded by TIMEOUT_MS). */
export async function settleBusDeliveries(): Promise<void> {
  await Promise.allSettled([...inFlight]);
}
