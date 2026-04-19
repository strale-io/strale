import type { ShipLog, NotionActivity } from "./types.js";
import { logWarn } from "../log.js";

const GITHUB_REPOS = ["strale", "strale-frontend", "strale-beacon", "strale-examples"];

// Known database IDs for deduplication
const JOURNAL_DB_ID = "f275be62-b85b-421d-a137-5a1d7d7c0059";
const SOCIAL_DB_ID = "7d0819c8-5dad-4fb8-942a-45c71b550129";

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

// ── Notion workspace search ───────────────────────────────────────────────────

const INTERESTING_PROPS = new Set(["Type", "Status", "Actor", "Source", "Action Required", "Reviewed", "Confidence", "Scope", "Platform"]);

function extractNotionTitle(page: any): string | null {
  for (const val of Object.values(page.properties ?? {}) as any[]) {
    if (val?.type === "title" && val.title?.length > 0) {
      return val.title.map((t: any) => t.plain_text).join("");
    }
  }
  return null;
}

function extractKeyProperties(properties: any): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, prop] of Object.entries(properties ?? {})) {
    if (!INTERESTING_PROPS.has(name)) continue;
    const p = prop as any;
    if (p.type === "select" && p.select?.name) result[name] = p.select.name;
    else if (p.type === "checkbox") result[name] = p.checkbox ? "yes" : "no";
    else if (p.type === "rich_text" && p.rich_text?.length > 0) {
      result[name] = p.rich_text.map((t: any) => t.plain_text).join("").slice(0, 100);
    }
  }
  return result;
}

const parentNameCache = new Map<string, string>();

async function getParentName(parent: any): Promise<string | null> {
  if (!parent) return null;

  if (parent.type === "database_id") {
    const dbId = parent.database_id;
    if (parentNameCache.has(dbId)) return parentNameCache.get(dbId)!;
    try {
      const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
        headers: notionHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const db = await resp.json() as any;
        const name = db.title?.map((t: any) => t.plain_text).join("") ?? "Unknown DB";
        parentNameCache.set(dbId, name);
        return name;
      }
    } catch { /* ignore */ }
    return "Unknown Database";
  }

  if (parent.type === "page_id") return "Page";
  return null;
}

async function fetchNotionWorkspaceActivity(): Promise<NotionActivity[]> {
  if (!process.env.NOTION_API_KEY) return [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activities: NotionActivity[] = [];
  let hasMore = true;
  let startCursor: string | undefined;

  try {
    while (hasMore) {
      const resp = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify({
          filter: { property: "object", value: "page" },
          sort: { direction: "descending", timestamp: "last_edited_time" },
          page_size: 100,
          ...(startCursor ? { start_cursor: startCursor } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        logWarn("digest-notion-search-failed", "Notion search returned non-ok", { status: resp.status });
        break;
      }

      const data = await resp.json() as any;

      for (const page of data.results) {
        const editedAt = new Date(page.last_edited_time);
        const createdAt = new Date(page.created_time);

        // Stop once we hit pages older than 24h
        if (editedAt < since) {
          hasMore = false;
          break;
        }

        const title = extractNotionTitle(page);
        if (!title) continue;

        const parentName = await getParentName(page.parent);
        const properties = extractKeyProperties(page.properties);

        activities.push({
          id: page.id,
          type: page.parent?.type === "database_id" ? "database_entry" : "page",
          title,
          parentName,
          url: page.url,
          createdTime: page.created_time,
          lastEditedTime: page.last_edited_time,
          isNew: createdAt >= since,
          properties,
        });
      }

      if (data.has_more && hasMore) {
        startCursor = data.next_cursor;
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    logWarn("digest-notion-search-threw", "Notion workspace search threw", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return activities;
}

// ── Journal + Social (from workspace activity) ───────────────────────────────

function extractJournalEntries(activity: NotionActivity[]): ShipLog["journalEntries"] {
  return activity
    .filter((a) => {
      // Match by parent database ID in the URL or parentName
      const isJournal = a.url?.includes(JOURNAL_DB_ID.replace(/-/g, "")) || a.parentName === "Journal";
      return isJournal && a.isNew;
    })
    .map((a) => ({
      title: a.title,
      type: a.properties.Type ?? "",
      createdAt: a.createdTime,
    }));
}

function extractSocialPosts(activity: NotionActivity[]): ShipLog["socialPosts"] {
  return activity
    .filter((a) => {
      const isSocial = a.url?.includes(SOCIAL_DB_ID.replace(/-/g, "")) || a.parentName === "Social Media Posts";
      return isSocial && a.isNew;
    })
    .map((a) => ({
      title: a.title,
      platform: a.properties.Platform ?? "",
      createdAt: a.createdTime,
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
  const [notionResult, commitsResult] = await Promise.allSettled([
    fetchNotionWorkspaceActivity(),
    fetchGitHubCommits(),
  ]);

  const allActivity = notionResult.status === "fulfilled" ? notionResult.value : [];
  const commits = commitsResult.status === "fulfilled" ? commitsResult.value : [];

  // Extract journal + social from workspace activity (replaces individual DB queries)
  const journalEntries = extractJournalEntries(allActivity);
  const socialPosts = extractSocialPosts(allActivity);

  // Deduplicate: remove items already captured as journal/social from the general activity list
  const capturedIds = new Set([
    ...journalEntries.map((_, i) => allActivity.find((a) => a.parentName === "Journal" && a.isNew)?.id),
    ...socialPosts.map((_, i) => allActivity.find((a) => a.parentName === "Social Media Posts" && a.isNew)?.id),
  ].filter(Boolean));

  // Also filter out journal and social entries from the general notionActivity
  const journalDbSlug = JOURNAL_DB_ID.replace(/-/g, "");
  const socialDbSlug = SOCIAL_DB_ID.replace(/-/g, "");
  const dedupedActivity = allActivity.filter((a) => {
    if (a.url?.includes(journalDbSlug)) return false;
    if (a.url?.includes(socialDbSlug)) return false;
    return true;
  });

  return {
    journalEntries,
    socialPosts,
    githubCommits: commits,
    notionActivity: dedupedActivity,
  };
}
