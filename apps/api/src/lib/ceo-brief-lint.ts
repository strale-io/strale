/**
 * The CEO brief guard.
 *
 * The brief exists because the daily report had become an engineering activity
 * log: correct, thorough, and unreadable by the one person it is written for.
 * Prose drifts back toward its author's frame, so the format needs a check that
 * a later session cannot pass by being brief and technical instead of long and
 * technical.
 *
 * What this can and cannot do, stated honestly: it enforces the *mechanical*
 * half of DAILY-RUN.md's editorial gate — structure, length, absence of
 * technical vocabulary, and the five required fields on any founder escalation.
 * It cannot ask "is this paragraph here only because engineering spent time on
 * it", which is the question that actually decides whether a brief is good.
 * A green run means the brief is not obviously wrong, never that it is right.
 *
 * Pure and side-effect free so the rules are testable against constructed text.
 * The CLI wrapper is scripts/check-ceo-brief.ts.
 */

export interface Finding {
  severity: "error" | "warning";
  rule: string;
  line?: number;
  message: string;
}

/** The five headings, in order. Matched on the leading words, case-insensitive. */
export const REQUIRED_SECTIONS = [
  "Business performance",
  "What materially changed",
  "Fixed automatically",
  "Working on now",
  "Needs your decision",
] as const;

export const WORD_BUDGET = { soft: 600, hard: 900 };

/**
 * Vocabulary that does not belong in front of a non-technical reader.
 *
 * Each entry earned its place from a real daily report. The list is deliberately
 * narrow: it targets words that carry no meaning without codebase context, not
 * every word an engineer might use. "Database" is allowed — a founder knows what
 * one is; "column" is not, because a founder cannot act on which one.
 */
