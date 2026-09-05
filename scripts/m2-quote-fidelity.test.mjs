import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkSpanAgainstSources,
  extractQuoteSpans,
  longestMatchingPrefix,
  matchSegmentsInOrder,
  normalize,
  parseNotionExport,
  rowText,
  runFidelityCheck,
} from "./m2-quote-fidelity.mjs";
import { parseDecisionRecord } from "./decision-records-lib.mjs";

const BANNER =
  "> [!CAUTION]\n" +
  "> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**\n" +
  "> Placeholder banner.";

function record({ id, evidence = [], body }) {
  const evidenceYaml =
    evidence.length === 0 ? " []" : `\n${evidence.map((entry) => `  - ${entry}`).join("\n")}`;
  const content = `---\nrecord_key: ${id}\nid: ${id}\ntitle: "Test ${id}"\nstatus: active\ntopic: test-topic\nscope: global\nowner: petter\ndecided_at: 2026-08-22\nrelations: []\nevidence:${evidenceYaml}\nmigration_status: candidate\nauthority_scope: none\nauthority_active: false\nphase: M2\n---\n\n${BANNER}\n\n## Decision\n\n${body}\n\n## Context\n\nContext.\n\n## Rationale\n\nRationale.\n\n## Consequences\n\nConsequences.\n\n## Reversal conditions\n\nReversal conditions.\n`;
  return parseDecisionRecord(`docs/decisions/records/${id}.md`, content);
}

