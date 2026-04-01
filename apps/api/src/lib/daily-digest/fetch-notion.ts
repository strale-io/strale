import type { DistributionSurface, Priorities } from "./types.js";

const DIST_REGISTRY_PAGE = "32e67c87-082c-81de-861f-dcc53576304c";
const DECISIONS_DB = "ea57671f-7167-44e4-a254-c0a1de79e7f9";
const JOURNAL_DB = "f275be62-b85b-421d-a137-5a1d7d7c0059";

function notionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
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

export async function getDistributionSurfaces(): Promise<DistributionSurface[]> {
  if (!process.env.NOTION_API_KEY) return [];

  try {
    // Try as database first
    const dbResp = await fetch(`https://api.notion.com/v1/databases/${DIST_REGISTRY_PAGE}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify({ page_size: 100 }),
      signal: AbortSignal.timeout(15000),
    });

    if (dbResp.ok) {
      const data = await dbResp.json() as { results: any[] };
      return data.results.map((page) => {
        const props = page.properties ?? {};
        const status = props.Status?.select?.name ?? props.status?.select?.name ?? "unknown";
        const url = props.URL?.url ?? props.url?.url ?? null;
        const createdAt = page.created_time;

        let daysPending: number | null = null;
        if (status.toLowerCase().includes("pending") || status.toLowerCase().includes("submitted")) {
          daysPending = Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000));
        }

        return {
          name: extractTitle(page),
          status,
          daysPending,
          url,
        };
      });
    }

    // Fall back to page blocks
    const blocksResp = await fetch(
      `https://api.notion.com/v1/blocks/${DIST_REGISTRY_PAGE}/children?page_size=100`,
      {
        headers: notionHeaders(),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!blocksResp.ok) return [];
    const blocksData = await blocksResp.json() as { results: any[] };

    // Extract text content from blocks as surfaces
    const surfaces: DistributionSurface[] = [];
    for (const block of blocksData.results) {
      if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
        const text = block[block.type]?.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
        if (text) {
          surfaces.push({ name: text, status: "listed", daysPending: null, url: null });
        }
      }
    }
    return surfaces;
  } catch {
    return [];
  }
}

export async function getPriorities(): Promise<Priorities> {
  if (!process.env.NOTION_API_KEY) {
    return { unreviewedDecisions: [], actionRequired: [] };
  }

  const [decisionsResult, actionsResult] = await Promise.allSettled([
    fetchUnreviewedDecisions(),
    fetchActionRequired(),
  ]);

  return {
    unreviewedDecisions: decisionsResult.status === "fulfilled" ? decisionsResult.value : [],
    actionRequired: actionsResult.status === "fulfilled" ? actionsResult.value : [],
  };
}

async function fetchUnreviewedDecisions(): Promise<Priorities["unreviewedDecisions"]> {
  try {
    const resp = await fetch(`https://api.notion.com/v1/databases/${DECISIONS_DB}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify({
        filter: { property: "Reviewed", checkbox: { equals: false } },
        page_size: 20,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { results: any[] };
    return data.results.map((page) => ({
      id: page.id,
      title: extractTitle(page),
      date: page.created_time?.slice(0, 10) ?? "",
    }));
  } catch {
    return [];
  }
}

async function fetchActionRequired(): Promise<Priorities["actionRequired"]> {
  try {
    const resp = await fetch(`https://api.notion.com/v1/databases/${JOURNAL_DB}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Action Required", select: { equals: "yes" } },
          ],
        },
        sorts: [{ timestamp: "created_time", direction: "descending" }],
        page_size: 20,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { results: any[] };
    return data.results.map((page) => ({
      title: extractTitle(page),
      createdAt: page.created_time,
    }));
  } catch {
    return [];
  }
}
