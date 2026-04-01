import type { ShipLog } from "./types.js";

const NOTION_JOURNAL_DB = "f275be62-b85b-421d-a137-5a1d7d7c0059";
const NOTION_SOCIAL_DB = "7d0819c8-5dad-4fb8-942a-45c71b550129";
const GITHUB_REPOS = ["strale", "strale-frontend", "strale-beacon", "strale-examples"];

function notionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

function isLast24h(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

function extractTitle(page: any): string {
  const props = page.properties ?? {};
  for (const val of Object.values(props) as any[]) {
    if (val?.type === "title" && val.title?.length > 0) {
      return val.title.map((t: any) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

function extractSelect(page: any, propName: string): string {
  return page.properties?.[propName]?.select?.name ?? "";
}

async function fetchJournal(): Promise<ShipLog["journalEntries"]> {
  if (!process.env.NOTION_API_KEY) return [];
  try {
    const resp = await fetch(`https://api.notion.com/v1/databases/${NOTION_JOURNAL_DB}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify({
        filter: { timestamp: "created_time", created_time: { past_week: {} } },
        sorts: [{ timestamp: "created_time", direction: "descending" }],
        page_size: 20,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { results: any[] };
    return data.results
      .filter((p) => isLast24h(p.created_time))
      .map((p) => ({
        title: extractTitle(p),
        type: extractSelect(p, "Type") || extractSelect(p, "type") || "",
        createdAt: p.created_time,
      }));
  } catch {
    return [];
  }
}

async function fetchSocialPosts(): Promise<ShipLog["socialPosts"]> {
  if (!process.env.NOTION_API_KEY) return [];
  try {
    const resp = await fetch(`https://api.notion.com/v1/databases/${NOTION_SOCIAL_DB}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify({
        filter: { timestamp: "created_time", created_time: { past_week: {} } },
        sorts: [{ timestamp: "created_time", direction: "descending" }],
        page_size: 20,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { results: any[] };
    return data.results
      .filter((p) => isLast24h(p.created_time))
      .map((p) => ({
        title: extractTitle(p),
        platform: extractSelect(p, "Platform") || extractSelect(p, "platform") || "",
        createdAt: p.created_time,
      }));
  } catch {
    return [];
  }
}

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
      // skip this repo
    }
  }

  return commits;
}

export async function getShipLog(): Promise<ShipLog> {
  const [journal, social, commits] = await Promise.allSettled([
    fetchJournal(),
    fetchSocialPosts(),
    fetchGitHubCommits(),
  ]);

  return {
    journalEntries: journal.status === "fulfilled" ? journal.value : [],
    socialPosts: social.status === "fulfilled" ? social.value : [],
    githubCommits: commits.status === "fulfilled" ? commits.value : [],
  };
}
