/**
 * Repo-native replacement for the Journal-shaped part of the digest's ship
 * log (M4 batch 5).
 *
 * Ports scripts/digest-repo-native-lib.mjs's recentHandoffActivity() into
 * apps/api/src, because the production digest job runs from the built
 * Docker image, which does not carry `scripts/`.
 *
 * There is no repo-native analogue of the Journal DB's "Type" field or the
 * Social Media Posts DB, so this covers only the journal-entry half of the
 * old getShipLog()'s Notion reads; fetch-shiplog.ts leaves socialPosts and
 * notionActivity empty rather than guessing at content that no longer has a
 * source.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dirname, "../../../../..");
export const HANDOFF_DIR = "handoff/_general/from-code";

export interface HandoffActivityEntry {
  date: string;
  file: string;
  intent: string | null;
}

function sortByDateDesc(a: { date: string }, b: { date: string }): number {
  if (a.date < b.date) return 1;
  if (a.date > b.date) return -1;
  return 0;
}

/**
 * Handoff files under handoff/_general/from-code/ whose file name starts
 * with a date inside the [now - days, now] window, each with its date, file
 * name, and its "Intent: ..." first-matching line if present.
 *
 * Returns [] (not a throw) when the directory does not exist.
 */
export function recentHandoffActivity(
  root: string = REPO_ROOT,
  { now = new Date(), days = 1 }: { now?: Date; days?: number } = {},
): HandoffActivityEntry[] {
  const dir = resolve(root, HANDOFF_DIR);
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  let filenames: string[];
  try {
    filenames = readdirSync(dir);
  } catch {
    return [];
  }

  const results: HandoffActivityEntry[] = [];
  for (const filename of filenames) {
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const fileDate = new Date(dateMatch[1]);
    if (Number.isNaN(fileDate.getTime())) continue;
    if (fileDate < cutoff || fileDate > now) continue;

    let intent: string | null = null;
    try {
      const content = readFileSync(join(dir, filename), "utf8");
      const intentMatch = content.match(/^Intent:\s*(.+)$/m);
      if (intentMatch) intent = intentMatch[1].trim();
    } catch {
      // File listed but unreadable: still report its name and date.
    }

    results.push({ date: dateMatch[1], file: filename, intent });
  }

  return results.sort(sortByDateDesc);
}
