/**
 * Entrypoint parity check (M4 batch 3).
 *
 * CLAUDE.md and AGENTS.md are peer entrypoints: Claude Code loads the first,
 * Codex loads the second, and the migration plan's blocking check 3 requires
 * both to point at the same bootstrap and protocol router while its blocking
 * check 4 bars either one from carrying a mutable project fact. Neither
 * check existed before this batch (archive/sessions/2026-09-11-m4-cutover-
 * inventory.md section 3). This library implements both, plus reuse of the
 * batch 1d inactive-document guard, as four independent rules:
 *
 *   (a) BOOTSTRAP_POINTER_MISSING -- both files must name the same project
 *       map (docs/project/START-HERE.md) and protocol router
 *       (docs/project/PROTOCOL-ROUTER.md).
 *   (b) PROTOCOL_UNREACHABLE -- every row in docs/project/protocol-
 *       coverage.yaml must be reachable from both files: either the file
 *       carries the protocol's own heading text (CLAUDE.md, which keeps
 *       every mirrored section in full per the M4 batch 2 architect
 *       override), or it names the protocol and points at its full-body
 *       location -- CLAUDE.md's heading (AGENTS.md's condensed table does
 *       this) or, for a CHARTER.md-sourced row, the word "CHARTER.md".
 *       Matching is case-insensitive substring search against a heading's
 *       full text, its text with a trailing "(...)" qualifier stripped (so
 *       a condensed rephrasing of the qualifier does not fail the row), and
 *       the row's own full_body path.
 *   (c) MUTABLE_FACT_FOUND -- neither file may carry a money amount, a
 *       capability/solution/vertical/country count, a dated "(Month YYYY)"
 *       label or "as of <date>" staleness claim, or a decision-id-plus-
 *       summary sentence, outside a narrow, named allowlist of structural
 *       sections that must keep such a value (see MUTABLE_FACT_ALLOWLIST
 *       below) or a fenced code block (a manifest template's example
 *       literal, not a live fact) or a zero-value money literal (a fixed
 *       constant, e.g. "fixture mode costs EUR0 externally", never a price
 *       that drifts).
 *   (d) M1_ENTRYPOINT_ACTIVATED -- reused verbatim from
 *       scripts/check-project-context.mjs's checkPrecutoverEntrypoint
 *       rather than re-implemented, per this batch's brief.
 *
 * A rule this file does not implement: a generic "any calendar date is a
 * mutable fact" scan. Both files legitimately cite dozens of historical
 * incident dates inside mirrored protocol background sections (a cert-audit
 * finding date, a postgres-crash date, a PR-merge date) that are permanent
 * evidence for why the rule exists, not a claim about current state that
 * can go stale -- a blanket date ban would either flag all of them (false
 * positives with no fix but an ever-growing per-date allowlist) or need an
 * allowlist keyed to file/line that breaks on every edit. The two narrower,
 * mechanically testable date patterns above (parenthetical "(Month YYYY)"
 * section labels, and "as of <date>" staleness claims) are exactly the
 * drift-prone shapes M4 batch 2's own report found and removed
 * (archive/sessions/2026-09-11-m4-b2-claude-md.md, "Mutable facts moved");
 * a blanket scan is left out as untestable against this repository's real
 * content, per this batch's instruction to leave out a rule that cannot be
 * proved by planting.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkSchema, repoRootFrom } from "./protocol-coverage-lib.mjs";
import { checkPrecutoverEntrypoint } from "./check-project-context.mjs";

export { repoRootFrom } from "./protocol-coverage-lib.mjs";

export const ENTRYPOINTS = ["CLAUDE.md", "AGENTS.md"];
export const BOOTSTRAP_TOKENS = [
  "docs/project/START-HERE.md",
  "docs/project/PROTOCOL-ROUTER.md",
];

// Section headings, exact text, whose entire body (until the next heading
// at the same or a shallower level) is allowed to carry a money literal or
// a decision-id summary sentence, because the value there is a governance
// threshold or a deliberately-restated decision, not a status that can go
// stale. Each entry is scoped to the one file it applies to; the reason is
// the citation, not a guess.
export const MUTABLE_FACT_ALLOWLIST = [
  // AGENTS.md's own text already labels this "the one Decision this file
  // restates, deliberately" -- the euro figures are authorization-boundary
  // thresholds (DEC-20260815-A), not a price that drifts.
  { file: "AGENTS.md", heading: "Operating Charter (DEC-20260815-A) — division of authority" },
  // CLAUDE.md's mirrored Wire-shape rule section illustrates a 2026-04-30
  // cert-audit finding with an example serialized value; not a live price.
  { file: "CLAUDE.md", heading: "Wire-shape rule for /v1/public/ops/trust/* endpoints" },
];

function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

function readEntrypoint(root, file) {
  return normalizeEol(readFileSync(resolve(root, file), "utf8"));
}

function finding(code, file, detail) {
  return { code, file, detail };
}

// ── (a) bootstrap/router pointer ────────────────────────────────────────

export function checkBootstrapPointers(contents) {
  const findings = [];
  for (const [file, content] of Object.entries(contents)) {
    for (const token of BOOTSTRAP_TOKENS) {
      if (!content.includes(token)) {
        findings.push(
          finding(
            "BOOTSTRAP_POINTER_MISSING",
            file,
            `does not name "${token}" (both entrypoints must point at the same project map and protocol router)`,
          ),
        );
      }
    }
  }
  return findings;
}

// ── (b) protocol reachability ───────────────────────────────────────────

const HEADING_SOURCE_PREFIX = "CLAUDE.md heading: ";
const CHARTER_SOURCE_PREFIX = "docs/company/CHARTER.md heading:";

function stripTrailingParenthetical(text) {
  return text.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// AGENTS.md's own prose avoids the em-dash (a repository-wide style rule for
// hand-written text), so a heading it reproduces from CLAUDE.md necessarily
// spells the same separator with a plain hyphen. Comparisons below normalize
// every dash variant to "-" first so that difference never causes a false
// PROTOCOL_UNREACHABLE or a missed mutable-fact allowlist match.
function normalizeDashes(text) {
  return text.replace(/[—–]/g, "-").replace(/-{2,}/g, "-");
}

/** Every substring whose presence (case-insensitive) in a file proves the
 * row is reachable from that file. */
