import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("deduplicate", async (input: CapabilityInput) => {
  const data = input.data ?? input.items;
  if (!data) throw new Error("'data' is required. Provide a JSON array of objects.");

  let rows: Record<string, unknown>[];
  if (typeof data === "string") {
    rows = JSON.parse(data);
  } else if (Array.isArray(data)) {
    rows = data as Record<string, unknown>[];
  } else {
    throw new Error("'data' must be a JSON array of objects.");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      output: { deduplicated: [], duplicates_found: [], original_count: 0, deduplicated_count: 0 },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  const matchFields = (input.match_fields as string[]) ?? Object.keys(rows[0] ?? {});
  const threshold = Number(input.threshold ?? 0.8);

  const deduplicated: Record<string, unknown>[] = [];
  const duplicatesFound: Array<{ original_index: number; duplicate_index: number; score: number; fields: Record<string, unknown> }> = [];
  const isUsed = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    if (isUsed.has(i)) continue;

    deduplicated.push(rows[i]);

    for (let j = i + 1; j < rows.length; j++) {
      if (isUsed.has(j)) continue;

      const score = compareRecords(rows[i], rows[j], matchFields);
      if (score >= threshold) {
        isUsed.add(j);
        const matchDetails: Record<string, unknown> = {};
        for (const field of matchFields) {
          matchDetails[field] = {
            original: rows[i][field],
            duplicate: rows[j][field],
            score: fieldSimilarity(String(rows[i][field] ?? ""), String(rows[j][field] ?? "")),
          };
        }
        duplicatesFound.push({
          original_index: i,
          duplicate_index: j,
          score: Math.round(score * 1000) / 1000,
          fields: matchDetails,
        });
      }
    }
  }

  return {
    output: {
      deduplicated,
      duplicates_found: duplicatesFound,
      original_count: rows.length,
      deduplicated_count: deduplicated.length,
      removed_count: rows.length - deduplicated.length,
      match_fields: matchFields,
      threshold,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function compareRecords(a: Record<string, unknown>, b: Record<string, unknown>, fields: string[]): number {
  if (fields.length === 0) return 0;
  let totalScore = 0;
  for (const field of fields) {
    totalScore += fieldSimilarity(String(a[field] ?? ""), String(b[field] ?? ""));
  }
  return totalScore / fields.length;
}

function fieldSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 0.99;
  if (!la || !lb) return 0;

  // Token sort ratio
  const tokensA = la.split(/\s+/).sort().join(" ");
  const tokensB = lb.split(/\s+/).sort().join(" ");
  if (tokensA === tokensB) return 0.95;

  // Levenshtein-based similarity
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(la, lb);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
