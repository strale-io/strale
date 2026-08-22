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
  // A commit id, and not an English word. Requiring BOTH a digit and a letter
  // separates `1ec94b0` from "acceded"/"effaced" (letters only) and from an org
  // number or a request count (digits only) — all three of which the first
  // version flagged. And no trailing lookahead: that version had `(?![.\w])`,
  // which made a sha at the end of a sentence — by far its commonest position —
  // invisible, while the unit test happened to exercise only the mid-sentence
  // case. A rule validated exactly where it works is family F5.
  {
    re: /\b(?=[0-9a-f]{7,40}\b)(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/,
    rule: "commit-sha", why: "a commit id means nothing to the reader",
  },
  { re: /\b\w[\w-]*\.(?:ts|tsx|js|mjs|sql|yaml|yml|json|py|md)\b/i, rule: "filename", why: "a filename is not a business fact" },
  { re: /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+(?:\*|\w+)\s+(?:FROM|INTO|SET)\b/i, rule: "sql", why: "queries belong in the operating record" },
  { re: /\b(?:migration|block)\s+\d{3,4}\b/i, rule: "migration", why: "migration numbers are internal bookkeeping" },
  // The five rules below are phrase-scoped, not word-scoped. The first draft
  // banned the bare words and an adversarial read found it rejecting ordinary
  // business English: "the table above", "our price index", "the real test is
  // whether a second buyer appears", "a package of three checks", "we deployed
  // capital", "a branch of the business", "I recommend we commit to the higher
  // price", "this is not a financial instrument". A guard that rejects correct
  // prose gets worked around inside a week, so the precision is the point.
  {
    re: /\b(?:database (?:column|table|schema|index)|foreign key|(?:column|table|schema) (?:name|in the database))\b/i,
    rule: "db-internals", why: "database internals are not a founder concern",
  },
  {
    re: /\b(?:branch(?:es|ed)? (?:off|from|into)|rebased?|merged? (?:it |the |this )?(?:pull request|branch|to main|into main)|pushed to main|the repo(?:sitory)?|CI (?:is |was |went )?(?:green|red|passing|failing)|deployed (?:it|the (?:fix|change|code)))\b/i,
    rule: "vcs", why: "shipping mechanics are execution, never news",
  },
  {
    re: /\b(?:tests? (?:pass|passed|passing|fail|failed|failing|cover|covering)|\d+ (?:new )?(?:tests?|assertions?)|test suite|typecheck|regression tests?)\b/i,
    rule: "testing", why: "test counts are not business outcomes",
  },
  {
    re: /\b(?:npm|npx|pip install|the SDK|an? API endpoint|env(?:ironment)? var(?:iable)?s?)\b/i,
    rule: "tooling", why: "tooling names are not business facts",
  },
  {
    re: /\b(?:refactor(?:ed|ing)?|executors?|middleware|serializers?|the payload|(?:test )?fixtures?|the handler)\b/i,
    rule: "jargon", why: "implementation vocabulary",
  },
  {
    re: /\b(?:quarantined?|circuit breakers?|the denominator|instrumentation)\b/i,
    rule: "internal-vocab", why: "our own operational vocabulary is not plain English",
  },
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
  //
  // Inline code spans are NOT stripped. Stripping them made every rule
  // bypassable by typing backticks, and nothing in DAILY-RUN.md ever permitted
  // a code span in a brief — so a code span is itself the finding.
  //
  // Every match on a line is examined, not just the first. The earlier loop
  // took `re.exec` once per rule and `continue`d if that one match was
  // allowlisted, so allowing one term silently disabled its whole rule for the
  // rest of the line.
  inFence = false;
  for (const [i, raw] of lines.entries()) {
    if (/^\s*```/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (/`[^`]+`/.test(raw)) {
      findings.push({
        severity: "error", rule: "code-span", line: i + 1,
        message: "a brief contains no code spans — if a term needs backticks it does not belong here",
      });
    }
    for (const { re, rule, why } of BANNED_TERMS) {
      const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      for (const m of raw.matchAll(global)) {
        if (allow.has(m[0].toLowerCase())) continue;
        findings.push({
          severity: "error", rule, line: i + 1,
          message: `"${m[0]}" — ${why}. Say what it meant for the business instead.`,
        });
      }
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────
  const perf = sectionBody(lines, "Business performance");
  // Strip list and emphasis markers before reading the opening sentence: the
  // anchored patterns never fired on "- We ran the morning checks…", so a
  // bulleted work log opened the brief unchallenged.
  const firstSentence = (perf.match(/[^.!?]+[.!?]/)?.[0] ?? perf)
    .replace(/^\s*(?:[-*]|\d+\.)\s*/, "").replace(/^[*_`]+/, "").trim();
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
 * Field detection is STRUCTURAL: each field is found by its label, not by
 * vocabulary anywhere in the paragraph.
 *
 * The first version tried to be accommodating and matched synonyms across the
 * whole section. An adversarial read broke it in both directions at once. This
 * passed clean while deciding nothing:
 *
 *   "We should decide whether to keep going as we are. The facts have not
 *    moved since Monday. Either we wait another week or we act now. I would
 *    wait. Waiting leaves us where we are."
 *
 * — and this, a complete and correct escalation, was rejected on all five:
 *
 *   "Price for the Greek registry: 20 cents or 35 cents. Known: 11 paid calls
 *    in 30 days at 20 cents, and the supplier charges us 12 cents each. I
 *    suggest 35 cents. Left alone we forgo about 15 euros a month."
 *
 * A check that admits fluent evasion and rejects terse substance is worse than
 * none: it teaches the writer to pad. Labels cost the author five bold phrases
 * and cannot be satisfied by tone. DAILY-RUN.md carries the same labels, so the
 * template and the check are one statement of the rule rather than two.
 */
const FIELD_LABELS: Record<(typeof ESCALATION_FIELDS)[number], RegExp> = {
  choice: /\*\*\s*(?:the\s+)?choice\b/i,
  established: /\*\*\s*(?:what is |what's )?established\b/i,
  options: /\*\*\s*(?:your |the )?options\b/i,
  recommendation: /\*\*\s*(?:i |my )?recommend(?:ation|s|ed)?\b/i,
  consequence: /\*\*\s*(?:the )?consequences?\b/i,
};

function fieldPresent(text: string, field: (typeof ESCALATION_FIELDS)[number]): boolean {
  return FIELD_LABELS[field].test(text);
}

/**
 * How many separate things are being escalated.
 *
 * Counted by `choice` labels, not by list items. Counting bullets scored a
 * single escalation written to the mandated template — one heading, five
 * sub-bullets — as five separate demands on the founder's attention, and then
 * warned about it.
 */
function countEscalations(text: string): number {
  return text.split(/\r?\n/).filter((l) => FIELD_LABELS.choice.test(l)).length;
}

/**
 * A section's body, terminated by the next heading.
 *
 * Two details that were wrong and mattered: the terminator has to accept the
 * same heading shapes the collector does (it required a space where the
 * collector did not, so `##Heading` ended nothing), and it has to ignore fenced
 * blocks — otherwise a `# comment` line inside a fence truncates the section
 * and the escalation check reports missing fields that are present.
 */
function sectionBody(lines: string[], heading: string): string {
  const isHeading = (l: string) => /^#{1,4}\s*\S/.test(l);
  const start = lines.findIndex((l) =>
    new RegExp(`^#{1,4}\\s*(?:\\d+\\.\\s*)?[*_\`]*${escapeRe(heading)}`, "i").test(l));
  if (start === -1) return "";
  let end = lines.length;
  let fenced = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i]!)) { fenced = !fenced; continue; }
    if (!fenced && isHeading(lines[i]!)) { end = i; break; }
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