function makeExport(rows) {
  const inner = JSON.stringify({ results: rows });
  const literal = JSON.stringify(inner);
  return `preamble noise\n"text": ${literal}\nmore noise`;
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "m2-quote-fidelity-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Normalization equivalences
// ---------------------------------------------------------------------------

test("a faithful quote passes", () => {
  const span = { segments: ["the platform charges a flat annual fee for every customer account"] };
  const source = normalize(
    "Our pricing model: the platform charges a flat annual fee for every customer account, billed monthly."
  );
  assert.equal(matchSegmentsInOrder(span.segments.map(normalize), source), true);
});

test("an em-dash replaced by a comma still passes", () => {
  const quoted = "great feature, worth the price for every team that ships fast";
  const source = normalize("This is a great feature — worth the price for every team that ships fast.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), true);
});

test("4x written as 4× still passes", () => {
  const quoted = "revenue grew 4x in the first quarter of full operation";
  const source = normalize("Revenue grew 4× in the first quarter of full operation, a record.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), true);
});

test("EUR 50 written as €50 still passes", () => {
  const quoted = "the invoice extraction price is EUR 50 per successful call today";
  const source = normalize("The invoice extraction price is €50 per successful call today, unchanged.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), true);
});

test("curly quotes still pass", () => {
  const quoted = "it's the platform's only revenue stream for the whole quarter";
  const source = normalize("It’s the platform’s only revenue stream for the whole quarter, confirmed.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), true);
});

test("different case still passes", () => {
  const quoted = "the readiness program adopted library as product x402 rail";
  const source = normalize("THE READINESS PROGRAM ADOPTED LIBRARY-AS-PRODUCT, X402 RAIL, per the founder.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), true);
});

test("markdown bold in the source still passes", () => {
  const quoted = "the marketplace is the primary product and long term moat here";
  const source = normalize("**the marketplace is the primary product** and long-term moat here, always.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), true);
});

test("a period at a truncation point still passes", () => {
  const quoted = "is retired as primary product.";
  const source = normalize("The Counterparty Assurance framing is retired as primary product, per the memo.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), true);
});

// ---------------------------------------------------------------------------
// Genuine mismatches
// ---------------------------------------------------------------------------

test("an inserted word fails", () => {
  const quoted = "the platform charges a flat monthly annual fee for every account";
  const source = normalize("The platform charges a flat annual fee for every account.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), false);
});

test("a dropped word fails", () => {
  const quoted = "the platform charges a fee for every customer account nationwide";
  const source = normalize("The platform charges a flat annual fee for every customer account.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), false);
});

test("a swapped word fails", () => {
  const quoted = "the platform charges a flat quarterly fee for every customer account";
  const source = normalize("The platform charges a flat annual fee for every customer account.");
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), false);
});

test("a composite of two separate source fragments fails", () => {
  const quoted = "the platform charges a flat annual fee for every customer nationwide today";
  const source = normalize(
    "The platform charges a flat annual fee for every customer. Separately, we operate nationwide today in six regions."
  );
  assert.equal(matchSegmentsInOrder([normalize(quoted)], source), false);
});

test("a ... quote whose segments are out of order fails", () => {
  const segments = ["jumps over the lazy dog end here", "the quick brown fox leaps first"];
  const source = normalize(
    "The quick brown fox leaps first across the yard, then eventually jumps over the lazy dog end here."
  );
  assert.equal(matchSegmentsInOrder(segments.map(normalize), source), false);
});

test("a ... quote whose segments are in order passes (control for the above)", () => {
  const segments = ["the quick brown fox leaps first", "jumps over the lazy dog end here"];
  const source = normalize(
    "The quick brown fox leaps first across the yard, then eventually jumps over the lazy dog end here."
  );
  assert.equal(matchSegmentsInOrder(segments.map(normalize), source), true);
});

// ---------------------------------------------------------------------------
// Extraction: code exclusion and the min-chars floor
// ---------------------------------------------------------------------------

test("a span inside a fenced code block is ignored", () => {
  const body =
    'Some prose here.\n\n```\nconst x = "this is a long enough fenced quote to pass the floor";\n```\n\nMore prose.';
  const spans = extractQuoteSpans(body, 10);
  assert.equal(spans.length, 0);
});

test("a span inside inline code is ignored", () => {
  const body =
    'Some prose text before it. `"this is a long enough inline quote to pass the floor"` after it.';
  const spans = extractQuoteSpans(body, 10);
  assert.equal(spans.length, 0);
});

test("a legitimate quote that mentions a backticked identifier is NOT ignored", () => {
  const body =
    'The row states: "the filter `isSQSUnqualified` has had no callers since the audit" per the memo.';
  const spans = extractQuoteSpans(body, 10);
  assert.equal(spans.length, 1);
  assert.match(spans[0].raw, /isSQSUnqualified/);
});

test("a span below --min-chars is ignored", () => {
  const body = 'The row says "too short" and nothing else of length.';
  const spans = extractQuoteSpans(body, 25);
  assert.equal(spans.length, 0);
});

test("a span at or above --min-chars is kept", () => {
  const body = 'The row says "this quote is definitely long enough to keep" and nothing else.';
  const spans = extractQuoteSpans(body, 25);
  assert.equal(spans.length, 1);
});

// ---------------------------------------------------------------------------
// Source discovery, end to end via checkRecord / runFidelityCheck
// ---------------------------------------------------------------------------

test("a quote present only in another record is found through that source", () => {
  withTempDir((root) => {
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    const other = record({
      id: "DEC-OTHER-A",
      body: "The other record states the annual retention window is ninety days for every capability by default.",
    });
    const target = record({
      id: "DEC-TARGET-A",
      body: 'The row quotes it: "the annual retention window is ninety days for every capability by default" per the other record.',
    });
    writeFileSync(join(recordsDir, "DEC-OTHER-A.md"), other.content);
    writeFileSync(join(recordsDir, "DEC-TARGET-A.md"), target.content);
    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: null,
      frontend: null,
      only: ["DEC-TARGET-A.md"],
      minChars: 25,
    });
    assert.equal(report.totals.spans, 1);
    assert.equal(report.totals.faithful, 1);
  });
});

test("a quote present only in CLAUDE.md is found through that source", () => {
  withTempDir((root) => {
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    writeFileSync(
      join(root, "CLAUDE.md"),
      "The operating charter states the tier of risk stays the same while the width of delegated action expands."
    );
    const target = record({
      id: "DEC-TARGET-B",
      body: 'The charter says: "the tier of risk stays the same while the width of delegated action expands" verbatim.',
    });
    writeFileSync(join(recordsDir, "DEC-TARGET-B.md"), target.content);
    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: null,
      frontend: null,
      only: ["DEC-TARGET-B.md"],
      minChars: 25,
    });
    assert.equal(report.totals.spans, 1);
    assert.equal(report.totals.faithful, 1);
  });
});

test("a quote present only in a backticked same-paragraph file is found through that source", () => {
  withTempDir((root) => {
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    mkdirSync(join(root, "docs/company"), { recursive: true });
    writeFileSync(
      join(root, "docs/company/GOALS.md"),
      "Our stated mission is to become the data layer for AI agents across every regulated vertical we reach."
    );
    const target = record({
      id: "DEC-TARGET-C",
      body:
        'See `docs/company/GOALS.md` for the exact wording: "become the data layer for AI agents across every regulated vertical we reach" is the mission statement.',
    });
    writeFileSync(join(recordsDir, "DEC-TARGET-C.md"), target.content);
    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: null,
      frontend: null,
      only: ["DEC-TARGET-C.md"],
      minChars: 25,
    });
    assert.equal(report.totals.spans, 1);
    assert.equal(report.totals.faithful, 1);
  });
});

test("a quote present only in a Notion row field is found through that source", () => {
  withTempDir((root) => {
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    const pageId = "1111222233334444555566667777888a";
    const exportPath = join(root, "export.txt");
    writeFileSync(
      exportPath,
      makeExport([
        {
          id: pageId,
          url: `https://app.notion.com/${pageId}`,
          "userDefined:ID": "DEC-ROW-TEST",
          "Related Feature": null,
          Decision: "The row states the founder alone approves any spend beyond the weekly envelope amount.",
        },
      ])
    );
    const target = record({
      id: "DEC-TARGET-D",
      evidence: [`https://app.notion.com/${pageId}`],
      body: 'The row itself says: "the founder alone approves any spend beyond the weekly envelope amount" without exception.',
    });
    writeFileSync(join(recordsDir, "DEC-TARGET-D.md"), target.content);
    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: exportPath,
      frontend: null,
      only: ["DEC-TARGET-D.md"],
      minChars: 25,
    });
    assert.equal(report.totals.spans, 1);
    assert.equal(report.totals.faithful, 1);
  });
});

