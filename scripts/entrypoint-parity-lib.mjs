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
 *       coverage.yaml must be reachable from both files. Reachable means one
 *       of two mechanically distinct things, per this batch's review
 *       finding that a mention alone (no locator) had been enough:
 *         - the file carries the protocol's own full text: it has an actual
 *           Markdown heading (any level) whose text matches the row's
 *           CLAUDE.md-sourced heading, exactly or with a trailing "(...)"
 *           qualifier stripped from both sides. This is what CLAUDE.md does
 *           for every mirrored row, and what AGENTS.md does for the rows it
 *           restates in full (Session contract, Review routing, Program
 *           register, Research and ideas, Design tokens, Cheap extras,
 *           Evidence receipts) rather than condensing.
 *         - otherwise, the file names the row AND gives a locator (the
 *           row's full_body path, or the literal word "CLAUDE.md"/
 *           "CHARTER.md" naming the document that carries the body) *in the
 *           same place*. "In the same place" is defined mechanically as:
 *           the same Markdown block, where a block is a table row, a list
 *           item (with its wrapped continuation lines), or a paragraph
 *           delimited by blank lines -- never the whole file. A bare mention
 *           of the protocol's name with the locator only in a different
 *           block (a table's header row, a different paragraph) does not
 *           count; this is exactly the shape of the review finding that
 *           replaced AGENTS.md's protocol table with a naming-only
 *           paragraph and still passed.
 *   (c) MUTABLE_FACT_FOUND -- neither file may carry a money amount
 *       (symbol or currency word), a capability/solution/vertical/country/
 *       any-other-countable-noun count (digits or spelled out in words), a
 *       dated "(Month YYYY)" label or "as of <date>" staleness claim (ISO or
 *       Month-YYYY), or a decision-id-plus-summary sentence (id followed by
 *       a separator or a verb, then a multi-word summary). The scan applies
 *       only to a file's own authored prose: it skips a fenced code block (a
 *       manifest template's example literal, not a live fact), a zero-value
 *       money literal (a fixed constant, never a price that drifts), and a
 *       section whose heading matches a docs/project/protocol-coverage.yaml
 *       row's CLAUDE.md heading -- a mirrored protocol body, which
 *       legitimately restates historical figures as evidence for why the
 *       rule exists, not a live claim about current state. A second, named
 *       structural allowlist (MUTABLE_FACT_ALLOWLIST below) covers the one
 *       section that is not a protocol mirror but still must keep a money
 *       figure: AGENTS.md's own restatement of the Operating Charter's
 *       authorization thresholds.
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
 *
 * A known limitation of the mirrored-section scope in (c): a section is
 * identified as a mirror by its heading text matching a manifest row, not
 * by comparing its body against CLAUDE.md's copy. A future edit that adds a
 * genuinely new, stale fact to one of these sections in AGENTS.md (rather
 * than keeping it a faithful copy) would not be caught by this scan; that
 * fidelity check is out of this batch's scope.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkSchema, repoRootFrom } from "./protocol-coverage-lib.mjs";
import { checkPrecutoverEntrypoint } from "./check-project-context.mjs";
import { extractClaudeSectionText, readMirrorBody } from "./protocol-extraction-lib.mjs";

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
// the citation, not a guess. A heading that mirrors a
// docs/project/protocol-coverage.yaml row does not need an entry here: rule
// (c) excludes every mirrored-protocol section mechanically, from the same
// manifest rule (b) reads. This allowlist is only for a section that is not
// a protocol mirror but still legitimately carries a figure.
export const MUTABLE_FACT_ALLOWLIST = [
  // AGENTS.md's own text already labels this "the one Decision this file
  // restates, deliberately" -- the euro figures are authorization-boundary
  // thresholds (DEC-20260815-A), not a price that drifts. This heading is
  // not a protocol-coverage.yaml row (the manifest's production-authority
  // row mirrors a different, CHARTER.md-sourced heading), so the mirrored-
  // section scope in rule (c) does not cover it on its own.
  { file: "AGENTS.md", heading: "Operating Charter (DEC-20260815-A) — division of authority" },
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

// ── shared heading/dash helpers ─────────────────────────────────────────

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

// AGENTS.md's own prose avoids the em-dash (a repository-wide style rule for
// hand-written text), so a heading it reproduces from CLAUDE.md necessarily
// spells the same separator with a plain hyphen. Comparisons below normalize
// every dash variant to "-" first so that difference never causes a false
// PROTOCOL_UNREACHABLE, a missed mutable-fact allowlist match, or a missed
// mirrored-section match.
function normalizeDashes(text) {
  return text.replace(/[—–]/g, "-").replace(/-{2,}/g, "-");
}

function stripTrailingParenthetical(text) {
  return text.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function headCase(text) {
  return normalizeDashes(text).toLowerCase().trim();
}

// A line starting a fenced code block, tracked the same way scanMutableFacts
// already tracks it below -- a "#"-prefixed line inside a fence (a YAML
// comment, a Markdown example) is not an authored heading of the file, and
// must never satisfy hasOwnFullText on its own (finding 1, M4 batch 3 round
// 2: pasting a protocol's heading into an example block made the row
// reachable with no real content behind it).
const FENCE_RE = /^\s*```/;

function headingsIn(content) {
  const out = [];
  let inFence = false;
  for (const line of content.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}

/** Both the exact and trailing-parenthetical-stripped normalized forms of a
 * heading string, used everywhere a "same heading, condensed or not" match
 * is needed (rules b and c both need this). */
function headingForms(text) {
  const forms = new Set([headCase(text)]);
  const core = stripTrailingParenthetical(text);
  if (core) forms.add(headCase(core));
  return forms;
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

/** The row's CLAUDE.md heading text, or null for a row sourced elsewhere. */
function rowClaudeHeading(row) {
  if (!row.source || !row.source.startsWith(HEADING_SOURCE_PREFIX)) return null;
  return row.source.slice(HEADING_SOURCE_PREFIX.length).trim();
}

/** True when `content` carries the row's own full text: an actual Markdown
 * heading (any level) whose text matches the row's CLAUDE.md-sourced
 * heading, exactly or with both sides' trailing "(...)" qualifier stripped.
 * A CHARTER.md-sourced row (full_body is docs/company/CHARTER.md, not
 * either entrypoint) never satisfies this for CLAUDE.md or AGENTS.md --
 * both always reach it through a named locator instead (below). */
function hasOwnFullText(content, row) {
  const heading = rowClaudeHeading(row);
  if (!heading) return false;
  const wanted = headingForms(heading);
  for (const h of headingsIn(content)) {
    const actual = headingForms(h.text);
    for (const form of actual) if (wanted.has(form)) return true;
  }
  return false;
}

/** Every substring whose presence names the row (its own name, or the
 * CLAUDE.md/CHARTER.md heading it mirrors). Not sufficient on its own --
 * reachableByBlock also requires a locator in the same block. */
function nameTokens(row) {
  const tokens = new Set([row.name]);
  const coreName = stripTrailingParenthetical(row.name);
  if (coreName) tokens.add(coreName);
  if (row.source && row.source.startsWith(HEADING_SOURCE_PREFIX)) {
    const heading = row.source.slice(HEADING_SOURCE_PREFIX.length).trim();
    tokens.add(heading);
    const core = stripTrailingParenthetical(heading);
    if (core) tokens.add(core);
  } else if (row.source && row.source.startsWith(CHARTER_SOURCE_PREFIX)) {
    tokens.add(row.source.slice(CHARTER_SOURCE_PREFIX.length).trim());
  }
  return [...tokens].filter(Boolean);
}

/** Every substring that locates the row's full body: its full_body path
 * (identical to the mirror path under docs/governance/protocols/ for every
 * row in this manifest), or the literal name of the document that carries
 * it (CLAUDE.md for a CLAUDE.md-sourced row, CHARTER.md for the charter
 * row). */
function locatorTokens(row) {
  const tokens = new Set([row.full_body]);
  if (row.source && row.source.startsWith(HEADING_SOURCE_PREFIX)) {
    tokens.add("CLAUDE.md");
  } else if (row.source && row.source.startsWith(CHARTER_SOURCE_PREFIX)) {
    tokens.add("CHARTER.md");
  }
  return [...tokens].filter(Boolean);
}

/** Splits Markdown content into blocks: a table row, a list item (with its
 * wrapped continuation lines), or a paragraph delimited by blank lines, are
 * each their own block. This is "the same place" a name and a locator must
 * both appear in for rule (b) -- never the whole file, and for a table,
 * never the header row on behalf of a data row two lines below it.
 *
 * A fence is excluded twice over (finding 2, M4 batch 3 round 2): the fence
 * delimiter and everything inside it are dropped from every block entirely
 * (fenced content, e.g. a manifest template's example path, is never a
 * locator a reader follows from prose), AND a fence boundary always flushes
 * whatever block came before it, so a sentence naming a protocol immediately
 * followed by a fenced snippet can never absorb a path inside that fence
 * into its own block, and prose that resumes after the fence starts a new
 * block rather than continuing the one before it. Both halves are needed:
 * dropping the content alone would still let a name-bearing paragraph and a
 * locator-bearing paragraph merge across the fence if neither flushed first. */
function extractBlocks(content) {
  const blocks = [];
  let current = [];
  let inFence = false;
  const flush = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };
  for (const line of content.split("\n")) {
    if (FENCE_RE.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*$/.test(line)) {
      flush();
      continue;
    }
    const startsNewBlock =
      /^\s*\|/.test(line) || /^\s*(?:[-*]\s+|\d+\.\s+)/.test(line) || HEADING_RE.test(line);
    if (startsNewBlock) flush();
    current.push(line);
  }
  flush();
  return blocks;
}

function normalizeForMatch(text) {
  return normalizeDashes(text).toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when some single block of `content` contains both a name token and
 * a locator token for `row`. */
function reachableByBlock(content, row) {
  const names = nameTokens(row).map(normalizeForMatch).filter(Boolean);
  const locators = locatorTokens(row).map(normalizeForMatch).filter(Boolean);
  if (names.length === 0 || locators.length === 0) return false;
  for (const block of extractBlocks(content)) {
    const normalized = normalizeForMatch(block);
    const hasName = names.some((t) => normalized.includes(t));
    if (!hasName) continue;
    if (locators.some((t) => normalized.includes(t))) return true;
  }
  return false;
}

export function checkProtocolReachability(root, contents) {
  const findings = [];
  const { findings: schemaFindings, manifest, valid } = checkSchema(root);
  if (!valid) {
    return schemaFindings.map((f) => finding(f.code, f.file, f.detail));
  }
  for (const row of manifest.protocols) {
    for (const [file, content] of Object.entries(contents)) {
      const reachable = hasOwnFullText(content, row) || reachableByBlock(content, row);
      if (!reachable) {
        findings.push(
          finding(
            "PROTOCOL_UNREACHABLE",
            file,
            `row "${row.id}" (${row.name}) has no heading of its own in ${file}, and no single block (table row, list item, or paragraph) in ${file} both names it and gives a locator (its full body path, or the document that carries it)`,
          ),
        );
      }
    }
  }
  return findings;
}

// ── (c) mutable facts ───────────────────────────────────────────────────

const MONEY_RE =
  /(?<sym>[€$])\s?(?<symAmt>\d[\d.,]*)|(?<wordAmt>\d[\d.,]*)\s*(?:cents|EUR|USD|euros?|dollars?)\b/gi;

// A number written in digits ("290", "300+") or spelled out in English
// words ("seven", "two hundred and ninety"), immediately followed by a
// countable noun -- either one of five domain nouns this repo has drifted
// on before (kept for the singular "capability" form, which the generic
// plural heuristic below would miss), or, more generally, any other word
// that looks like a plural noun (ends in "s") and is not one of the common
// non-noun words that also end in "s" (COUNT_NOUN_STOPWORDS).
const NUMBER_WORD =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";
const NUMBER_PHRASE = `${NUMBER_WORD}(?:[\\s-]+(?:and[\\s-]+)?${NUMBER_WORD})*`;
const COUNT_QUANTITY = `(?:\\d+\\+?|${NUMBER_PHRASE})`;
const NAMED_COUNT_RE = new RegExp(
  `\\b${COUNT_QUANTITY}\\s+(?:capabilit(?:y|ies)|solutions?|verticals?|categories|countries)\\b`,
  "gi",
);
const GENERIC_COUNT_RE = new RegExp(`\\b${COUNT_QUANTITY}\\s+([A-Za-z][A-Za-z-]*s)\\b`, "gi");
const COUNT_NOUN_STOPWORDS = new Set([
  "is",
  "was",
  "are",
  "were",
  "has",
  "as",
  "this",
  "plus",
  "minus",
  "times",
  "across",
  "less",
  "unless",
  "toward",
  "towards",
  "upwards",
  "downwards",
  "always",
  "status",
  "process",
  "processes",
  "access",
  "address",
  "addresses",
  "business",
  "progress",
  "success",
  "express",
  "press",
  "us",
  "yes",
  "days",
  "hours",
  "weeks",
  "months",
  "years",
  "minutes",
  "seconds",
  // Real-content exceptions: a small fixed pair or handful of named things,
  // not a platform-scale count that drifts (CLAUDE.md's "Two ids named in
  // this section's prior text..." and "The two declarations must match
  // shape" -- both refer to a specific, non-drifting pair, not a catalog
  // count).
  "ids",
  "declarations",
  // "a program starts with those two files" (Program register) names a
  // fixed pair -- PROGRAM.md and tracks.yaml -- not a count that grows.
  "files",
  // "an unledgered block, or two blocks writing the same column" (Evidence
  // receipts) is the fixed pair from the 2026-08-21 incident this section
  // cites as its case study, not a catalog count.
  "blocks",
  // "where each one lives" (Research and ideas' own heading) is idiomatic:
  // "one" is a pronoun and "lives" is the verb "to live", not a plural
  // noun -- the same shape "is"/"was"/"are" above already guard against.
  "lives",
]);
const MONTH_NAMES_RE =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
// A single date value, in the three shapes this repository's drift-prone
// prose actually uses: ISO ("2026-09-11", "2026-09"), "Month YYYY", and a
// fiscal quarter ("Q3 2026"). Shared by every dated-status pattern below so
// adding a new staleness phrase never means writing a fourth copy of the
// same three date shapes.
const DATE_VALUE_RE = `(?:\\d{4}-\\d{2}(?:-\\d{2})?|${MONTH_NAMES_RE}\\s+\\d{4}|Q[1-4]\\s+\\d{4})`;
const DATED_PARENTHETICAL_RE = new RegExp(`\\(${MONTH_NAMES_RE}\\s+\\d{4}\\)`, "g");
// "as of <date>" in any of the three date shapes, including the quarter form
// ("Status as of Q3 2026") finding 4 named explicitly -- a superset of the
// prior ISO-only and Month-YYYY-only patterns, so a plain "as of" prefix is
// enough once the date value it precedes is recognised in any shape.
const AS_OF_RE = new RegExp(`\\bas of ${DATE_VALUE_RE}\\b`, "gi");
// The two other ordinary ways a dated status is written in this repo's
// prose, beyond "as of <date>" (finding 4): "Last verified: <date>" and
// "Updated <date>" (with or without "on"). Both are staleness claims about
// the current state of a section, exactly the shape rule (c) exists to
// catch -- neither was recognised before this fix, which is why a table-
// cell count could hide but so could a plain "Last verified: 2026-08-01"
// line with no table involved.
const LAST_VERIFIED_RE = new RegExp(`\\bLast verified:?\\s+${DATE_VALUE_RE}\\b`, "gi");
const UPDATED_STATUS_RE = new RegExp(`\\bUpdated\\s+(?:on\\s+)?${DATE_VALUE_RE}\\b`, "gi");
const DEC_ID_RE = /\bDEC-\d{8}(?:-[A-Za-z0-9]+)*\b/g;
// A decision id counts as followed by a summary when the text right after
// it starts with a separator (colon, semicolon, or any dash) and then at
// least three more words, or starts with a verb ("is"/"was"/"reads"/...)
// and then at least three more words. A bare id followed by ordinary
// sentence continuation ("for the full text.") matches neither branch.
const SUMMARY_AFTER_ID_RE =
  /^\s*(?:[:;\-–—]+\s*(?:\S+\s+){2,}\S+|(?:is|was|are|were|means?|reads?|says?|states?|describes?)\s+(?:\S+\s+){2,}\S+)/i;

function moneyValueIsZero(match) {
  const numeric = (match.groups.symAmt ?? match.groups.wordAmt ?? "").replace(/,/g, "");
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

/** Every count-pattern hit in one string of text (a raw line, or two table
 * cells joined together -- see findCounts below), applying the same noun
 * checks either way. */
function countHitsIn(text) {
  const hits = [];
  for (const m of text.matchAll(NAMED_COUNT_RE)) hits.push({ category: "COUNT", snippet: m[0] });
  for (const m of text.matchAll(GENERIC_COUNT_RE)) {
    const noun = m[1].toLowerCase();
    if (!noun.endsWith("s")) continue;
    if (COUNT_NOUN_STOPWORDS.has(noun)) continue;
    hits.push({ category: "COUNT", snippet: m[0] });
  }
  return hits;
}

/** A count split across two table cells (finding 4: "| Verticals | seven |"
 * evades both count patterns, because the count and its noun are adjacent
 * words in neither cell). Both regexes require the count directly before
 * the noun with only whitespace between them, so neither a raw line nor a
 * single cell ever matches this shape. For each pair of adjacent cells,
 * join them in both orders ("cell[i] cell[i+1]" and "cell[i+1] cell[i]")
 * and run the same count patterns on the joined text -- this catches the
 * count-then-noun shape regardless of which cell the reader put the count
 * in, without loosening the per-line patterns to ignore the "|" separator
 * generally, which would risk matching across unrelated cells in a wide
 * table row. */
function tableCellCountHits(line) {
  if (!/\|/.test(line)) return [];
  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const hits = [];
  for (let i = 0; i < cells.length - 1; i++) {
    hits.push(...countHitsIn(`${cells[i]} ${cells[i + 1]}`));
    hits.push(...countHitsIn(`${cells[i + 1]} ${cells[i]}`));
  }
  return hits;
}

function findCounts(line) {
  return [...countHitsIn(line), ...tableCellCountHits(line)];
}

function findDates(line) {
  const hits = [];
  for (const m of line.matchAll(DATED_PARENTHETICAL_RE)) hits.push({ category: "DATE", snippet: m[0] });
  for (const m of line.matchAll(AS_OF_RE)) hits.push({ category: "DATE", snippet: m[0] });
  for (const m of line.matchAll(LAST_VERIFIED_RE)) hits.push({ category: "DATE", snippet: m[0] });
  for (const m of line.matchAll(UPDATED_STATUS_RE)) hits.push({ category: "DATE", snippet: m[0] });
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

/** The normalized heading forms of every docs/project/protocol-coverage.yaml
 * row whose CLAUDE.md section is *verified* -- not merely named -- to be the
 * mirrored protocol body: CLAUDE.md's own section for the row's heading,
 * re-extracted fresh with the identical algorithm protocols:check uses
 * (extractClaudeSectionText), compares line-for-line equal to the row's
 * full_body mirror under docs/governance/protocols/ (readMirrorBody, the
 * same BEGIN/END slice protocols:check compares CLAUDE.md against). A
 * heading match alone is never enough (finding 3, M4 batch 3 round 2:
 * copying a protocol heading over a fabricated paragraph used to hide every
 * fact under it) -- a section whose heading matches a row but whose body
 * does not match the mirror is scanned like any other prose, because it
 * fails the equality check and its form is never added here.
 *
 * This only ever runs against CLAUDE.md's own text, never AGENTS.md's,
 * which is why checkMutableFacts below applies the returned set to CLAUDE.md
 * alone. AGENTS.md is a condensed derivative by design (its own opening line
 * says so): even the handful of rows it restates at length reflow the
 * heading to one level shallower and substitute the em-dash CLAUDE.md uses
 * for a plain hyphen (a repo-wide style rule for hand-written prose, see
 * normalizeDashes above), so no AGENTS.md section can ever be byte-identical
 * to a mirror extracted verbatim from CLAUDE.md. Trying to verify AGENTS.md
 * sections against the mirror the same way would not recognise even its
 * most faithful restatements as mirrors, so nothing is lost by not trying;
 * it also means every AGENTS.md heading is scanned like ordinary prose
 * without exception, which is the safer default for the one file this
 * manifest holds no verbatim body for.
 *
 * Returns an empty set (scans everything) if the manifest fails schema
 * validation; checkProtocolReachability reports that failure on its own
 * path. */
function verifiedMirroredHeadingForms(root) {
  const forms = new Set();
  const { manifest, valid } = checkSchema(root);
  if (!valid) return forms;
  for (const row of manifest.protocols) {
    const heading = rowClaudeHeading(row);
    if (!heading) continue;
    if (!row.full_body) continue;
    let claudeSection;
    try {
      claudeSection = extractClaudeSectionText(root, heading);
    } catch {
      // Heading missing or duplicated in CLAUDE.md -- checkProtocolReachability
      // already reports that shape; nothing to verify a mirror against here.
      continue;
    }
    const mirrorBody = readMirrorBody(root, row.full_body);
    if (mirrorBody === null) continue;
    if (claudeSection.split("\n").join("\n") !== mirrorBody.join("\n")) continue;
    for (const form of headingForms(heading)) forms.add(form);
  }
  return forms;
}

/** Scans one file's content for mutable-fact patterns, honoring the code-
 * fence skip (a manifest template's example literal, e.g. `price_cents: 5`,
 * is structural, not a live fact), this file's own allowlisted heading
 * sections (MUTABLE_FACT_ALLOWLIST), and every mirrored-protocol-body
 * heading (mirroredHeadingForms). Returns raw {category, line, snippet}
 * hits; the caller turns them into findings. */
export function scanMutableFacts(file, content, mirroredHeadingForms = new Set()) {
  const allowlistedHeadings = new Set(
    MUTABLE_FACT_ALLOWLIST.filter((entry) => entry.file === file).flatMap((entry) =>
      [...headingForms(entry.heading)],
    ),
  );
  const hits = [];
  let inFence = false;
  let excluded = false;
  let excludedLevel = 0;
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
      const forms = headingForms(headingMatch[2].trim());
      if (excluded && level <= excludedLevel) excluded = false;
      const isAllowlisted = [...forms].some((f) => allowlistedHeadings.has(f));
      const isMirrored = [...forms].some((f) => mirroredHeadingForms.has(f));
      if (isAllowlisted || isMirrored) {
        excluded = true;
        excludedLevel = level;
      }
    }
    if (inFence || excluded) continue;
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

/**
 * True when a file leaves a fence open at its end. Fence tracking is a
 * toggle, so an unclosed fence makes every later line read as fenced and
 * therefore skipped by the heading, block and fact scans alike. That is an
 * evasion route, not a formatting slip: a fact or a missing pointer after an
 * unclosed fence would be invisible to all three rules at once. Reported, so
 * the check never quietly stops looking.
 */
export function hasUnterminatedFence(content) {
  let open = false;
  for (const line of content.split("\n")) if (/^\s*```/.test(line)) open = !open;
  return open;
}

export function checkMutableFacts(root, contents) {
  const findings = [];
  const mirrored = verifiedMirroredHeadingForms(root);
  for (const [file, content] of Object.entries(contents)) {
    // The verified-mirror set is computed from CLAUDE.md and only ever
    // applies to CLAUDE.md -- see verifiedMirroredHeadingForms's own comment
    // for why AGENTS.md is excluded by design, not by oversight.
    if (hasUnterminatedFence(content)) {
      findings.push(
        finding(
          "UNTERMINATED_FENCE",
          file,
          "a code fence is opened and never closed, so every later line reads as fenced and is skipped by the heading, block and fact scans",
        ),
      );
    }
    const mirroredForFile = file === "CLAUDE.md" ? mirrored : new Set();
    for (const hit of scanMutableFacts(file, content, mirroredForFile)) {
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
    ...checkMutableFacts(root, contents),
    ...checkInactiveDocumentReferences(root, contents),
  ];
  return { findings };
}
