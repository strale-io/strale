import { registerCapability, type CapabilityInput } from "./index.js";

// Company suffixes to strip for matching
const SUFFIXES: Array<[RegExp, string]> = [
  [/\b(aktiebolag|ab)\b/gi, ""],
  [/\b(aktieselskab|a\/s|as)\b/gi, ""],
  [/\b(incorporated|inc\.?)\b/gi, ""],
  [/\b(corporation|corp\.?)\b/gi, ""],
  [/\b(limited|ltd\.?)\b/gi, ""],
  [/\b(company|co\.?)\b/gi, ""],
  [/\b(gesellschaft mit beschränkter haftung|gmbh)\b/gi, ""],
  [/\b(aktiengesellschaft|ag)\b/gi, ""],
  [/\b(société anonyme|sa)\b/gi, ""],
  [/\b(société à responsabilité limitée|sarl|s\.?a\.?r\.?l\.?)\b/gi, ""],
  [/\b(besloten vennootschap|bv|b\.v\.)\b/gi, ""],
  [/\b(naamloze vennootschap|nv|n\.v\.)\b/gi, ""],
  [/\b(sociedad limitada|sl|s\.l\.)\b/gi, ""],
  [/\b(sociedad anónima|sa|s\.a\.)\b/gi, ""],
  [/\b(società per azioni|spa|s\.p\.a\.)\b/gi, ""],
  [/\b(società a responsabilità limitata|srl|s\.r\.l\.)\b/gi, ""],
  [/\b(oy|oyj|ab)\b/gi, ""], // Finnish
  [/\b(pty|proprietary)\b/gi, ""], // Australian
  [/\b(plc|public limited company)\b/gi, ""],
  [/\b(llc|l\.l\.c\.)\b/gi, ""],
  [/\b(llp|l\.l\.p\.)\b/gi, ""],
  [/\b(holding|holdings|group)\b/gi, ""],
  [/\b(international|intl\.?)\b/gi, ""],
];

function normalize(name: string): { normalized: string; suffixes: string[] } {
  let result = name.trim().toLowerCase();
  const removed: string[] = [];

  for (const [pattern, replacement] of SUFFIXES) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      const match = before.match(pattern);
      if (match) removed.push(match[0].trim());
    }
  }

  // Remove punctuation and extra spaces
  result = result.replace(/[.,&\-\/\\'"()]/g, " ").replace(/\s+/g, " ").trim();

  return { normalized: result, suffixes: removed };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const maxDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/));
  const tokensB = new Set(b.split(/\s+/));
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

registerCapability("company-name-match", async (input: CapabilityInput) => {
  const nameA = ((input.name_a as string) ?? "").trim();
  const nameB = ((input.name_b as string) ?? "").trim();

  if (!nameA || !nameB) throw new Error("Both 'name_a' and 'name_b' are required.");

  const normA = normalize(nameA);
  const normB = normalize(nameB);

  if (!normA.normalized || !normB.normalized) {
    return {
      output: {
        match: false, confidence: 0,
        name_a: nameA, name_b: nameB,
        normalized_a: normA.normalized, normalized_b: normB.normalized,
        suffixes_removed: { a: normA.suffixes, b: normB.suffixes },
        similarity_scores: { levenshtein: 0, jaro_winkler: 0, token_overlap: 0 },
      },
      provenance: { source: "strale-name-matcher", fetched_at: new Date().toISOString() },
    };
  }

  const maxLen = Math.max(normA.normalized.length, normB.normalized.length);
  const levDist = levenshtein(normA.normalized, normB.normalized);
  const levSim = maxLen > 0 ? 1 - levDist / maxLen : 1;
  const jwSim = jaroWinkler(normA.normalized, normB.normalized);
  const tokenSim = tokenOverlap(normA.normalized, normB.normalized);

  // Weighted confidence
  const confidence = Math.round((jwSim * 0.4 + levSim * 0.3 + tokenSim * 0.3) * 100) / 100;
  const isMatch = confidence >= 0.7;

  return {
    output: {
      match: isMatch,
      confidence,
      name_a: nameA,
      name_b: nameB,
      normalized_a: normA.normalized,
      normalized_b: normB.normalized,
      suffixes_removed: { a: normA.suffixes, b: normB.suffixes },
      similarity_scores: {
        levenshtein: Math.round(levSim * 100) / 100,
        jaro_winkler: Math.round(jwSim * 100) / 100,
        token_overlap: Math.round(tokenSim * 100) / 100,
      },
    },
    provenance: { source: "strale-name-matcher", fetched_at: new Date().toISOString() },
  };
});
