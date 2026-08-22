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

/**
 * The exemption sentence — matched against the WHOLE section, anchored.
 *
 * It was previously a substring search anywhere in the section, which made
 * every escalation check bypassable by one clause:
 *
 *   Nothing needs your decision today, except one thing.
 *   FOUNDER_DECISION
 *   Should we double the price of everything? Tell me.
 *
 * linted clean — no fields required, and the check that rejects an already-done
 * `SYSTEM_ACTING` item under this heading was disabled by the same branch. The
 * exemption now applies only when the section says that and nothing else.
 */
const NOTHING_TO_DECIDE = /^nothing needs your decision(?: today)?[.!]?$/i;

function claimsNothingToDecide(section: string): boolean {
  const meaningful = section
    .split(/\r?\n/)
    // `-` too, so a horizontal rule under the sentence is not read as content.
    .map((l) => l.replace(/[*_`-]/g, "").trim())
    .filter(Boolean);
  return meaningful.length === 1 && NOTHING_TO_DECIDE.test(meaningful[0]!);
}

/**
 * Statuses, per CHARTER.md § "Three statuses".
 *
 * `AUTHORIZATION_UNAVAILABLE` is the one that changes this file's behaviour: it
 * marks an item whose decision is settled and whose execution authority is
 * missing. Such an entry is a handover, not a question, so it is NOT held to
 * the five judgement fields — holding it to them would force a settled matter
 * into a decision shape and invite the founder to re-open something that is not
 * open. Its own three fields are required instead.
 *
 * `SYSTEM_ACTING` is rejected in this section outright: an action already taken
 * belongs in "Fixed automatically". Letting it appear under "Needs your
 * decision" is how a completed act acquires the appearance of having been
 * asked about.
 */
export const STATUS_TAGS = ["SYSTEM_ACTING", "FOUNDER_DECISION", "AUTHORIZATION_UNAVAILABLE"] as const;
export type StatusTag = (typeof STATUS_TAGS)[number];

/**
 * Matters that are already decided, and must never reappear as a decision.
 *
 * The brief kept re-escalating things the record had settled: whether the
 * eleven-row reconciliation should stand (the incident was closed and accepted
 * the same day, and the ledger is explicit that the rows were deliberately not
 * rewritten), and whether to publish narrower integrity wording (the approved
 * correction is removal with **no** replacement claim, so the narrower-wording
 * question was never the one on the table).
 *
 * Re-asking a settled question is not a harmless extra: it spends the founder's
 * attention on work he has already done, and it invites him to reverse himself
 * without the context that produced the original decision. It is the mirror of
 * F10's other failures — this time treating a closed matter as open.
 *
 * A new entry belongs here when a decision is recorded somewhere durable. Each
 * carries where, so a reader can check the claim rather than trust the list.
 */
export const SETTLED_MATTERS: Array<{ id: string; re: RegExp; settledBy: string }> = [
  {
    id: "eleven-row-reconciliation",
    // Matched on the ACT, not on a count. The first version keyed on "eleven"
    // near a noun, which review evaded with "eleven stranded charges" and with
    // "this morning's reconciliation stands or is reversed" — and which fired
    // on the unrelated "11 transactions at 20 cents". Keying on the decision
    // being re-asked is both wider and narrower in the right directions.
    re: /\b(?:stands?|standing) (?:or|and) (?:it |be |being |is |get |gets )?rever(?:s|t)|rever(?:s(?:e|ing|ed)|t(?:ing|ed)?) (?:it|the (?:change|reconciliation|write))|(?:un(?:do|done)|roll(?:ing)? back|back(?:ing)? out|reinstat(?:e|ing)) (?:it|the (?:change|reconciliation|write|credit))|(?:revert|reopen|re-open|re-run|rerun|back out|reinstate|undo|put)[^.]{0,40}\b(?:eleven|11)\b[^.]{0,20}(?:rows?|records?|transactions?|charges?)|\b(?:eleven|11)-row|\bmanual_reconciliation\b|stranded (?:executing )?(?:rows?|records?|transactions?|charges?)/i,
    settledBy:
      "the production-authorization incident was closed and ACCEPTED on 2026-08-22 " +
      "(PR #361, accepted in #364); the remediation ledger records that the rows were " +
      "deliberately not rewritten and that the incident record is the correction",
  },
  {
    id: "integrity-claim-wording",
    // Any re-opening of the public integrity claim, in noun or adjective form,
    // plus the specific move the approved plan rules out: proposing replacement
    // wording at all.
    re: /\btamper[- ]eviden(?:t|ce)\b|\bhash[- ]chained? (?:audit|integrity|record)\b|\b(?:replacement|narrower|hedged|softer) (?:integrity |cryptographic |tamper[- ]eviden(?:t|ce) )?(?:claim|wording|copy)\b/i,
    settledBy:
      "the founder approved the correction itself — unsupported tamper-evidence and " +
      "downstream-regulatory-verification claims are removed, with no replacement " +
      "integrity claim until independently substantiated. The operative surface plan lives on the remediation branch, not yet on main. It supersedes " +
      "the withdrawn hedged rewording, so 'which wording should we publish' is not the " +
      "open question; removal is what was approved",
  },
];

/** Fields required on an `AUTHORIZATION_UNAVAILABLE` entry. */
export const HANDOVER_FIELDS = ["settled", "why_not_mine", "what_i_need"] as const;

const HANDOVER_LABELS: Record<(typeof HANDOVER_FIELDS)[number], RegExp> = {
  settled: /\*\*\s*settled\b/i,
  why_not_mine: /\*\*\s*why (?:it |this )?is not mine\b/i,
  what_i_need: /\*\*\s*what I need\b/i,
};

/**
 * Asking the founder to perform the operation.
 *
 * A handover is a request for *authority*, never for labour. The first draft of
 * a real brief closed with "do it yourself, or tell me and I will", which reads
 * as an instruction to go and run a production operation. He is the person who
 * grants permission, not the person who executes; a handover that inverts that
 * has mistaken a permission problem for a staffing one.
 */
const ASKS_FOUNDER_TO_OPERATE =
  /\b(?:do it yourself|run it yourself|you(?:'ll| will)? need to (?:run|execute|apply)|execute it yourself|(?:please )?run (?:the|this) (?:script|command|migration))\b/i;

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
  } else if (!claimsNothingToDecide(decide)) {
    // Exempt only when the section is that sentence and nothing else. A section
    // carrying anything further — a handover, an escalation, a caveat — is
    // checked in full, however it opens.
    const blocks = splitByStatus(decide);

    // Read on the RAW section, not on the split blocks. `splitByStatus` takes
    // the first tag per line, so `AUTHORIZATION_UNAVAILABLE and SYSTEM_ACTING —
    // I already closed the records` classified as a handover and slipped past
    // this check. An already-executed item must not be reportable here whatever
    // else shares its line.
    if (/\bSYSTEM_ACTING\b/.test(decide) || blocks.some((b) => b.status === "SYSTEM_ACTING")) {
      findings.push({
        severity: "error", rule: "status-misplaced",
        message:
          'a SYSTEM_ACTING item appears under "Needs your decision" — it is already done ' +
          'and belongs in "Fixed automatically". Nothing already executed may be presented as if it were asked about.',
      });
    }

    for (const b of blocks) {
      // A settled matter is not made open by the tag it wears. Checking only
      // FOUNDER_DECISION left the obvious escape: relabel it a handover and it
      // lints clean while reproducing F10 incident 3 word for word — a settled
      // thing presented as awaiting his approval.
      const settled = SETTLED_MATTERS.find((m) => m.re.test(b.text));
      if (settled && b.status !== "SYSTEM_ACTING") {
        findings.push({
          severity: "error", rule: "settled-matter-reopened",
          message:
            `this puts "${settled.id}" back in front of the founder, and it is already ` +
            `settled — ${settled.settledBy}. Report it as done, or as work in progress, ` +
            "but never as something awaiting him: re-asking spends his attention on a " +
            "decision he has made.",
        });
      }
      if (b.status === "AUTHORIZATION_UNAVAILABLE") {
        // A handover, not a question. Held to its own three fields, and
        // deliberately NOT to the five judgement fields.
        for (const field of HANDOVER_FIELDS) {
          if (!HANDOVER_LABELS[field].test(b.text)) {
            findings.push({
              severity: "error", rule: "handover-incomplete",
              message:
                `an AUTHORIZATION_UNAVAILABLE item is missing its "${field.replace(/_/g, " ")}" field — ` +
                "a handover states what is settled, why it is not mine, and what is needed",
            });
          }
        }
        if (ASKS_FOUNDER_TO_OPERATE.test(b.text)) {
          findings.push({
            severity: "error", rule: "handover-asks-for-labour",
            message:
              "an AUTHORIZATION_UNAVAILABLE item asks the founder to run the operation. " +
              'The ask is "approve it" or "grant me the authority" — he grants permission, ' +
              "he is not the operator.",
          });
        }
        for (const field of ESCALATION_FIELDS) {
          if (fieldPresent(b.text, field) && field !== "recommendation") {
            findings.push({
              severity: "warning", rule: "handover-as-decision",
              message:
                `an AUTHORIZATION_UNAVAILABLE item carries the "${field}" field. Its decision is ` +
                "settled — presenting it as an open choice invites a re-decision that is not being asked for.",
            });
          }
        }
      } else if (b.status === "FOUNDER_DECISION") {
        for (const field of ESCALATION_FIELDS) {
          if (!fieldPresent(b.text, field)) {
            findings.push({
              severity: "error", rule: "escalation-incomplete",
              message: `an escalation is present but the "${field}" field is missing — the charter requires all five`,
            });
          }
        }
      } else if (b.status === "UNTAGGED") {
        findings.push({
          severity: "error", rule: "untagged-item",
          message:
            "text in this section carries no status tag. Every item here is " +
            "FOUNDER_DECISION or AUTHORIZATION_UNAVAILABLE — an untagged sentence " +
            "cannot be checked against either contract, and cannot tell the reader " +
            "whether it wants a judgement or an authority.",
        });
      }
      // SYSTEM_ACTING needs nothing further: `status-misplaced` above already
      // says it does not belong in this section at all. Running the five field
      // checks over it too would bury one true finding under five misleading
      // ones — the diagnostic problem the UNTAGGED rule was added to fix.
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
 * Split the decision section into per-item blocks by their status tag.
 *
 * An untagged section is one implicit `FOUNDER_DECISION` block — the tags are a
 * refinement of the existing contract, not a new requirement that would
 * retroactively fail every brief written before them.
 */
function splitByStatus(text: string): Array<{ status: StatusTag | "UNTAGGED"; text: string }> {
  const tag = new RegExp(`\\b(${STATUS_TAGS.join("|")})\\b`);
  const lines = text.split(/\r?\n/);
  const blocks: Array<{ status: StatusTag | "UNTAGGED"; text: string }> = [];
  let current: { status: StatusTag; text: string } | null = null;
  // Text before the first tag is an untagged block, NOT discarded. Dropping it
  // let an escalation placed above the first tag escape every field check.
  let preamble = "";
  for (const line of lines) {
    const m = tag.exec(line);
    if (m) {
      if (current) blocks.push(current);
      current = { status: m[1] as StatusTag, text: line };
    } else if (current) {
      current.text += `\n${line}`;
    } else {
      preamble += `${line}\n`;
    }
  }
  if (current) blocks.push(current);
  // An untagged preamble carrying content is reported as UNTAGGED, not as a
  // founder decision missing five fields. Both fail the run, but reporting five
  // missing fields on an escalation that has all five points the author at the
  // wrong text — the diagnostic has to name the real problem, which is that the
  // prose is outside the contract.
  //
  // `-` is stripped along with the emphasis characters so a `---` rule does not
  // read as content.
  const preambleHasContent = preamble
    .split(/\r?\n/)
    .map((l) => l.replace(/[*_`#-]/g, "").trim())
    .some((l) => l.length > 0 && !NOTHING_TO_DECIDE.test(l));
  // Only when the section is PARTLY tagged. A section with no tags at all is
  // still read as one founder decision, so briefs written before the tags
  // existed do not retroactively fail; stray prose beside a tagged item is a
  // different thing and gets its own finding.
  if (blocks.length > 0 && preambleHasContent) {
    blocks.unshift({ status: "UNTAGGED", text: preamble });
  }
  return blocks.length > 0 ? blocks : [{ status: "FOUNDER_DECISION", text }];
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
  const depthOf = (l: string) => /^(#{1,6})\s*\S/.exec(l)?.[1]?.length ?? 0;
  const start = lines.findIndex((l) =>
    new RegExp(`^#{1,4}\\s*(?:\\d+\\.\\s*)?[*_\`]*${escapeRe(heading)}`, "i").test(l));
  if (start === -1) return "";
  // A section ends at the next heading of the SAME OR SHALLOWER depth — not at
  // any heading. Terminating on the first heading of any level meant a single
  // `###` line inside "Needs your decision" ended the section early, and
  // everything after it went unlinted: an escalation with no fields, or an
  // already-executed SYSTEM_ACTING item, both passed clean behind a sub-heading.
  // Found by adversarial review after the first fix to this area, which closed
  // the reported example and not the class.
  const own = depthOf(lines[start]!);
  // The LAST required section runs to the end of the document. DAILY-RUN.md
  // says the brief is "the five sections above, and nothing else", and without
  // this a same-depth `## Appendix` after section 5 was a clean bypass: a full
  // untagged escalation placed there was never linted. Closing only deeper
  // headings closed the reported probe and not the class.
  const runsToEnd = heading.toLowerCase()
    === REQUIRED_SECTIONS[REQUIRED_SECTIONS.length - 1]!.toLowerCase();
  let end = lines.length;
  let fenced = false;
  if (!runsToEnd) {
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i]!)) { fenced = !fenced; continue; }
      if (fenced) continue;
      const d = depthOf(lines[i]!);
      if (d > 0 && d <= own) { end = i; break; }
    }
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
