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
 *   (b) PROTOCOL_UNREACHABLE / LOCATOR_MISSING -- every row in docs/project/
 *       protocol-coverage.yaml must be reachable from both files, and every
 *       locator a file offers for a row must actually resolve. Round 3 of
 *       review closed two more mechanical gaps (round 2's own header comment
 *       below is preserved for the fixes it already made):
 *         - "own text" now requires a *substantive* body under the matching
 *           heading, not just the heading's presence (SUBSTANTIVE_WORD_FLOOR
 *           below), and -- when the matching heading text only matches after
 *           the trailing "(...)" qualifier is stripped -- the row's own
 *           decision id (that stripped qualifier) must appear somewhere in
 *           the heading or its body. Round 3 finding 1: a heading whose
 *           words matched a row only after stripping, with a body about
 *           something else entirely (a lunch menu, in the reviewer's own
 *           case), satisfied "carries its own text" before this fix, because
 *           only the heading text was ever checked. A word-count floor alone
 *           does not catch this (a long lunch menu still has enough words);
 *           the decision id check does, because a body actually about the
 *           protocol has a reason to mention it and a lunch menu does not.
 *         - a **locator** (the row's full_body path, or the literal word
 *           "CLAUDE.md"/"CHARTER.md" naming the document that carries the
 *           body) is no longer trusted as a bare string match. A path
 *           locator must resolve to a real file (LOCATOR_MISSING if not --
 *           round 3 finding 2's second case, and the reviewer's own "a
 *           locator pointing at a file that does not exist"). A "CLAUDE.md"
 *           or "CHARTER.md" word-locator must resolve to that document
 *           *actually carrying the row* by the same own-text rule -- round 3
 *           finding 2's first case, the reviewer's "the X protocol text was
 *           removed from CLAUDE.md and is not documented anywhere else yet"
 *           sentence, which satisfied the old rule because it contains the
 *           literal string "CLAUDE.md" next to the row's name while saying,
 *           in plain English, that CLAUDE.md does *not* carry it any more.
 *       Round 2's rule, still in force: reachable means one of two
 *       mechanically distinct things --
 *         - the file carries the protocol's own full text: it has an actual
 *           Markdown heading (any level) whose text matches the row's
 *           CLAUDE.md-sourced heading, exactly or with a trailing "(...)"
 *           qualifier stripped from both sides, now gated by the
 *           substantive-body and decision-id checks above. If the row has a
 *           CLAUDE.md mirror under docs/governance/protocols/ and the file
 *           being checked is CLAUDE.md itself, the body must also match that
 *           mirror exactly (verifiedMirroredHeadingForms below, reused
 *           unchanged from round 2's mutable-fact mirror check) -- round 2
 *           finding 3's fix, re-used rather than re-implemented, per this
 *           round's brief. AGENTS.md is a condensed derivative by design and
 *           is never held to mirror-exact equality (see
 *           verifiedMirroredHeadingForms's own comment).
 *         - otherwise, the file names the row AND gives a locator *in the
 *           same place*, resolved as above. "In the same place" is defined
 *           mechanically as: the same Markdown block, where a block is a
 *           table row, a list item (with its wrapped continuation lines), or
 *           a paragraph delimited by blank lines -- never the whole file. A
 *           bare mention of the protocol's name with the locator only in a
 *           different block does not count.
 *   (c) MUTABLE_FACT_FOUND -- neither file may carry a money amount (symbol
 *       or currency word, now including the Nordic and common currency
 *       codes a writer here would actually use: SEK, NOK, DKK, GBP, CHF,
 *       PLN, alongside EUR/USD/cents/euro/dollar), a capability/solution/
 *       vertical/country/any-other-countable-noun count (digits or spelled
 *       out in words; the five named domain nouns also match in noun-then-
 *       count order, a curated list narrow enough not to misread ordinary
 *       prose as a count -- an arbitrary plural noun only matches count-
 *       then-noun, which is why the noun-then-count direction stays scoped
 *       rather than generic), a
 *       dated "(Month YYYY)" label or staleness claim ("as of", "Last
 *       verified", "Updated", and now also "valid through", "refreshed",
 *       "reviewed", "current through" -- round 3 finding 4), or a decision-
 *       id-plus-summary sentence (id followed by a separator, or **any**
 *       word that is not a common non-verb function word, then a multi-word
 *       summary -- round 3 widens this from a fixed verb list). Round 3
 *       findings 4-6 were three different ways the same figure or claim hid
 *       from the scan: inside a Markdown link, inside bold/italic emphasis,
 *       and split across table cells with only whitespace between them, plus
 *       a decision summary that used a verb the old fixed list didn't
 *       include. Rather than one more pattern per shape, every line is
 *       normalized before matching (normalizeLineForScan below): link and
 *       image syntax collapses to its visible text, emphasis markers are
 *       stripped, and "|" table-cell separators become spaces, so adjacency
 *       reads the way a reader actually sees the rendered line -- the count
 *       patterns then also run in both count-then-noun and noun-then-count
 *       order, which is what actually closes the split-table-cell gap (round
 *       2's version joined adjacent cell pairs by hand for this one case;
 *       round 3 folds it into the ordinary scan instead). The scan applies
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
 * allowlist keyed to file/line that breaks on every edit. The narrower,
 * mechanically testable date shapes above are exactly the drift-prone shapes
 * this repository's own history has produced; a blanket scan is left out as
 * untestable against this repository's real content, per the standing
 * instruction to leave out a rule that cannot be proved by planting.
 *
 * A known limitation of the mirrored-section scope in (c), stated plainly
 * rather than chased with a heuristic (round 3 finding 7): a fact added to a
 * protocol's CLAUDE.md section **and** its mirror, in the same change, is
 * invisible to this scan and to `protocols:check` alike -- both check that
 * the two copies are equal to each other, never that either is true. The
 * reviewer's framing was the historical-incident-dates case, but the gap is
 * broader than dates: any fact introduced through the ordinary mirror-
 * maintenance path (edit CLAUDE.md's section, regenerate or hand-edit the
 * matching docs/governance/protocols/*.md body to match) passes both checks
 * regardless of whether the fact is stale, current, or simply wrong, because
 * neither check has an independent source of truth to compare against --
 * only each other. What actually governs that path is the reviewed pull
 * request that makes the edit, not a check; a cheap, exact way to narrow
 * this would need an independent ground truth to diff the mirrored body
 * against (the manifest carries no such field today, and inventing one that
 * is itself hand-maintained would just move the same trust problem one file
 * over) -- not attempted here, per the brief's instruction to say the cost
 * rather than build a heuristic.
 *
 * A second, narrower known limitation of the mirrored-section scope in (c):
 * a section is identified as a mirror by its heading text matching a
 * manifest row *and* its body matching the mirror file, not by tracking
 * which lines changed. A future edit that adds a genuinely new, stale fact
 * to one of these sections in AGENTS.md (rather than keeping it a faithful
 * copy) would not be caught by this scan, because AGENTS.md's own-text
 * sections are never checked against the mirror in the first place (see
 * verifiedMirroredHeadingForms's comment); that fidelity check is out of
 * this batch's scope.
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
export const CHARTER_PATH = "docs/company/CHARTER.md";

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

/** The literal text of a trailing "(...)" qualifier, or null if there is
 * none -- for a row name like "Example Protocol (DEC-TEST)" this is
 * "DEC-TEST". Used to require a stripped-only heading match to also carry
 * the row's own decision id somewhere nearby (round 3 finding 1: a heading
 * that only shares its opening words, with an unrelated body, must not
 * satisfy a row just because a word-count floor alone can't tell a real
 * paragraph from a long one about something else). */
function trailingParentheticalText(text) {
  const m = /\(([^()]*)\)\s*$/.exec(text.trim());
  return m ? m[1].trim() : null;
}

function headCase(text) {
  return normalizeDashes(text).toLowerCase().trim();
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

// ── fence tracking, shared by every rule that needs it ──────────────────

// A fence marker: an optional blockquote prefix (any number of "> " or ">"
// runs, since a fence can be nested inside a quoted aside), then a run of at
// least three of the same fence character, backtick or tilde (round 3
// finding 3: a `~~~` fence, or a fence opened with more than three markers,
// or one inside a blockquote, evaded every fence-aware scan before this fix,
// which reopened the heading-in-a-fence defeat rule (b) closed in round 2).
// The character and the marker's run length are both captured so a close
// can be required to use the same character and be at least as long as the
// open (CommonMark's own closing rule, and the shape round 3 asked for).
const FENCE_OPEN_RE = /^\s*(?:>\s*)*(`{3,}|~{3,})/;

function fenceMarker(line) {
  const m = FENCE_OPEN_RE.exec(line);
  if (!m) return null;
  const marker = m[1];
  return { char: marker[0], length: marker.length };
}

/** Walks `lines`, calling `onLine(line, index, fenced)` for every line, where
 * `fenced` is true for the fence delimiter lines themselves and every line
 * between an open and its close. A close must use the same fence character
 * as the open and be at least as long a run (never closed by a shorter or
 * differently-charactered marker). Returns true when a fence is left open at
 * the end of `lines` -- the single fence-tracking primitive every rule below
 * shares (headings, blocks, the mutable-fact scan, and the unterminated-
 * fence guard itself), so a fence-shape fix here closes all of them at once
 * instead of needing four separate patches (round 3 finding 3's own
 * instruction: "apply it in every place that tracks fences"). */
function walkFenceAware(lines, onLine) {
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = fenceMarker(line);
    if (open) {
      const isClose = marker !== null && marker.char === open.char && marker.length >= open.length;
      onLine(line, i, true);
      if (isClose) open = null;
      continue;
    }
    if (marker) {
      open = marker;
      onLine(line, i, true);
      continue;
    }
    onLine(line, i, false);
  }
  return open !== null;
}

/** True when a file leaves a fence open at its end. Fence tracking is a
 * toggle, so an unclosed fence makes every later line read as fenced and
 * therefore skipped by the heading, block and fact scans alike. That is an
 * evasion route, not a formatting slip: a fact or a missing pointer after an
 * unclosed fence would be invisible to all three rules at once. Reported, so
 * the check never quietly stops looking.
 */
export function hasUnterminatedFence(content) {
  return walkFenceAware(content.split("\n"), () => {});
}

/** Every heading not inside a fence, with the (0-based) line index it starts
 * at, in document order. Shared by hasOwnFullText/contentCarriesHeading
 * (which need the index to find the heading's own body) and by
 * scanMutableFacts's mirrored-section exclusion. */
function headingOccurrences(content) {
  const lines = content.split("\n");
  const occurrences = [];
  walkFenceAware(lines, (line, index, fenced) => {
    if (fenced) return;
    const m = HEADING_RE.exec(line);
    if (m) occurrences.push({ index, level: m[1].length, text: m[2].trim() });
  });
  return { lines, occurrences };
}

function headingsIn(content) {
  return headingOccurrences(content).occurrences.map(({ level, text }) => ({ level, text }));
}

/** The lines owned by heading occurrence `occIndex`: everything after its
 * heading line up to (not including) the next occurrence at the same or a
 * shallower level, or the end of the file. Fenced headings never appear in
 * `occurrences` (see headingOccurrences), so a heading pasted inside an
 * example block can never end a real section early. */
function sectionBodyLines({ lines, occurrences }, occIndex) {
  const occ = occurrences[occIndex];
  let endIdx = lines.length;
  for (let j = occIndex + 1; j < occurrences.length; j++) {
    if (occurrences[j].level <= occ.level) {
      endIdx = occurrences[j].index;
      break;
    }
  }
  return lines.slice(occ.index + 1, endIdx);
}

// The floor a heading's body must clear to count as "carries its own text"
// rather than a stub. Chosen as a small, deliberately low bar: it exists
// only to catch an effectively empty section (a heading with nothing, or
// one throwaway word, under it) -- it is not meant to, and by itself cannot,
// distinguish a real paragraph about the protocol from a long paragraph
// about something else (the lunch-menu case); that distinction is the
// decision-id-on-a-stripped-match rule below, which checks content, not
// length. Six words is enough to rule out "TBD." or a single placeholder
// sentence while never rejecting any genuine section in this repository.
const SUBSTANTIVE_WORD_FLOOR = 6;

function wordCount(text) {
  return text.split(/\s+/).map((w) => w.trim()).filter(Boolean).length;
}

function isSubstantiveBody(bodyLines) {
  return wordCount(bodyLines.join(" ")) >= SUBSTANTIVE_WORD_FLOOR;
}

/** True when `haystack` (a heading's text plus its body) contains `token`
 * (a decision id or other short literal) as a case-insensitive, dash-
 * normalized substring. */
function containsToken(haystack, token) {
  return headCase(haystack).includes(headCase(token));
}

/** Finds the first heading occurrence in `content` that carries
 * `headingText`'s own full text: an actual Markdown heading (any level)
 * matching exactly, or matching only after both sides' trailing "(...)"
 * qualifier is stripped -- in which case `decisionToken` (the row's own
 * trailing-parenthetical text, e.g. "DEC-20260320-B") must also appear in
 * the heading or its body, so a heading that merely shares its opening words
 * cannot satisfy a row on the strength of a long-but-unrelated body (round 3
 * finding 1). Either way, the body under the heading must clear
 * SUBSTANTIVE_WORD_FLOOR. Returns { matched: false } or
 * { matched: true, heading, occIndex }. */
function contentCarriesHeading(content, headingText, decisionToken) {
  const parsed = headingOccurrences(content);
  const exactForm = headCase(headingText);
  const strippedHeading = stripTrailingParenthetical(headingText);
  const strippedForm = strippedHeading ? headCase(strippedHeading) : null;
  for (let i = 0; i < parsed.occurrences.length; i++) {
    const occ = parsed.occurrences[i];
    const actualExact = headCase(occ.text);
    const actualStrippedText = stripTrailingParenthetical(occ.text);
    const actualStrippedForm = actualStrippedText ? headCase(actualStrippedText) : null;

    let kind = null;
    if (actualExact === exactForm) {
      kind = "exact";
    } else if (
      (strippedForm && (actualExact === strippedForm || actualStrippedForm === strippedForm)) ||
      (actualStrippedForm && actualStrippedForm === exactForm)
    ) {
      kind = "stripped";
    }
    if (!kind) continue;

    const body = sectionBodyLines(parsed, i);
    if (!isSubstantiveBody(body)) continue;

    if (kind === "stripped") {
      if (!decisionToken) continue;
      if (!containsToken(`${occ.text}\n${body.join("\n")}`, decisionToken)) continue;
    }

    return { matched: true, heading: occ.text, occIndex: i };
  }
  return { matched: false };
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

/** { doc: "CLAUDE.md" | "CHARTER.md", heading } for a row sourced from
 * either document, or null for a row sourced neither way (there is none
 * today, but this stays defensive). */
function rowHeadingSource(row) {
  if (!row.source) return null;
  if (row.source.startsWith(HEADING_SOURCE_PREFIX)) {
    return { doc: "CLAUDE.md", heading: row.source.slice(HEADING_SOURCE_PREFIX.length).trim() };
  }
  if (row.source.startsWith(CHARTER_SOURCE_PREFIX)) {
    return { doc: "CHARTER.md", heading: row.source.slice(CHARTER_SOURCE_PREFIX.length).trim() };
  }
  return null;
}

/** The row's CLAUDE.md heading text, or null for a row sourced elsewhere. */
function rowClaudeHeading(row) {
  const src = rowHeadingSource(row);
  return src && src.doc === "CLAUDE.md" ? src.heading : null;
}

/** True when `content` (some document's own text) carries `row`'s full
 * text under its own heading, gated on the substantive-body and decision-id
 * rules above. `opts.file` and `opts.mirroredForms` (the output of
 * verifiedMirroredHeadingForms) together enforce round 2's mirror-equality
 * rule: when `content` is CLAUDE.md's own text and the row has a CLAUDE.md-
 * sourced mirror, the matched heading's form must be one of the verified-
 * mirror forms, i.e. its body must equal the mirror file byte for byte, not
 * merely look like the right heading with a since-changed body underneath
 * (round 2 finding 3). AGENTS.md is a condensed derivative by design and is
 * never held to that equality (see verifiedMirroredHeadingForms's comment);
 * a CHARTER.md-sourced row never satisfies this at all for CLAUDE.md or
 * AGENTS.md -- it always reaches them through a named locator instead
 * (checkLocatorToken below). */
function hasOwnFullText(content, row, { file, mirroredForms } = {}) {
  const heading = rowClaudeHeading(row);
  if (!heading) return false;
  const decisionToken = trailingParentheticalText(row.name);
  const result = contentCarriesHeading(content, heading, decisionToken);
  if (!result.matched) return false;
  if (file === "CLAUDE.md" && mirroredForms) {
    const matchedForms = headingForms(result.heading);
    if (![...matchedForms].some((f) => mirroredForms.has(f))) return false;
  }
  return true;
}

/** True when CHARTER.md's own text (read fresh from `root`, cached in
 * `charterCache`) carries a CHARTER.md-sourced row's own heading, by the
 * same substantive-body / decision-id rule as hasOwnFullText -- but never
 * held to mirror-equality, since docs/company/CHARTER.md is the row's own
 * full_body, not a mirror of something else. */
function charterCarriesRow(root, row, charterCache) {
  const src = rowHeadingSource(row);
  if (!src || src.doc !== "CHARTER.md") return false;
  let content = charterCache.get(CHARTER_PATH);
  if (content === undefined) {
    const absolute = resolve(root, CHARTER_PATH);
    content = existsSync(absolute) ? normalizeEol(readFileSync(absolute, "utf8")) : null;
    charterCache.set(CHARTER_PATH, content);
  }
  if (content === null) return false;
  const decisionToken = trailingParentheticalText(row.name);
  return contentCarriesHeading(content, src.heading, decisionToken).matched;
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
 * row). Presence alone is no longer sufficient -- checkLocatorToken below
 * resolves each one before it counts. */
function locatorTokens(row) {
  const tokens = new Set([row.full_body]);
  if (row.source && row.source.startsWith(HEADING_SOURCE_PREFIX)) {
    tokens.add("CLAUDE.md");
  } else if (row.source && row.source.startsWith(CHARTER_SOURCE_PREFIX)) {
    tokens.add("CHARTER.md");
  }
  return [...tokens].filter(Boolean);
}

/** Resolves one locator token found in a name-bearing block. A path token
 * (the row's own full_body) resolves when that file exists in the
 * repository -- round 3 finding 2's "a locator pointing at a file that does
 * not exist" case; `missingFile: true` marks this specific failure so the
 * caller can raise the distinct LOCATOR_MISSING finding rather than the
 * generic PROTOCOL_UNREACHABLE, because a dangling pointer is worse than no
 * pointer at all. A "CLAUDE.md"/"CHARTER.md" word token resolves only when
 * that document actually carries the row by the own-text rule -- round 3
 * finding 2's first case, a sentence that says in plain English that
 * CLAUDE.md no longer carries the protocol, while still containing the bare
 * word "CLAUDE.md". Any other token (there is none by construction --
 * locatorTokens only ever emits the row's own full_body or its own source
 * document's name) resolves to nothing. */
function checkLocatorToken(root, token, row, contents, mirroredForms, charterCache) {
  if (token === row.full_body) {
    const exists = existsSync(resolve(root, token));
    return { resolves: exists, missingFile: !exists };
  }
  if (token === "CLAUDE.md") {
    return { resolves: hasOwnFullText(contents["CLAUDE.md"], row, { file: "CLAUDE.md", mirroredForms }), missingFile: false };
  }
  if (token === "CHARTER.md") {
    return { resolves: charterCarriesRow(root, row, charterCache), missingFile: false };
  }
  return { resolves: false, missingFile: false };
}

/** Splits Markdown content into blocks: a table row, a list item (with its
 * wrapped continuation lines), or a paragraph delimited by blank lines, are
 * each their own block. This is "the same place" a name and a locator must
 * both appear in for rule (b) -- never the whole file, and for a table,
 * never the header row on behalf of a data row two lines below it.
 *
 * A fence is excluded twice over: the fence delimiter and everything inside
 * it are dropped from every block entirely (fenced content, e.g. a manifest
 * template's example path, is never a locator a reader follows from prose),
 * AND a fence boundary always flushes whatever block came before it, so a
 * sentence naming a protocol immediately followed by a fenced snippet can
 * never absorb a path inside that fence into its own block, and prose that
 * resumes after the fence starts a new block rather than continuing the one
 * before it. Both halves are needed: dropping the content alone would still
 * let a name-bearing paragraph and a locator-bearing paragraph merge across
 * the fence if neither flushed first. Uses the same walkFenceAware primitive
 * as every other fence-aware rule in this file (round 3 finding 3), so a
 * `~~~` fence, a longer-than-three-marker fence, or a blockquoted fence is
 * excluded here exactly as it is everywhere else. */
function extractBlocks(content) {
  const blocks = [];
  let current = [];
  const flush = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };
  walkFenceAware(content.split("\n"), (line, _index, fenced) => {
    if (fenced) {
      flush();
      return;
    }
    if (/^\s*$/.test(line)) {
      flush();
      return;
    }
    const startsNewBlock =
      /^\s*\|/.test(line) || /^\s*(?:[-*]\s+|\d+\.\s+)/.test(line) || HEADING_RE.test(line);
    if (startsNewBlock) flush();
    current.push(line);
  });
  flush();
  return blocks;
}

function normalizeForMatch(text) {
  return normalizeDashes(text).toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when some single block of `content` contains both a name token and
 * a *resolved* locator token for `row` (checkLocatorToken above).
 * `missingLocator` is true when a block named the row and offered a path
 * locator whose file does not exist, even if reachability is ultimately
 * satisfied some other way -- a dangling pointer is reported regardless. */
function reachableByBlock(root, content, row, contents, mirroredForms, charterCache) {
  const names = nameTokens(row).map(normalizeForMatch).filter(Boolean);
  const locators = locatorTokens(row);
  if (names.length === 0 || locators.length === 0) return { reachable: false, missingLocator: false };
  let missingLocator = false;
  for (const block of extractBlocks(content)) {
    const normalized = normalizeForMatch(block);
    const hasName = names.some((t) => normalized.includes(t));
    if (!hasName) continue;
    for (const token of locators) {
      const normalizedToken = normalizeForMatch(token);
      if (!normalizedToken || !normalized.includes(normalizedToken)) continue;
      const { resolves, missingFile } = checkLocatorToken(root, token, row, contents, mirroredForms, charterCache);
      if (missingFile) missingLocator = true;
      if (resolves) return { reachable: true, missingLocator };
    }
  }
  return { reachable: false, missingLocator };
}

export function checkProtocolReachability(root, contents) {
  const findings = [];
  const { findings: schemaFindings, manifest, valid } = checkSchema(root);
  if (!valid) {
    return schemaFindings.map((f) => finding(f.code, f.file, f.detail));
  }
  const mirroredForms = verifiedMirroredHeadingForms(root);
  const charterCache = new Map();
  for (const row of manifest.protocols) {
    for (const [file, content] of Object.entries(contents)) {
      const own = hasOwnFullText(content, row, { file, mirroredForms });
      const { reachable: byBlock, missingLocator } = reachableByBlock(
        root,
        content,
        row,
        contents,
        mirroredForms,
        charterCache,
      );
      if (missingLocator) {
        findings.push(
          finding(
            "LOCATOR_MISSING",
            file,
            `row "${row.id}" (${row.name}) names a locator path that does not exist in the repository`,
          ),
        );
      }
      const reachable = own || byBlock;
      if (!reachable && !missingLocator) {
        findings.push(
          finding(
            "PROTOCOL_UNREACHABLE",
            file,
            `row "${row.id}" (${row.name}) has no heading of its own in ${file}, and no single block (table row, list item, or paragraph) in ${file} both names it and gives a locator that resolves (its full body path, or the document that carries it)`,
          ),
        );
      }
    }
  }
  return findings;
}

// ── (c) mutable facts ───────────────────────────────────────────────────

const MONEY_RE =
  /(?<sym>[€$])\s?(?<symAmt>\d[\d.,]*)|(?<wordAmt>\d[\d.,]*)\s*(?:cents|EUR|USD|SEK|NOK|DKK|GBP|CHF|PLN|euros?|dollars?)\b/gi;

// A number written in digits ("290", "300+") or spelled out in English
// words ("seven", "two hundred and ninety"), adjacent to a countable noun --
// either one of five domain nouns this repo has drifted on before (kept for
// the singular "capability" form, which the generic plural heuristic below
// would miss), or, more generally, any other word that looks like a plural
// noun (ends in "s") and is not one of the common non-noun words that also
// end in "s" (COUNT_NOUN_STOPWORDS). Both a count-then-noun and a
// noun-then-count order are recognised (round 3 finding 4's split-table-cell
// case reads as either order once "|" becomes a plain space -- see
// normalizeLineForScan below -- so the adjacency check itself must accept
// both, rather than special-casing table cells the way round 2 did).
const NUMBER_WORD =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";
const NUMBER_PHRASE = `${NUMBER_WORD}(?:[\\s-]+(?:and[\\s-]+)?${NUMBER_WORD})*`;
const COUNT_QUANTITY = `(?:\\d+\\+?|${NUMBER_PHRASE})`;
const NAMED_COUNT_NOUNS = "(?:capabilit(?:y|ies)|solutions?|verticals?|categories|countries)";
const NAMED_COUNT_FORWARD_RE = new RegExp(`\\b${COUNT_QUANTITY}\\s+${NAMED_COUNT_NOUNS}\\b`, "gi");
// Backward order (noun before count -- "Verticals: seven" split across a
// table cell, round 3 finding 4) is only applied to this fixed, curated noun
// list, never to the generic "any plural-looking word" heuristic below: a
// generic backward scan (a common word ending in "s" immediately followed by
// a bare number word like "one") reads too many ordinary sentences as counts
// -- "the check prints one fix per finding" is real CLAUDE.md prose, not a
// count, and "prints" only looks like a countable noun in the generic
// backward direction. The five named nouns are specific enough that this
// false-positive shape doesn't occur among them.
const NAMED_COUNT_BACKWARD_RE = new RegExp(`\\b${NAMED_COUNT_NOUNS}\\s+${COUNT_QUANTITY}\\b`, "gi");
const GENERIC_COUNT_FORWARD_RE = new RegExp(`\\b${COUNT_QUANTITY}\\s+([A-Za-z][A-Za-z-]*s)\\b`, "gi");
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
// "as of <date>" in any of the three date shapes, including the quarter form.
const AS_OF_RE = new RegExp(`\\bas of ${DATE_VALUE_RE}\\b`, "gi");
// The other ordinary ways a dated status is written in this repo's prose,
// beyond "(Month YYYY)" and "as of <date>": "Last verified: <date>",
// "Updated <date>", "valid through <date>", "refreshed <date>", "reviewed
// <date>" and "current through <date>" (round 3 finding 4 adds the last
// four). All six are staleness claims about the current state of a section,
// exactly the shape rule (c) exists to catch.
const LAST_VERIFIED_RE = new RegExp(`\\bLast verified:?\\s+${DATE_VALUE_RE}\\b`, "gi");
const UPDATED_STATUS_RE = new RegExp(`\\bUpdated\\s+(?:on\\s+)?${DATE_VALUE_RE}\\b`, "gi");
const VALID_THROUGH_RE = new RegExp(`\\bvalid through ${DATE_VALUE_RE}\\b`, "gi");
const CURRENT_THROUGH_RE = new RegExp(`\\bcurrent through ${DATE_VALUE_RE}\\b`, "gi");
const REFRESHED_RE = new RegExp(`\\brefreshed\\s+(?:on\\s+)?${DATE_VALUE_RE}\\b`, "gi");
const REVIEWED_RE = new RegExp(`\\breviewed\\s+(?:on\\s+)?${DATE_VALUE_RE}\\b`, "gi");
const DEC_ID_RE = /\bDEC-\d{8}(?:-[A-Za-z0-9]+)*\b/g;
// A decision id counts as followed by a summary when the text right after it
// starts with a separator (colon, semicolon, or any dash) and then at least
// three more words, or starts with **any** word that is not a common
// non-verb function word ("and", "for", "which", ...) and then at least
// three more words -- round 3 finding 6 widens this from a fixed verb list
// ("is"/"was"/"reads"/...) to "any verb", implemented the same way the
// count-noun scan already treats "any plural noun": permissive by default,
// narrowed only by a curated stopword list of words that are clearly not the
// start of a summary.
const SUMMARY_SEPARATOR_RE = /^\s*[:;\-–—]+\s*(?:\S+\s+){2,}\S+/;
const SUMMARY_FIRST_WORD_RE = /^\s*([A-Za-z]+)\s+(?:\S+\s+){2,}\S+/;
const DECISION_SUMMARY_STOPWORDS = new Set([
  "and",
  "or",
  "but",
  "the",
  "a",
  "an",
  "for",
  "of",
  "in",
  "on",
  "to",
  "with",
  "this",
  "that",
  "these",
  "those",
  "its",
  "their",
  "which",
  "who",
  "when",
  "if",
  "as",
  "at",
  "by",
  "from",
]);

function summaryFollows(rest) {
  if (SUMMARY_SEPARATOR_RE.test(rest)) return true;
  const m = SUMMARY_FIRST_WORD_RE.exec(rest);
  if (!m) return false;
  return !DECISION_SUMMARY_STOPWORDS.has(m[1].toLowerCase());
}

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

function findCounts(line) {
  const hits = [];
  for (const m of line.matchAll(NAMED_COUNT_FORWARD_RE)) hits.push({ category: "COUNT", snippet: m[0] });
  for (const m of line.matchAll(NAMED_COUNT_BACKWARD_RE)) hits.push({ category: "COUNT", snippet: m[0] });
  for (const m of line.matchAll(GENERIC_COUNT_FORWARD_RE)) {
    const noun = m[1].toLowerCase();
    if (!noun.endsWith("s") || COUNT_NOUN_STOPWORDS.has(noun)) continue;
    hits.push({ category: "COUNT", snippet: m[0] });
  }
  return hits;
}

function findDates(line) {
  const hits = [];
  for (const re of [
    DATED_PARENTHETICAL_RE,
    AS_OF_RE,
    LAST_VERIFIED_RE,
    UPDATED_STATUS_RE,
    VALID_THROUGH_RE,
    CURRENT_THROUGH_RE,
    REFRESHED_RE,
    REVIEWED_RE,
  ]) {
    for (const m of line.matchAll(re)) hits.push({ category: "DATE", snippet: m[0] });
  }
  return hits;
}

function findDecisionSummaries(line) {
  const hits = [];
  for (const match of line.matchAll(DEC_ID_RE)) {
    const rest = line.slice(match.index + match[0].length);
    if (summaryFollows(rest)) {
      hits.push({ category: "DECISION_SUMMARY", snippet: line.trim() });
    }
  }
  return hits;
}

// Markdown syntax that hides adjacency from a reader's eye but not from a
// reader's understanding: a figure inside a link's visible text, inside
// bold/italic emphasis, or split across a table row's cells, all read to a
// human as ordinary adjacent words (round 3 findings 4-6). Rather than one
// more regex per shape, every line is normalized to what a reader actually
// sees before any pattern runs: link/image markup collapses to its visible
// text, emphasis markers disappear, and "|" cell separators become plain
// spaces. Applied once, ahead of findMoney/findCounts/findDates/
// findDecisionSummaries, so none of them need shape-specific handling.
function normalizeLineForScan(line) {
  let s = line;
  // "![alt](url)" -> "alt" (image first, so its "!" never confuses the link
  // pattern that follows).
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // "[text](url)" -> "text".
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // "**bold**" / "__bold__" -> "bold" (before the single-marker pass below,
  // so a bold span's own asterisks are never mistaken for italics).
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  // "*italic*" / "_italic_" -> "italic".
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  // Table cell separators -> spaces, so "| Verticals | seven |" reads as
  // "Verticals seven" the way a reader sees the rendered row.
  s = s.replace(/\|/g, " ");
  return s;
}

/** The normalized heading forms of every docs/project/protocol-coverage.yaml
 * row whose CLAUDE.md section is *verified* -- not merely named -- to be the
 * mirrored protocol body: CLAUDE.md's own section for the row's heading,
 * re-extracted fresh with the identical algorithm protocols:check uses
 * (extractClaudeSectionText), compares line-for-line equal to the row's
 * full_body mirror under docs/governance/protocols/ (readMirrorBody, the
 * same BEGIN/END slice protocols:check compares CLAUDE.md against). A
 * heading match alone is never enough -- a section whose heading matches a
 * row but whose body does not match the mirror is scanned like any other
 * prose, because it fails the equality check and its form is never added
 * here. Reused unchanged by hasOwnFullText/checkLocatorToken for rule (b)'s
 * own mirror-equality requirement (round 3 finding 2), the same way round
 * 2's mutable-fact scan already reused it, rather than a second
 * implementation.
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
 * validation; checkProtocolReachability and checkMutableFacts each report
 * that failure on their own path. */
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
  let excluded = false;
  let excludedLevel = 0;
  const lines = content.split("\n");
  walkFenceAware(lines, (line, i, fenced) => {
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch && !fenced) {
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
    if (fenced || excluded) return;
    const normalized = normalizeLineForScan(line);
    for (const hit of [
      ...findMoney(normalized),
      ...findCounts(normalized),
      ...findDates(normalized),
      ...findDecisionSummaries(normalized),
    ]) {
      hits.push({ ...hit, line: i + 1 });
    }
  });
  return hits;
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