const BANNED_TERMS: Array<{ re: RegExp; rule: string; why: string }> = [
  { re: /\b(?:PR|pull request)\s*#\d+/i, rule: "pr-number", why: "a pull-request number is not a business fact" },
  { re: /\b[0-9a-f]{7,40}\b(?![.\w])/, rule: "commit-sha", why: "a commit id means nothing to the reader" },
  { re: /\b\w[\w-]*\.(?:ts|tsx|js|mjs|sql|yaml|yml|json|py|md)\b/i, rule: "filename", why: "a filename is not a business fact" },
  { re: /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+(?:\*|\w+)\s+(?:FROM|INTO|SET)\b/i, rule: "sql", why: "queries belong in the operating record" },
  { re: /\b(?:migration|block)\s+\d{3,4}\b/i, rule: "migration", why: "migration numbers are internal bookkeeping" },
  { re: /\b(?:column|schema|table|foreign key|index)\b/i, rule: "db-internals", why: "database internals are not a founder concern" },
  { re: /\b(?:branch|merge|merged|rebase|commit|deploy(?:ed|ment)?|CI|repo(?:sitory)?)\b/i, rule: "vcs", why: "shipping mechanics are execution, never news" },
  { re: /\b(?:test|tests|test suite|assertion|regression test|typecheck|lint)\b/i, rule: "testing", why: "test counts are not business outcomes" },
  { re: /\b(?:npm|npx|pip|package|SDK|API endpoint|env var|environment variable)\b/i, rule: "tooling", why: "tooling names are not business facts" },
  { re: /\b(?:refactor|executor|handler|middleware|endpoint|payload|serializer|fixture)\b/i, rule: "jargon", why: "implementation vocabulary" },
  { re: /\b(?:quarantine[ds]?|breaker|circuit breaker|instrument(?:ation)?|denominator)\b/i, rule: "internal-vocab", why: "our own operational vocabulary is not plain English" },
];

/**
 * Openings that signal a work log rather than a synthesis. Checked only on the
 * first sentence under "Business performance", where the brief sets its frame.
 */
const ACTIVITY_LOG_OPENINGS = [
  /^(?:i|we)\s+(?:ran|fixed|shipped|merged|investigated|spent|looked|checked|started|continued)\b/i,
  /^this (?:session|morning|run)\b/i,
  /^today (?:i|we)\b/i,
];

/** The five fields the charter requires on every founder escalation. */
export const ESCALATION_FIELDS = ["choice", "established", "options", "recommendation", "consequence"] as const;

const NOTHING_TO_DECIDE = /nothing needs your decision/i;

export interface BriefLintResult {
  findings: Finding[];
  words: number;
  ok: boolean;
}

export function lintBrief(source: string, opts: { allowTerms?: string[] } = {}): BriefLintResult {
  const findings: Finding[] = [];
  const lines = source.split(/\r?\n/);
  const allow = new Set((opts.allowTerms ?? []).map((t) => t.toLowerCase()));

  // ── structure ──────────────────────────────────────────────────────────
  const headings: Array<{ line: number; text: string }> = [];
  let inFence = false;
  for (const [i, raw] of lines.entries()) {
    if (/^\s*```/.test(raw)) inFence = !inFence;
    if (inFence) continue;
    const m = /^#{1,4}\s*(?:\d+\.\s*)?(.+?)\s*$/.exec(raw);
    if (m) headings.push({ line: i + 1, text: m[1]!.replace(/[*_`]/g, "").trim() });
  }
  const matched: number[] = [];
  for (const want of REQUIRED_SECTIONS) {
    const idx = headings.findIndex((h) => h.text.toLowerCase().startsWith(want.toLowerCase()));
    if (idx === -1) {
      findings.push({ severity: "error", rule: "missing-section", message: `the brief has no "${want}" section` });
    } else {
      matched.push(idx);
    }
  }
  if (matched.length === REQUIRED_SECTIONS.length) {
    const ordered = matched.every((v, i) => i === 0 || v > matched[i - 1]!);
    if (!ordered) {
      findings.push({
        severity: "error", rule: "section-order",
        message: "the five sections are present but out of order — the order is part of the contract",
      });
    }
  }

  // ── length ─────────────────────────────────────────────────────────────
  const prose = stripNonProse(source);
  const words = prose.split(/\s+/).filter(Boolean).length;
  if (words > WORD_BUDGET.hard) {
    findings.push({
      severity: "error", rule: "too-long",
      message: `${words} words — past the ${WORD_BUDGET.hard}-word hard ceiling. A brief this long is a report.`,
    });
  } else if (words > WORD_BUDGET.soft) {
    findings.push({
      severity: "warning", rule: "long",
      message: `${words} words — over the ~${WORD_BUDGET.soft}-word target. Justified only by genuinely more material.`,
    });
  }
  if (words < 80) {
    findings.push({
      severity: "warning", rule: "thin",
      message: `${words} words — check nothing material was dropped rather than synthesised.`,
    });
  }

  // ── vocabulary ─────────────────────────────────────────────────────────
  inFence = false;
  for (const [i, raw] of lines.entries()) {
    if (/^\s*```/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const line = raw.replace(/`[^`]*`/g, "");
    for (const { re, rule, why } of BANNED_TERMS) {
      const m = re.exec(line);
      if (!m) continue;
      if (allow.has(m[0].toLowerCase())) continue;
      findings.push({
        severity: "error", rule, line: i + 1,
        message: `"${m[0]}" — ${why}. Say what it meant for the business instead.`,
      });
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────
  const perf = sectionBody(lines, "Business performance");
  const firstSentence = (perf.match(/[^.!?]+[.!?]/)?.[0] ?? perf).trim();
  if (firstSentence && ACTIVITY_LOG_OPENINGS.some((re) => re.test(firstSentence))) {
    findings.push({
      severity: "error", rule: "activity-log-opening",
      message: `the brief opens with what was done ("${truncate(firstSentence, 60)}"). It must open with what the business did.`,
    });
  }

  // ── escalations ────────────────────────────────────────────────────────
  const decide = sectionBody(lines, "Needs your decision");
  if (decide.trim() === "") {
    findings.push({
      severity: "error", rule: "empty-decision-section",
      message: 'the "Needs your decision" section is empty — say "Nothing needs your decision today." explicitly',
    });
  } else if (!NOTHING_TO_DECIDE.test(decide)) {
    for (const field of ESCALATION_FIELDS) {
      if (!fieldPresent(decide, field)) {
        findings.push({
          severity: "error", rule: "escalation-incomplete",
          message: `an escalation is present but the "${field}" field is missing — the charter requires all five`,
        });
      }
    }
    const items = countEscalations(decide);
    if (items > 3) {
      findings.push({
        severity: "warning", rule: "escalation-volume",
        message: `${items} items ask for a decision. More than three usually means investigation stopped early.`,
      });
    }
  }

  return { findings, words, ok: !findings.some((f) => f.severity === "error") };
}

/**
 * Field detection accepts the label or a recognisable synonym, because the
 * brief is prose and forcing literal headings would produce a form rather than
 * a paragraph. What it will not accept is silence on a field.
 */
const FIELD_PATTERNS: Record<(typeof ESCALATION_FIELDS)[number], RegExp> = {
  choice: /\b(?:the choice|decision|decide whether|choose between|whether to)\b/i,
  established: /\b(?:what(?:'s| is| we) (?:already )?(?:known|established)|the facts|we (?:have )?(?:already )?(?:established|confirmed|measured|checked)|established:)\b/i,
  options: /\b(?:option|options|either .* or |alternativ)\b/i,
  recommendation: /\b(?:i recommend|my recommendation|recommended:|i would|i'd)\b/i,
  consequence: /\b(?:consequence|if you do nothing|if we (?:do|leave)|the cost of|what happens if|leaves)\b/i,
};

function fieldPresent(text: string, field: (typeof ESCALATION_FIELDS)[number]): boolean {
  return FIELD_PATTERNS[field].test(text);
}

/** Numbered or bulleted top-level items in the decision section. */
function countEscalations(text: string): number {
  return text.split(/\r?\n/).filter((l) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(l)).length;
}

function sectionBody(lines: string[], heading: string): string {
  const start = lines.findIndex((l) =>
    new RegExp(`^#{1,4}\\s*(?:\\d+\\.\\s*)?[*_\`]*${escapeRe(heading)}`, "i").test(l));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,4}\s+\S/.test(lines[i]!)) { end = i; break; }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** Prose only: no fenced code, no headings, no table rows, no link targets. */
function stripNonProse(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|.*$/gm, " ")
    .replace(/^#{1,6}\s.*$/gm, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function formatFindings(path: string, r: BriefLintResult): string {
  if (r.findings.length === 0) return `${path}: clean (${r.words} words)`;
  const out = [`${path}: ${r.findings.length} finding(s), ${r.words} words`];
  for (const f of r.findings) {
    const at = f.line ? `:${f.line}` : "";
    out.push(`  ${f.severity === "error" ? "✗" : "!"} ${path}${at} [${f.rule}] ${f.message}`);
  }
  return out.join("\n");
}