test("parseNotionExport keeps nulls as null and never regex-slices a field", () => {
  const pageId = "aaaa2222333344445555666677778888";
  const raw = makeExport([
    {
      id: pageId,
      url: `https://app.notion.com/${pageId}`,
      "userDefined:ID": "DEC-NULL-TEST",
      "Related Feature": null,
      "Superseded By": null,
      Decision: 'A decision containing an embedded "text": "fake nested field" that must not confuse the parser.',
    },
  ]);
  const rows = parseNotionExport(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Related Feature"], null);
  assert.equal(rows[0]["Superseded By"], null);
  assert.match(rowText(rows[0]), /embedded/);
});

test("--strict exits 1 on a residual and 0 without", () => {
  withTempDir((root) => {
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    const residual = record({
      id: "DEC-STRICT-A",
      body: '"this quote appears nowhere else in any candidate source at all here" says the row.',
    });
    const faithful = record({
      id: "DEC-STRICT-B",
      body: 'The other record states the exact same sentence used below for the strict-mode control case.',
    });
    const quoting = record({
      id: "DEC-STRICT-C",
      body: '"the other record states the exact same sentence used below for the strict mode control case"',
    });
    writeFileSync(join(recordsDir, "DEC-STRICT-A.md"), residual.content);
    writeFileSync(join(recordsDir, "DEC-STRICT-B.md"), faithful.content);
    writeFileSync(join(recordsDir, "DEC-STRICT-C.md"), quoting.content);

    const scriptPath = join(process.cwd(), "scripts", "m2-quote-fidelity.mjs");

    let strictExitCode = 0;
    try {
      execFileSync(process.execPath, [scriptPath, "--root", root, "--only", "DEC-STRICT-A.md", "--strict"], {
        encoding: "utf8",
      });
    } catch (error) {
      strictExitCode = error.status;
    }
    assert.equal(strictExitCode, 1);

    let cleanExitCode = 0;
    try {
      execFileSync(process.execPath, [scriptPath, "--root", root, "--only", "DEC-STRICT-C.md", "--strict"], {
        encoding: "utf8",
      });
    } catch (error) {
      cleanExitCode = error.status;
    }
    assert.equal(cleanExitCode, 0);

    let nonStrictExitCode = 0;
    try {
      execFileSync(process.execPath, [scriptPath, "--root", root, "--only", "DEC-STRICT-A.md"], {
        encoding: "utf8",
      });
    } catch (error) {
      nonStrictExitCode = error.status;
    }
    assert.equal(nonStrictExitCode, 0);
  });
});

// ---------------------------------------------------------------------------
// Best-partial-match hint
// ---------------------------------------------------------------------------

test("longestMatchingPrefix finds the best starting offset in a source", () => {
  const span = normalize("the quick brown fox jumps over the lazy dog");
  const source = normalize("once upon a time the quick brown fox jumped away instead");
  const prefixLength = longestMatchingPrefix(span, source);
  assert.equal(span.slice(0, prefixLength), normalize("the quick brown fox jump"));
});

test("checkSpanAgainstSources reports the best match label and prefix length", () => {
  const span = { segments: ["the annual retention window is ninety days for every account"] };
  const sources = new Map([
    ["far-source", normalize("nothing relevant is written here at all")],
    ["near-source", normalize("the annual retention window is ninety days for staff only")],
  ]);
  const outcome = checkSpanAgainstSources(span, sources);
  assert.equal(outcome.faithful, false);
  assert.equal(outcome.bestMatch.label, "near-source");
  assert.ok(outcome.bestMatch.prefixLength > 0);
});

// ---------------------------------------------------------------------------
// Deliberate-break proof (documented in the PR body): breaking the
// normalizer or the in-order matcher must flip these assertions.
// ---------------------------------------------------------------------------

test("normalize() strips punctuation, case, and the declared symbol set identically both ways", () => {
  assert.equal(normalize("€50 vs EUR 50"), normalize("EUR50 vs EUR 50"));
  assert.equal(normalize("A ≥ B"), normalize("a >= b"));
  assert.equal(normalize("go → there"), normalize("go -> there"));
  assert.equal(normalize("a … b"), normalize("a ... b"));
});

// ---------------------------------------------------------------------------
// Reported line numbers are file-relative (the front-matter offset must be
// added back in, not dropped).
// ---------------------------------------------------------------------------

test("a residual's reported line number is the file line, not the body-relative line", () => {
  withTempDir((root) => {
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    const quote = "this exact quote appears nowhere else in any candidate source for this check";
    const target = record({
      id: "DEC-LINE-A",
      body: `Some lead-in text before the quote.\n\n"${quote}" trailing text after it.`,
    });
    writeFileSync(join(recordsDir, "DEC-LINE-A.md"), target.content);
    const quoteOffset = target.content.indexOf(quote);
    const expectedFileLine = target.content.slice(0, quoteOffset).split("\n").length;
    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: null,
      frontend: null,
      only: ["DEC-LINE-A.md"],
      minChars: 25,
    });
    assert.equal(report.totals.residual, 1);
    assert.equal(report.perRecord[0].residual[0].line, expectedFileLine);
    // A body-relative count would under-report by exactly the front-matter's
    // line span; confirm the two are not equal (guards a silent revert).
    assert.notEqual(report.perRecord[0].residual[0].line, quote.split("\n").length);
  });
});