function reachabilityTokens(row) {
  const tokens = new Set([row.full_body]);
  if (row.source && row.source.startsWith(HEADING_SOURCE_PREFIX)) {
    const heading = row.source.slice(HEADING_SOURCE_PREFIX.length).trim();
    tokens.add(heading);
    const core = stripTrailingParenthetical(heading);
    if (core) tokens.add(core);
  } else if (row.source && row.source.startsWith(CHARTER_SOURCE_PREFIX)) {
    tokens.add("CHARTER.md");
  }
  return [...tokens].filter(Boolean);
}

export function checkProtocolReachability(root, contents) {
  const findings = [];
  const { findings: schemaFindings, manifest, valid } = checkSchema(root);
  if (!valid) {
    return schemaFindings.map((f) => finding(f.code, f.file, f.detail));
  }
  const lowered = Object.fromEntries(
    Object.entries(contents).map(([file, content]) => [file, normalizeDashes(content).toLowerCase()]),
  );
  for (const row of manifest.protocols) {
    const tokens = reachabilityTokens(row).map((t) => normalizeDashes(t).toLowerCase());
    for (const [file, content] of Object.entries(lowered)) {
      const reachable = tokens.some((t) => content.includes(t));
      if (!reachable) {
        findings.push(
          finding(
            "PROTOCOL_UNREACHABLE",
            file,
            `row "${row.id}" (${row.name}) is not named, and its full body location is not given, anywhere in ${file}`,
          ),
        );
      }
    }
  }
  return findings;
}

