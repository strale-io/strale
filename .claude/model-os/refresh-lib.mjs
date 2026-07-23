// MODEL-OS refresh — pure helpers, extracted from refresh-research.mjs so the diff /
// relevance logic is regression-testable (test-refresh-lib.ps1) without live API keys.
// No I/O here: string/array logic only.

// A ledger id "matches" a live id if equal, or the live id is a dated/suffixed variant
// (e.g. ledger 'claude-haiku-4-5' vs live 'claude-haiku-4-5-20251001').
export function idsMatch(ledgerId, liveId) {
  return liveId === ledgerId || liveId.startsWith(ledgerId + "-");
}

export function diffAgainstLedger(ledgerIds, liveIds) {
  const newIds = liveIds.filter((live) => !ledgerIds.some((l) => idsMatch(l, live)));
  const missing = ledgerIds.filter((l) => !liveIds.some((live) => idsMatch(l, live)));
  return { newIds, missing };
}

// Version is a TUPLE of integers, compared position-wise — parseFloat ordering broke at
// two digits ('5.10' sorted as 5.1, below 5.5; 2026-07-10 review finding).
export function extractFamilyVersion(id) {
  let m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/i);
  if (m) return { family: `claude-${m[1].toLowerCase()}`, version: [+m[2], m[3] ? +m[3] : 0] };
  m = id.match(/^gpt-(\d+(?:\.\d+)*)/i);
  if (m) return { family: "gpt", version: m[1].split(".").map(Number) };
  m = id.match(/^o(\d+)/i);
  if (m) return { family: "o", version: [+m[1]] };
  return { family: null, version: null };
}

export function cmpVersions(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// Relevance filter for "new candidate" proposals (NEVER touches the `missing`
// deprecation-check, which stays comprehensive). Purely self-relative: the only
// reference point is the ledger's own current entries — no hardcoded model name or
// version number. Two gates:
//   1. FAMILY — ids in a family the ledger already tracks go through the recency gate;
//      ids in an UNTRACKED family are returned in `newFamilies` (one aggregated signal
//      per family — 2026-07-10 review: silently dropping them made a brand-new
//      generation invisible to the report; per-id lines were the original noise).
//   2. RECENCY — within a tracked family, keep only the `recencyTopN` most recent
//      distinct versions seen live; older versions land in `dropped` (counted, listed
//      in the console log, never proposed).
export function filterRelevant(ledgerModels, candidateIds, recencyTopN = 2) {
  const ledgerFamilies = new Set();
  for (const m of ledgerModels) {
    const { family } = extractFamilyVersion(m.id);
    if (family) ledgerFamilies.add(family);
  }
  if (!ledgerFamilies.size) return { kept: candidateIds, dropped: [], newFamilies: [] };

  const withMeta = candidateIds.map((id) => ({ id, ...extractFamilyVersion(id) }));
  const kept = [];
  const dropped = [];
  const newFamilies = [];
  const families = new Set(withMeta.map((x) => x.family).filter(Boolean));
  for (const family of families) {
    const inFamily = withMeta.filter((x) => x.family === family);
    if (!ledgerFamilies.has(family)) {
      newFamilies.push({ family, ids: inFamily.map((x) => x.id) });
      continue;
    }
    const versions = [...new Map(inFamily.map((x) => [x.version.join("."), x.version])).values()]
      .sort((a, b) => cmpVersions(b, a));
    const keepKeys = new Set(versions.slice(0, recencyTopN).map((v) => v.join(".")));
    for (const x of inFamily) (keepKeys.has(x.version.join(".")) ? kept : dropped).push(x.id);
  }
  // ids with no extractable family at all: keep (never silently discard the unrecognized).
  for (const x of withMeta) if (!x.family) kept.push(x.id);
  return { kept, dropped, newFamilies };
}