// ---------------------------------------------------------------------------
// New source class: commit messages (finding 1). A sha or full GitHub
// commit URL mentioned near a quote makes that commit's own message a
// candidate source.
// ---------------------------------------------------------------------------

test("a quote present only in a referenced commit's message is found through that source", () => {
  withTempDir((root) => {
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
    execFileSync("git", ["-C", root, "config", "user.name", "Test Author"]);
    writeFileSync(join(root, "seed.txt"), "seed content");
    execFileSync("git", ["-C", root, "add", "seed.txt"]);
    const commitMessageText =
      "the wallet debit path now locks the row before checking the spend cap for every request";
    execFileSync("git", ["-C", root, "commit", "-q", "-m", commitMessageText]);
    const sha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    const target = record({
      id: "DEC-COMMIT-A",
      body: `The commit ${sha} states: "${commitMessageText}" verbatim, per its own message.`,
    });
    writeFileSync(join(recordsDir, "DEC-COMMIT-A.md"), target.content);

    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: null,
      frontend: null,
      only: ["DEC-COMMIT-A.md"],
      minChars: 25,
    });
    assert.equal(report.totals.spans, 1);
    assert.equal(report.totals.faithful, 1);
  });
});

test("a quote matching a commit message is NOT found when the sha does not exist in the repo", () => {
  withTempDir((root) => {
    execFileSync("git", ["init", "-q", root]);
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    const target = record({
      id: "DEC-COMMIT-B",
      body:
        'The commit deadbeefdeadbeefdeadbeefdeadbeefdeadbeef states: ' +
        '"this text does not exist in any commit that is actually reachable here" per its message.',
    });
    writeFileSync(join(recordsDir, "DEC-COMMIT-B.md"), target.content);
    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: null,
      frontend: null,
      only: ["DEC-COMMIT-B.md"],
      minChars: 25,
    });
    assert.equal(report.totals.residual, 1);
  });
});