// ── (c) mutable facts ───────────────────────────────────────────────────

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const MONEY_RE = /(€|\$)\s?(\d[\d.,]*)|\b(\d+(?:\.\d+)?)\s*cents\b/gi;
const COUNT_RE = /\b\d+\+?\s+(?:capabilit(?:y|ies)|solutions?|verticals?|categories|countries)\b/gi;
const DATED_PARENTHETICAL_RE =
  /\((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\)/g;
const AS_OF_DATE_RE = /\bas of \d{4}-\d{2}(?:-\d{2})?\b/gi;
const DEC_ID_RE = /\bDEC-\d{8}(?:-[A-Za-z0-9]+)*\b/g;
const SUMMARY_AFTER_ID_RE = /^\s*(?:—|--|-)\s*(?:\S+\s+){3,}\S+/;

function moneyValueIsZero(match) {
  const numeric = (match[2] ?? match[3] ?? "").replace(/,/g, "");
  return numeric !== "" && Number.parseFloat(numeric) === 0;
}

function findMoney(line) {
  const hits = [];
  for (const match of line.matchAll(MONEY_RE)) {
    if (moneyValueIsZero(match)) continue;
    hits.push({ category: "MONEY", snippet: match[0] });
  }
  return hits;
}

function findCounts(line) {
  return [...line.matchAll(COUNT_RE)].map((m) => ({ category: "COUNT", snippet: m[0] }));
}

function findDates(line) {
  const hits = [];
  for (const m of line.matchAll(DATED_PARENTHETICAL_RE)) hits.push({ category: "DATE", snippet: m[0] });
  for (const m of line.matchAll(AS_OF_DATE_RE)) hits.push({ category: "DATE", snippet: m[0] });
  return hits;
}

function findDecisionSummaries(line) {
  const hits = [];
  for (const match of line.matchAll(DEC_ID_RE)) {
    const rest = line.slice(match.index + match[0].length);
    if (SUMMARY_AFTER_ID_RE.test(rest)) {
      hits.push({ category: "DECISION_SUMMARY", snippet: line.trim() });
    }
  }
  return hits;
}

/** Scans one file's content for mutable-fact patterns, honoring the code-
 * fence skip (a manifest template's example literal, e.g. `price_cents: 5`,
 * is structural, not a live fact) and this file's own allowlisted heading
 * sections (MUTABLE_FACT_ALLOWLIST). Returns raw {category, line, snippet}
 * hits; the caller turns them into findings. */
export function scanMutableFacts(file, content) {
  const allowlistedHeadings = new Set(
    MUTABLE_FACT_ALLOWLIST.filter((entry) => entry.file === file).map((entry) =>
      normalizeDashes(entry.heading),
    ),
  );
  const hits = [];
  let inFence = false;
  let allowlisted = false;
  let allowlistLevel = 0;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (allowlisted && level <= allowlistLevel) allowlisted = false;
      if (allowlistedHeadings.has(normalizeDashes(text))) {
        allowlisted = true;
        allowlistLevel = level;
      }
    }
    if (inFence || allowlisted) continue;
    for (const hit of [
      ...findMoney(line),
      ...findCounts(line),
      ...findDates(line),
      ...findDecisionSummaries(line),
    ]) {
      hits.push({ ...hit, line: i + 1 });
    }
  }
  return hits;
}

export function checkMutableFacts(contents) {
  const findings = [];
  for (const [file, content] of Object.entries(contents)) {
    for (const hit of scanMutableFacts(file, content)) {
      findings.push(
        finding(
          "MUTABLE_FACT_FOUND",
          file,
          `${hit.category} at line ${hit.line}: "${hit.snippet}"`,
        ),
      );
    }
  }
  return findings;
}

// ── (d) inactive-document reference (reused, not re-implemented) ───────

export function checkInactiveDocumentReferences(root, contents) {
  const findings = [];
  for (const [file, content] of Object.entries(contents)) {
    for (const f of checkPrecutoverEntrypoint(root, file, content)) {
      findings.push(finding(f.code, f.path, f.detail));
    }
  }
  return findings;
}

// ── the full check ──────────────────────────────────────────────────────

export function checkEntrypointParity(root = repoRootFrom(import.meta.url)) {
  const contents = {};
  for (const file of ENTRYPOINTS) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) {
      return { findings: [finding("ENTRYPOINT_MISSING", file, "file does not exist")] };
    }
    contents[file] = readEntrypoint(root, file);
  }

  const findings = [
    ...checkBootstrapPointers(contents),
    ...checkProtocolReachability(root, contents),
    ...checkMutableFacts(contents),
    ...checkInactiveDocumentReferences(root, contents),
  ];
  return { findings };
}
