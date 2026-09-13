import type { ShipLog } from "./types.js";
import { recentHandoffActivity } from "./fetch-handoff-activity.js";

const GITHUB_REPOS = ["strale", "strale-frontend", "strale-beacon", "strale-examples"];

// ── Journal (from handoff/_general/from-code/, repo-native — M4 batch 5) ──

function extractJournalEntries(now: Date): ShipLog["journalEntries"] {
  const activity = recentHandoffActivity(undefined, { now, days: 1 });
  return activity.map((a) => ({
    title: a.intent ?? a.file,
    type: "",
    createdAt: `${a.date}T00:00:00.000Z`,
  }));
}

// ── GitHub commits ────────────────────────────────────────────────────────────

async function fetchGitHubCommits(): Promise<ShipLog["githubCommits"]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const commits: ShipLog["githubCommits"] = [];

  for (const repo of GITHUB_REPOS) {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/strale-io/${repo}/commits?since=${since}&per_page=20`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!resp.ok) continue;
      const data = await resp.json() as Array<{ sha: string; commit: { message: string; author: { date: string; name: string } } }>;
      for (const c of data) {
        commits.push({
          repo,
          message: c.commit.message.split("\n")[0],
          sha: c.sha.slice(0, 7),
          author: c.commit.author.name,
          date: c.commit.author.date,
        });
      }
    } catch {
      // skip
    }
  }

  return commits;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getShipLog(): Promise<ShipLog> {
  const now = new Date();
  const [journalResult, commitsResult] = await Promise.allSettled([
    Promise.resolve(extractJournalEntries(now)),
    fetchGitHubCommits(),
  ]);

  const journalEntries = journalResult.status === "fulfilled" ? journalResult.value : [];
  const commits = commitsResult.status === "fulfilled" ? commitsResult.value : [];

  // socialPosts and notionActivity have no repo-native analogue (see
  // fetch-handoff-activity.ts's header): the digest no longer has a source
  // for either, so both are always empty. render-email.ts and analyze.ts
  // already handle empty lists gracefully.
  return {
    journalEntries,
    socialPosts: [],
    githubCommits: commits,
    notionActivity: [],
  };
}