// ---------------------------------------------------------------------------
// New source class: another record's own Notion row (finding 2). Explicitly
// naming another record's key makes THAT record's own row fields a
// candidate source, distinct from that record's markdown body.
// ---------------------------------------------------------------------------

test("a quote present only in another record's own Notion row (not its markdown body) is found by naming that record", () => {
  withTempDir((root) => {
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    const otherPageId = "2222333344445555666677778888999a";
    const exportPath = join(root, "export.txt");
    writeFileSync(
      exportPath,
      makeExport([
        {
          id: otherPageId,
          url: `https://app.notion.com/${otherPageId}`,
          "userDefined:ID": "DEC-OTHER-ROW",
          Rationale: "the founder chose a slower rollout to avoid a repeat of the march incident",
        },
      ])
    );
    const other = record({
      id: "DEC-OTHER-ROW",
      evidence: [`https://app.notion.com/${otherPageId}`],
      body: "This record's own markdown body never repeats the row's Rationale text at all.",
    });
    const target = record({
      id: "DEC-TARGET-CROSSROW",
      body:
        "As DEC-OTHER-ROW's own row states: " +
        '"the founder chose a slower rollout to avoid a repeat of the march incident" per that row.',
    });
    writeFileSync(join(recordsDir, "DEC-OTHER-ROW.md"), other.content);
    writeFileSync(join(recordsDir, "DEC-TARGET-CROSSROW.md"), target.content);
    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: exportPath,
      frontend: null,
      only: ["DEC-TARGET-CROSSROW.md"],
      minChars: 25,
    });
    assert.equal(report.totals.spans, 1);
    assert.equal(report.totals.faithful, 1);
  });
});

// ---------------------------------------------------------------------------
// Coverage gap (finding 4): a source resolver that returned every row in
// the export, instead of only the rows a record actually resolves to,
// would make this quote wrongly pass. It must be reported as a residual.
// ---------------------------------------------------------------------------

test("a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful", () => {
  withTempDir((root) => {
    const recordsDir = join(root, "docs/decisions/records");
    mkdirSync(recordsDir, { recursive: true });
    const relatedPageId = "1111222233334444555566667777888a";
    const unrelatedPageId = "9999888877776666555544443333222b";
    const exportPath = join(root, "export.txt");
    writeFileSync(
      exportPath,
      makeExport([
        {
          id: relatedPageId,
          url: `https://app.notion.com/${relatedPageId}`,
          "userDefined:ID": "DEC-RELATED",
          Decision: "Nothing quoted from this row appears anywhere in the target record.",
        },
        {
          id: unrelatedPageId,
          url: `https://app.notion.com/${unrelatedPageId}`,
          "userDefined:ID": "DEC-UNRELATED",
          Decision: "the annual retention window is ninety days for every capability under unrelated policy",
        },
      ])
    );
    const target = record({
      id: "DEC-TARGET-UNRELATED",
      evidence: [`https://app.notion.com/${relatedPageId}`],
      body:
        'The row quotes it: "the annual retention window is ninety days for every capability under unrelated policy" per the row.',
    });
    writeFileSync(join(recordsDir, "DEC-TARGET-UNRELATED.md"), target.content);
    const report = runFidelityCheck({
      root,
      records: "docs/decisions/records",
      export: exportPath,
      frontend: null,
      only: ["DEC-TARGET-UNRELATED.md"],
      minChars: 25,
    });
    assert.equal(report.totals.spans, 1);
    assert.equal(report.totals.faithful, 0);
    assert.equal(report.totals.residual, 1);
  });
});
