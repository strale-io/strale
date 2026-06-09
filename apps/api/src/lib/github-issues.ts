/**
 * Minimal GitHub Issues client for surfacing stuck-in-validating
 * capabilities to a channel a human will see.
 *
 * Per DEC-20260511-E. Reuses the GITHUB_TOKEN env var that
 * lib/daily-digest/fetch-shiplog.ts already consumes; the PAT
 * must have `issues: write` scope on the strale-io/strale repo.
 *
 * If GITHUB_TOKEN is unset or 401/403, both helpers log a warning
 * and return without throwing. The caller continues; the
 * health_monitor_events row remains as the secondary surface.
 */
import { log, logWarn } from "./log.js";

const REPO = "strale-io/strale";
const LABEL = "stuck-validating";
const API_BASE = "https://api.github.com";

function titleFor(slug: string): string {
  return `[stuck-validating] ${slug}`;
}

async function ghFetch(
  path: string,
  init: RequestInit & { token: string },
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${init.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
}

interface IssueRow {
  number: number;
  title: string;
  state: "open" | "closed";
}

// Implicit max of 100 open [stuck-validating] issues per sync. Adequate
// for the expected steady state (0-5 stuck slugs); revisit if the fleet
// ever lands a batch of more than 100 capabilities in 'validating'
// simultaneously, in which case the 101st would not be auto-closed when
// its slug leaves the state. Would require pagination via the Link header.
async function listOpenStuckIssues(token: string): Promise<IssueRow[]> {
  const resp = await ghFetch(
    `/repos/${REPO}/issues?state=open&labels=${LABEL}&per_page=100`,
    { token },
  );
  if (!resp.ok) {
    logWarn("github-issues-list-failed", "GitHub list-issues request failed", { status: resp.status });
    return [];
  }
  return (await resp.json()) as IssueRow[];
}

/**
 * Create a [stuck-validating] issue for `slug` if one is not already open;
 * if one is open, append a comment so the activity surfaces. Idempotent.
 *
 * Returns the issue number when one was opened or commented; null on no-op
 * (e.g. token unset, API failure).
 */
export async function ensureStuckValidatingIssue(
  slug: string,
  body: string,
): Promise<number | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logWarn("github-issues-no-token", "GITHUB_TOKEN unset; skipping issue surface", { slug });
    return null;
  }

  try {
    const open = await listOpenStuckIssues(token);
    const existing = open.find((i) => i.title === titleFor(slug));

    if (existing) {
      const resp = await ghFetch(
        `/repos/${REPO}/issues/${existing.number}/comments`,
        { token, method: "POST", body: JSON.stringify({ body }) },
      );
      if (!resp.ok) {
        logWarn("github-issues-comment-failed", "GitHub comment request failed", { status: resp.status, issue: existing.number });
        return null;
      }
      log.info(
        { label: "github-issues-comment-added", slug, issue: existing.number },
        "github-issues-comment-added",
      );
      return existing.number;
    }

    const create = await ghFetch(`/repos/${REPO}/issues`, {
      token,
      method: "POST",
      body: JSON.stringify({ title: titleFor(slug), body, labels: [LABEL] }),
    });
    if (!create.ok) {
      logWarn("github-issues-create-failed", "GitHub create-issue request failed", { status: create.status, slug });
      return null;
    }
    const created = (await create.json()) as { number: number };
    log.info(
      { label: "github-issues-created", slug, issue: created.number },
      "github-issues-created",
    );
    return created.number;
  } catch (err) {
    logWarn("github-issues-unexpected-error", "unexpected error in ensureStuckValidatingIssue", { slug, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Close the [stuck-validating] issue for `slug` if one is open. Idempotent.
 * Returns true if an issue was closed; false otherwise.
 */
export async function closeStuckValidatingIssue(slug: string): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;

  try {
    const open = await listOpenStuckIssues(token);
    const existing = open.find((i) => i.title === titleFor(slug));
    if (!existing) return false;

    const resp = await ghFetch(`/repos/${REPO}/issues/${existing.number}`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "completed" }),
    });
    if (!resp.ok) {
      logWarn("github-issues-close-failed", "GitHub close-issue request failed", { status: resp.status, issue: existing.number });
      return false;
    }
    await ghFetch(`/repos/${REPO}/issues/${existing.number}/comments`, {
      token,
      method: "POST",
      body: JSON.stringify({
        body: `Closed automatically: ${slug} is no longer in lifecycle_state='validating' beyond the 48h threshold.`,
      }),
    });
    log.info(
      { label: "github-issues-closed", slug, issue: existing.number },
      "github-issues-closed",
    );
    return true;
  } catch (err) {
    logWarn("github-issues-unexpected-error", "unexpected error in closeStuckValidatingIssue", { slug, err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/**
 * For each currently-stuck slug, ensure an issue is open. For every other
 * [stuck-validating] issue currently open, close it. Run after computing
 * the stuck set in `checkValidationQueueStuck`.
 */
export async function syncStuckValidatingIssues(
  stuckSlugs: ReadonlyArray<{ slug: string; body: string }>,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logWarn("github-issues-no-token", "GITHUB_TOKEN unset; skipping sync");
    return;
  }

  for (const { slug, body } of stuckSlugs) {
    await ensureStuckValidatingIssue(slug, body);
  }

  const currentSet = new Set(stuckSlugs.map((s) => s.slug));
  try {
    const open = await listOpenStuckIssues(token);
    for (const issue of open) {
      const m = /^\[stuck-validating\] (.+)$/.exec(issue.title);
      if (!m) continue;
      const slugFromTitle = m[1];
      if (!currentSet.has(slugFromTitle)) {
        await closeStuckValidatingIssue(slugFromTitle);
      }
    }
  } catch (err) {
    logWarn("github-issues-sync-error", "error during stuck-validating issue sync", { err: err instanceof Error ? err.message : String(err) });
  }
}
