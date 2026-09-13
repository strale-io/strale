// Tests for the entrypoint parity check (M4 batch 3,
// scripts/entrypoint-parity-lib.mjs, scripts/check-entrypoint-parity.mjs).
// One planted-failure fixture per rule (break it, see the finding fire,
// restore, see it clear), plus a real-repo test that CLAUDE.md and
// AGENTS.md pass today with no findings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import {
  checkEntrypointParity,
  checkBootstrapPointers,
  checkProtocolReachability,
  checkMutableFacts,
  checkInactiveDocumentReferences,
  extractFactScanUnits,
  repoRootFrom,
  BOOTSTRAP_TOKENS,
} from "./entrypoint-parity-lib.mjs";
import { SCHEMA_PATH, MANIFEST_PATH } from "./protocol-coverage-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);
const REAL_SCHEMA = readFileSync(resolve(realRoot, SCHEMA_PATH), "utf8");

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(dir, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function makeFixture() {
  return mkdtempSync(join(tmpdir(), "entrypoint-parity-"));
}

const BOOTSTRAP_LINE = `Project map: \`${BOOTSTRAP_TOKENS[0]}\`. Protocol index: \`${BOOTSTRAP_TOKENS[1]}\`.\n\n`;

function manifestRow(overrides = {}) {
  return {
    id: "example-protocol",
    name: "Example Protocol (DEC-TEST)",
    trigger: "A test fixture exercises this protocol.",
    full_body: "docs/governance/protocols/EXAMPLE_PROTOCOL.md",
    source: "CLAUDE.md heading: Example Protocol (DEC-TEST)",
    decision: "none",
    decision_reason: "Fixture row; not tied to a numbered decision id.",
    decision_record: null,
    decision_record_note: "Recorded only in the fixture.",
    enforced_by: ["docs/governance/protocols/EXAMPLE_PROTOCOL.md"],
    ...overrides,
  };
}

function manifestYaml(rows) {
  return stringifyYaml({
    schema_version: 1,
    authority_active: false,
    verified_at: "2026-09-11",
    protocols: rows,
    excluded_sections: [],
  });
}

const CLAUDE_HEADING_PREFIX = "CLAUDE.md heading: ";

/** A docs/governance/protocols/-shaped mirror file: front matter plus a
 * BEGIN/END-delimited body, the same shape readMirrorBody reads. `body` is
 * the exact section text (heading line included) the mirror is supposed to
 * carry -- callers keep this in sync with CLAUDE.md's own section for the
 * fixture's row so the mirror-verification rule (finding 3) recognises the
 * section as genuine and cleanFixture stays clean by construction. */
function mirrorMarkdown(heading, body) {
  return (
    `---\nstatus: candidate\nauthority_active: false\nsource: CLAUDE.md\n` +
    `source_heading: "${heading}"\n---\n\n<!-- BEGIN VERBATIM FROM CLAUDE.md -->\n${body}\n<!-- END VERBATIM FROM CLAUDE.md -->\n`
  );
}

/** A minimal, otherwise-clean fixture: both entrypoints carry the bootstrap
 * pointer and the given manifest row's heading, named alongside a locator
 * ("CLAUDE.md"), so it satisfies rule (b) without relying on an own-text
 * heading match. The manifest and schema are written so checkSchema(root)
 * succeeds. When the row is CLAUDE.md-sourced, its full_body path also gets
 * a mirror file whose BEGIN/END body matches CLAUDE.md's own section
 * exactly, byte for byte -- the same invariant the real
 * docs/governance/protocols/*.md mirrors hold for CLAUDE.md's real
 * sections, and the one the mutable-fact scan's mirror-verification rule
 * (finding 3) now checks rather than trusting the heading alone. Callers
 * mutate one file's content (or the manifest) to plant exactly the failure
 * their test proves; a test that changes the row's own CLAUDE.md section
 * text must update the mirror file to match, or the mirror-verification
 * rule will (correctly) stop treating the section as a real mirror. */
// Six or more words: clears SUBSTANTIVE_WORD_FLOOR (entrypoint-parity-lib.mjs)
// so every clean fixture passes the body-floor half of rule (b) by default;
// tests that plant a too-short body do so explicitly.
const FIXTURE_BODY = "Fixture protocol body text for the check.";

function cleanFixture({ rows = [manifestRow()], claudeExtra = "", agentsExtra = "" } = {}) {
  const dir = makeFixture();
  const isClaudeSourced = rows[0].source.startsWith(CLAUDE_HEADING_PREFIX);
  const heading = isClaudeSourced ? rows[0].source.slice(CLAUDE_HEADING_PREFIX.length) : rows[0].source;
  const activeStub = "---\nstatus: active\nauthority_active: true\n---\n\nFixture stub.\n";
  const files = {
    "CLAUDE.md": `${BOOTSTRAP_LINE}### ${heading}\n\n${FIXTURE_BODY}\n\n${claudeExtra}`,
    "AGENTS.md": `${BOOTSTRAP_LINE}## Mandatory Protocols\n\n"${heading}" -- see CLAUDE.md.\n\n${agentsExtra}`,
    [SCHEMA_PATH]: REAL_SCHEMA,
    [MANIFEST_PATH]: manifestYaml(rows),
    // Both bootstrap tokens are also docs/project/ paths the batch-1d guard
    // (rule d) scans for; give it an active stub so rule (a)'s fixture
    // doesn't trip rule (d) as a side effect.
    "docs/project/START-HERE.md": activeStub,
    "docs/project/PROTOCOL-ROUTER.md": activeStub,
  };
  if (isClaudeSourced && rows[0].full_body) {
    files[rows[0].full_body] = mirrorMarkdown(heading, `### ${heading}\n\n${FIXTURE_BODY}`);
  }
  // A CHARTER.md-sourced row's full_body is docs/company/CHARTER.md itself
  // (not a mirror under docs/governance/protocols/): give it a stub file so
  // the row's own path-locator token resolves (checkLocatorToken's
  // existsSync check), the same way a real repo always has that file.
  if (!isClaudeSourced && rows[0].full_body === "docs/company/CHARTER.md") {
    files["docs/company/CHARTER.md"] = `# Charter fixture\n\n### ${heading}\n\n${FIXTURE_BODY}\n`;
  }
  writeFiles(dir, files);
  return dir;
}

function readBoth(dir) {
  return {
    "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8"),
    "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8"),
  };
}

// ── clean fixture: proves the harness itself is not the source of a finding ──

test("clean fixture: no findings", () => {
  const dir = cleanFixture();
  try {
    const result = checkEntrypointParity(dir);
    assert.deepEqual(result.findings, []);
  } finally {
    cleanup(dir);
  }
});

// ── rule (a): bootstrap/router pointer ──────────────────────────────────

test("BOOTSTRAP_POINTER_MISSING: fires when AGENTS.md drops the router pointer, clears when restored", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(BOOTSTRAP_LINE, "") });
    const broken = checkBootstrapPointers(readBoth(dir));
    assert.ok(broken.some((f) => f.code === "BOOTSTRAP_POINTER_MISSING" && f.file === "AGENTS.md"));

    writeFiles(dir, { "AGENTS.md": `${BOOTSTRAP_LINE}${readFileSync(join(dir, "AGENTS.md"), "utf8")}` });
    const fixed = checkBootstrapPointers(readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

// ── rule (b): protocol reachability ─────────────────────────────────────

test("PROTOCOL_UNREACHABLE: fires when AGENTS.md never names a CLAUDE.md-sourced row, clears once it does", () => {
  const dir = cleanFixture();
  try {
    // Remove the row's heading text from AGENTS.md entirely.
    writeFiles(dir, { "AGENTS.md": `${BOOTSTRAP_LINE}Nothing about the fixture protocol here.\n` });
    const broken = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(
      broken.some((f) => f.code === "PROTOCOL_UNREACHABLE" && f.file === "AGENTS.md" && f.detail.includes("example-protocol")),
    );

    writeFiles(dir, { "AGENTS.md": `${BOOTSTRAP_LINE}## Mandatory Protocols\n\nSee CLAUDE.md's "Example Protocol (DEC-TEST)" heading.\n` });
    const fixed = checkProtocolReachability(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: a condensed rephrasing that drops the trailing qualifier still passes, as long as it keeps a locator", () => {
  const dir = cleanFixture();
  try {
    // AGENTS.md names the core heading text without the "(DEC-TEST)" suffix
    // -- the brief's own example of legitimate condensation, not a gap --
    // and keeps "CLAUDE.md" as the locator, in the same sentence.
    writeFiles(dir, { "AGENTS.md": `${BOOTSTRAP_LINE}## Mandatory Protocols\n\nRead about Example Protocol in CLAUDE.md.\n` });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.deepEqual(result, []);
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: a CHARTER.md-sourced row is reachable via a name and a CHARTER.md locator together, not the heading text", () => {
  const dir = cleanFixture({
    rows: [
      manifestRow({
        id: "production-authority",
        name: "Production authority (DEC-TEST)",
        full_body: "docs/company/CHARTER.md",
        source: "docs/company/CHARTER.md heading: What authorized means",
      }),
    ],
  });
  try {
    // CLAUDE.md fixture (from cleanFixture) never mentions CHARTER.md for
    // this row's heading (its own body is a CLAUDE.md heading by default);
    // rewrite both fixture files without the row's own CHARTER.md heading
    // text at all, to isolate the CHARTER.md-locator path.
    writeFiles(dir, {
      "CLAUDE.md": `${BOOTSTRAP_LINE}Nothing about production authority here.\n`,
      "AGENTS.md": `${BOOTSTRAP_LINE}Nothing about production authority here either.\n`,
    });
    const broken = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.file === "CLAUDE.md" && f.detail.includes("production-authority")));
    assert.ok(broken.some((f) => f.file === "AGENTS.md" && f.detail.includes("production-authority")));

    // A CHARTER.md mention on its own is still not enough: the row must
    // also be named. Naming it by its row `name` (not its CHARTER.md
    // heading text) is sufficient, in the same sentence as the locator.
    writeFiles(dir, {
      "CLAUDE.md": `${BOOTSTRAP_LINE}A CHARTER.md mention with no name: \`docs/company/CHARTER.md\`.\n`,
      "AGENTS.md": `${BOOTSTRAP_LINE}A CHARTER.md mention with no name: \`docs/company/CHARTER.md\`.\n`,
    });
    const namelessLocator = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(namelessLocator.some((f) => f.file === "CLAUDE.md" && f.detail.includes("production-authority")));
    assert.ok(namelessLocator.some((f) => f.file === "AGENTS.md" && f.detail.includes("production-authority")));

    writeFiles(dir, {
      "CLAUDE.md": `${BOOTSTRAP_LINE}## Mandatory Protocols\n\nProduction authority (DEC-TEST): full text in \`docs/company/CHARTER.md\`.\n`,
      "AGENTS.md": `${BOOTSTRAP_LINE}## Mandatory Protocols\n\nProduction authority (DEC-TEST): full text in \`docs/company/CHARTER.md\`.\n`,
    });
    const fixed = checkProtocolReachability(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: a coincidental mention outside the protocol index does not count -- round 4 finding 1", () => {
  const dir = cleanFixture();
  try {
    // The row's name and the word CLAUDE.md meet in an ordinary sentence
    // well away from the index, while the index itself says nothing about
    // the row. The rule it names is genuinely unfindable from this file.
    writeFiles(dir, {
      "AGENTS.md":
        `${BOOTSTRAP_LINE}## Mandatory Protocols\n\nNothing listed here yet.\n\n` +
        "## Notes\n\nOur onboarding packet reads like an Example Protocol for new hires, " +
        "and separately CLAUDE.md is the file Claude Code loads first.\n",
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(
      result.some((f) => f.code === "PROTOCOL_UNREACHABLE" && f.file === "AGENTS.md"),
      JSON.stringify(result),
    );
  } finally {
    cleanup(dir);
  }
});

test("DUPLICATE_PROTOCOL_INDEX: two index sections are reported, whichever one the reader would read -- round 5 finding 1", () => {
  const dir = cleanFixture();
  try {
    // The case that wrongly blocked: an empty stub index first, the real one
    // further down. The row is reachable in plain fact.
    const stubFirst =
      BOOTSTRAP_LINE +
      "## Mandatory Protocols" + NL + NL + "(left over from a refactor)" + NL + NL +
      "## Other stuff" + NL + NL + "Unrelated notes." + NL + NL +
      "## Mandatory Protocols" + NL + NL + '"Example Protocol (DEC-TEST)" -- see CLAUDE.md.' + NL;
    writeFiles(dir, { "AGENTS.md": stubFirst });
    const blocked = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(
      blocked.some((f) => f.code === "DUPLICATE_PROTOCOL_INDEX" && f.file === "AGENTS.md"),
      JSON.stringify(blocked),
    );

    // The case that wrongly passed: a stale first index still lists the row,
    // the real one has dropped it.
    const staleFirst =
      BOOTSTRAP_LINE +
      "## Mandatory Protocols" + NL + NL + '"Example Protocol (DEC-TEST)" -- see CLAUDE.md. (stale)' + NL + NL +
      "## Other stuff" + NL + NL + "Unrelated notes." + NL + NL +
      "## Mandatory Protocols" + NL + NL + "Nothing listed here now." + NL;
    writeFiles(dir, { "AGENTS.md": staleFirst });
    const passed = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(
      passed.some((f) => f.code === "DUPLICATE_PROTOCOL_INDEX" && f.file === "AGENTS.md"),
      JSON.stringify(passed),
    );
  } finally {
    cleanup(dir);
  }
});

test("DUPLICATE_PROTOCOL_INDEX: an underline-style second index counts, a fenced example does not -- round 5 review", () => {
  const dir = cleanFixture();
  try {
    // Written with an underline instead of hashes, this renders as a real
    // heading, so a second index in that style must count the same.
    const base = readFileSync(join(dir, "AGENTS.md"), "utf8");
    writeFiles(dir, {
      "AGENTS.md":
        base + NL + NL + "Mandatory Protocols" + NL + "===================" + NL + NL +
        "The row has been dropped from this file." + NL,
    });
    const underline = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(
      underline.some((f) => f.code === "DUPLICATE_PROTOCOL_INDEX" && f.file === "AGENTS.md"),
      JSON.stringify(underline),
    );

    // Quoted inside a fence it is an example, not a heading, and must not
    // be counted: that would block an author documenting the pattern.
    writeFiles(dir, {
      "AGENTS.md": base + NL + NL + "An example of the index heading:" + NL + NL + FENCE + NL + "## Mandatory Protocols" + NL + FENCE + NL,
    });
    const fenced = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(
      !fenced.some((f) => f.code === "DUPLICATE_PROTOCOL_INDEX"),
      JSON.stringify(fenced),
    );
  } finally {
    cleanup(dir);
  }
});

test("a fenced example inside the index does not cut the section short -- round 6 review", () => {
  const dir = cleanFixture();
  try {
    // An author illustrating the index's own format writes a fenced example
    // inside the index, above the real entries. The section must not end at
    // that example, or a row listed after it reads as unreachable.
    writeFiles(dir, {
      "AGENTS.md":
        BOOTSTRAP_LINE + "## Mandatory Protocols" + NL + NL +
        "Format example:" + NL + NL + FENCE + NL + "## Mandatory Protocols" + NL + FENCE + NL + NL +
        '"Example Protocol (DEC-TEST)" -- see CLAUDE.md.' + NL,
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.deepEqual(result, [], JSON.stringify(result));
  } finally {
    cleanup(dir);
  }
});

test("CLAUDE_SECTION_UNEXTRACTABLE: a duplicate heading is reported as itself, not as a missing protocol -- round 4 finding 2", () => {
  const dir = cleanFixture();
  try {
    // The row's real section is untouched and still matches its mirror; an
    // unrelated cross-reference elsewhere reuses the heading text. The
    // finding must name that, rather than claiming the protocol is gone.
    const claude = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    writeFiles(dir, {
      "CLAUDE.md": `${claude}\n### Example Protocol (DEC-TEST)\n\nSee above; nothing new is added here.\n`,
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(
      result.some((f) => f.code === "CLAUDE_SECTION_UNEXTRACTABLE" && f.file === "CLAUDE.md"),
      JSON.stringify(result),
    );
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: the review's exact defeat -- a paragraph naming every protocol with no locator anywhere -- fails", () => {
  const dir = cleanFixture({
    rows: [
      manifestRow(),
      manifestRow({
        id: "second-protocol",
        name: "Second Protocol (DEC-TEST-2)",
        full_body: "docs/governance/protocols/SECOND_PROTOCOL.md",
        source: "CLAUDE.md heading: Second Protocol (DEC-TEST-2)",
      }),
    ],
  });
  try {
    // CLAUDE.md still carries both rows' own headings (must keep working),
    // but AGENTS.md is rewritten exactly the way the review's edit did it:
    // a paragraph naming every protocol, no pointer to CLAUDE.md, no path.
    // Each heading's body must clear the substantive-word floor and match
    // its own mirror file exactly, the same as the default clean fixture.
    writeFiles(dir, {
      "CLAUDE.md": `${BOOTSTRAP_LINE}### Example Protocol (DEC-TEST)\n\n${FIXTURE_BODY}\n\n### Second Protocol (DEC-TEST-2)\n\n${FIXTURE_BODY}\n`,
      "AGENTS.md": `${BOOTSTRAP_LINE}Mandatory protocols in force: Example Protocol (DEC-TEST) and Second Protocol (DEC-TEST-2).\n`,
      "docs/governance/protocols/SECOND_PROTOCOL.md": mirrorMarkdown(
        "Second Protocol (DEC-TEST-2)",
        `### Second Protocol (DEC-TEST-2)\n\n${FIXTURE_BODY}`,
      ),
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "AGENTS.md" && f.detail.includes("example-protocol")));
    assert.ok(result.some((f) => f.file === "AGENTS.md" && f.detail.includes("second-protocol")));
    // CLAUDE.md itself still passes via its own headings.
    assert.ok(!result.some((f) => f.file === "CLAUDE.md"));
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: a name and a locator in different blocks (a table header naming the locator, a different row naming the protocol) still fails", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "AGENTS.md":
        `${BOOTSTRAP_LINE}| Protocol | CLAUDE.md heading |\n` +
        `|---|---|\n` +
        `| Example Protocol (DEC-TEST) | see above |\n`,
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "AGENTS.md" && f.detail.includes("example-protocol")));
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: a heading pasted inside a fenced code block does not satisfy own-text reachability -- the review's finding 1 case", () => {
  const dir = cleanFixture();
  try {
    // The row's heading text appears only inside a fenced example block, not
    // as a real Markdown heading of the file -- the review's exact defeat:
    // pasting a protocol's heading into an example block made the row
    // reachable with no real content behind it. It must not satisfy
    // hasOwnFullText, and with no locator anywhere either, the row is
    // unreachable.
    writeFiles(dir, {
      "CLAUDE.md": `${BOOTSTRAP_LINE}\`\`\`\n### Example Protocol (DEC-TEST)\n\`\`\`\n\nUnrelated prose with no locator.\n`,
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "CLAUDE.md" && f.detail.includes("example-protocol")));
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: a locator inside a fenced block right after naming prose does not count as the same block -- the review's finding 2 case", () => {
  const dir = cleanFixture();
  try {
    // A sentence naming the protocol, immediately followed by a fenced
    // snippet containing the row's full_body path. A locator inside a
    // fence is not a pointer a reader follows from the prose; the fence
    // must flush the naming paragraph and exclude its own content from
    // every block, so name and locator never land in the same block.
    writeFiles(dir, {
      "AGENTS.md":
        `${BOOTSTRAP_LINE}See Example Protocol (DEC-TEST):\n\n` +
        "```\ndocs/governance/protocols/EXAMPLE_PROTOCOL.md\n```\n",
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "AGENTS.md" && f.detail.includes("example-protocol")));
  } finally {
    cleanup(dir);
  }
});

// ── rule (c): mutable facts ──────────────────────────────────────────────

// Built at runtime: a literal fence inside a template string would end it.
const FENCE = String.fromCharCode(96).repeat(3);
const NL = String.fromCharCode(10);

test("UNTERMINATED_FENCE: an unclosed fence hides later facts, so it is itself reported", () => {
  const dir = cleanFixture();
  try {
    // A fence opened and never closed makes every later line read as fenced,
    // which would hide this price and this count from all three scans.
    writeFiles(dir, {
      "AGENTS.md":
        readFileSync(join(dir, "AGENTS.md"), "utf8") +
        "\n\n" + FENCE + "\nThe platform lists 290 capabilities and costs 0.75 EUR.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(
      broken.some((f) => f.code === "UNTERMINATED_FENCE" && f.file === "AGENTS.md"),
      JSON.stringify(broken),
    );

    // Closing the fence restores ordinary behaviour: the hidden lines are
    // genuinely inside a fence now, so nothing is reported.
    writeFiles(dir, {
      "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8") + FENCE + "\n",
    });
    const closed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(closed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): fires on a nonzero price, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\nThis costs €50 per call.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.code === "MUTABLE_FACT_FOUND" && f.detail.includes("MONEY")));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nThis costs €50 per call.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): a zero-value amount is never flagged", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\nFixture mode costs €0 externally.\n` });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(result, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): allowlisted inside a named structural section, not elsewhere", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\n## Operating Charter (DEC-20260815-A) -- division of authority\n\nSpend inside €50/week.\n\n## Next Section\n\nA later section repeats €50/week outside the allowlisted heading.\n`,
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(
      result.filter((f) => f.file === "AGENTS.md"),
      [{ code: "MUTABLE_FACT_FOUND", file: "AGENTS.md", detail: 'MONEY at line 14: "€50"' }],
    );
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): a fenced code block's literal is never flagged", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n\`\`\`yaml\nprice: "€50"\n\`\`\`\n`,
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(result, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): a figure inside a mirrored protocol body does not fire", () => {
  const dir = cleanFixture();
  try {
    // The clean fixture's CLAUDE.md already puts "Fixture protocol body."
    // under the row's own heading -- add a nonzero price there, and keep
    // the fixture's mirror file (cleanFixture's stand-in for
    // docs/governance/protocols/*.md) in sync with the same text, exactly
    // as a real edit would re-extract the mirror after changing CLAUDE.md.
    // It is a genuinely verified mirrored protocol section, so rule (c)
    // must not flag it, even though the same figure elsewhere would fire.
    const heading = manifestRow().source.slice(CLAUDE_HEADING_PREFIX.length);
    const newBody = "Fixture protocol body. A 2026-04-30 finding cited a €50 fee as evidence.";
    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(`${FIXTURE_BODY}\n`, `${newBody}\n`),
      [manifestRow().full_body]: mirrorMarkdown(heading, `### ${heading}\n\n${newBody}`),
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(result, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): a heading matching a row but a fabricated body (mirror not updated) still fires -- the review's finding 3 case", () => {
  const dir = cleanFixture();
  try {
    // Same edit as above -- a fee added under the row's own heading -- but
    // the mirror file is left untouched, so the heading no longer carries
    // its verified mirrored body: it is exactly the review's finding 3
    // shape, a protocol heading pasted over a fabricated paragraph. It must
    // be scanned like ordinary prose, not skipped on the strength of the
    // heading text matching a manifest row.
    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        `${FIXTURE_BODY}\n`,
        "Fixture protocol body. A finding cited a €50 fee as evidence.\n",
      ),
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "CLAUDE.md" && f.detail.includes("MONEY") && f.detail.includes("€50")));
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND: AGENTS.md never gets the mirror skip, even when it restates a mirrored heading faithfully", () => {
  const dir = cleanFixture();
  try {
    // AGENTS.md carries the row's heading and a faithful-looking restatement
    // of the mirror body plus a fabricated fee -- but AGENTS.md is a
    // condensed derivative by design and can never be byte-identical to a
    // mirror extracted verbatim from CLAUDE.md (see
    // verifiedMirroredHeadingForms's own comment), so this section is
    // always scanned like ordinary prose, regardless of how faithful it
    // looks.
    const heading = manifestRow().source.slice(CLAUDE_HEADING_PREFIX.length);
    writeFiles(dir, {
      "AGENTS.md": `${BOOTSTRAP_LINE}### ${heading}\n\nFixture protocol body. A finding cited a €50 fee as evidence.\n`,
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "AGENTS.md" && f.detail.includes("MONEY") && f.detail.includes("€50")));
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): spelled-out currency (a currency word instead of a symbol) fires, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\nThis widget costs 0.75 EUR.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("MONEY") && f.detail.includes("0.75 EUR")));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nThis widget costs 0.75 EUR.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): fires on a capability/solution count, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n300+ capabilities across 7 verticals.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("COUNT")));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\n300+ capabilities across 7 verticals.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): a countable noun outside the fixed five fires, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n290 registries are covered today.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("COUNT") && f.detail.includes("290 registries")));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\n290 registries are covered today.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): a spelled-out count fires, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\nTwo hundred and ninety capabilities across seven verticals.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("COUNT") && /two hundred and ninety capabilities/i.test(f.detail)));
    assert.ok(broken.some((f) => f.detail.includes("COUNT") && /seven verticals/i.test(f.detail)));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nTwo hundred and ninety capabilities across seven verticals.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): a count split across table cells fires -- the review's finding 4 case, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n| Verticals | seven |\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("COUNT") && /seven/i.test(f.detail)));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\n| Verticals | seven |\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): a count-then-noun table cell fires too", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n| seven | Verticals |\n`,
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.ok(result.some((f) => f.detail.includes("COUNT") && /seven/i.test(f.detail)));
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): fires on 'Last verified: <date>', clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nLast verified: 2026-08-01.\n` });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DATE") && /last verified/i.test(f.detail)));

    writeFiles(dir, { "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace("Last verified: 2026-08-01.\n", "") });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): fires on 'Updated <date>', clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nUpdated 2026-08-01 for the new pricing band.\n` });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DATE") && /updated/i.test(f.detail)));

    writeFiles(dir, {
      "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(
        "Updated 2026-08-01 for the new pricing band.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): fires on 'Status as of Q3 2026' -- the quarter shape, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nStatus as of Q3 2026.\n` });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DATE") && /q3 2026/i.test(f.detail)));

    writeFiles(dir, { "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace("Status as of Q3 2026.\n", "") });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): fires on a dated-status label, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nNew capabilities (March 2026).\n` });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DATE")));

    writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}`.replace("New capabilities (March 2026).\n", "") });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): fires on an 'as of <ISO date>' staleness claim, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nStale as of 2026-08-17.\n` });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DATE")));

    writeFiles(dir, { "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace("Stale as of 2026-08-17.\n", "") });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): fires on an 'as of <Month YYYY>' staleness claim, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nTwo hundred and ninety capabilities across seven verticals as of September 2026.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DATE") && /as of september 2026/i.test(f.detail)));
    assert.ok(broken.some((f) => f.detail.includes("COUNT")));

    writeFiles(dir, {
      "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(
        "Two hundred and ninety capabilities across seven verticals as of September 2026.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): fires on a decision id plus a multi-word summary after a dash, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\nDEC-20260905-A — Benefit-first brand positioning and terminology.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DECISION_SUMMARY")));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nDEC-20260905-A — Benefit-first brand positioning and terminology.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): fires on a decision id plus a multi-word summary after a colon, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\nDEC-20260905-A: benefit-first positioning was approved by the founder this month.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DECISION_SUMMARY")));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nDEC-20260905-A: benefit-first positioning was approved by the founder this month.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): a bare decision id with no dash-summary is never flagged", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\nSee DEC-20260905-A for the full text.\n` });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(result, []);
  } finally {
    cleanup(dir);
  }
});

// ── rule (d): inactive-document reference (reused guard) ────────────────

test("M1_ENTRYPOINT_ACTIVATED: fires when an entrypoint references a still-inactive docs/project document, clears once removed", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "docs/project/candidate.md": "---\nstatus: candidate\nauthority_active: false\n---\n\nA draft.\n",
      "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nSee \`docs/project/candidate.md\`.\n`,
    });
    const broken = checkInactiveDocumentReferences(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.code === "M1_ENTRYPOINT_ACTIVATED" && f.file === "AGENTS.md"));

    writeFiles(dir, {
      "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace("\nSee `docs/project/candidate.md`.\n", ""),
    });
    const fixed = checkInactiveDocumentReferences(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

// ── round 3: reachability must resolve, not match a string ──────────────

test("PROTOCOL_UNREACHABLE: the lunch-menu heading -- a stripped-only match with an unrelated body does not satisfy own-text -- round 3 finding 1", () => {
  const dir = cleanFixture();
  try {
    // CLAUDE.md keeps the clean fixture's own exact heading (its own
    // reachability is not under test here). AGENTS.md's heading matches the
    // row's stripped form ("Example Protocol"), and the body is long enough
    // to clear the word floor on its own, but it is about something else
    // entirely -- the reviewer's own case, a lunch menu -- and never
    // mentions the row's decision id ("DEC-TEST"). A stripped-only match
    // must carry that id somewhere to count. AGENTS.md is never held to
    // mirror-equality (see hasOwnFullText's own comment), so this isolates
    // the decision-id rule from the mirror-verification rule.
    writeFiles(dir, {
      "AGENTS.md":
        `${BOOTSTRAP_LINE}### Example Protocol\n\n` +
        "Today's lunch menu offers soup, a sandwich, a salad, and a slice of pie for dessert.\n",
    });
    const broken = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.file === "AGENTS.md" && f.detail.includes("example-protocol")));
    assert.ok(!broken.some((f) => f.file === "CLAUDE.md"));

    // Adding the row's own decision id to the body -- a legitimate condensed
    // restatement that still identifies the protocol -- clears it.
    writeFiles(dir, {
      "AGENTS.md":
        `${BOOTSTRAP_LINE}### Example Protocol\n\n` +
        "This section carries DEC-TEST in full, condensed from its CLAUDE.md original.\n",
    });
    const fixed = checkProtocolReachability(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: 'the protocol text was removed from CLAUDE.md' sentence does not resolve the CLAUDE.md locator -- round 3 finding 2", () => {
  const dir = cleanFixture();
  try {
    // The literal string "CLAUDE.md" sits right next to the row's name, but
    // the sentence itself says CLAUDE.md no longer carries the text -- and
    // CLAUDE.md, rewritten here to actually not carry it, proves the point:
    // the old rule trusted the bare word; this one checks the document.
    writeFiles(dir, {
      "CLAUDE.md": `${BOOTSTRAP_LINE}Nothing about the fixture protocol here.\n`,
      "AGENTS.md":
        `${BOOTSTRAP_LINE}The Example Protocol (DEC-TEST) text was removed from CLAUDE.md ` +
        "and is not documented anywhere else yet.\n",
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "AGENTS.md" && f.detail.includes("example-protocol")));
  } finally {
    cleanup(dir);
  }
});

test("LOCATOR_MISSING: a locator pointing at a file that does not exist is its own finding, distinct from PROTOCOL_UNREACHABLE -- round 3 finding 2", () => {
  const dir = cleanFixture();
  try {
    // Name the row and give its own full_body path as the locator, but never
    // create that file (cleanFixture's mirror stub is removed) -- a dangling
    // pointer, worse than no pointer at all.
    rmSync(join(dir, manifestRow().full_body));
    writeFiles(dir, {
      "AGENTS.md": `${BOOTSTRAP_LINE}## Mandatory Protocols\n\nExample Protocol (DEC-TEST): full text at \`${manifestRow().full_body}\`.\n`,
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.code === "LOCATOR_MISSING" && f.file === "AGENTS.md" && f.detail.includes("example-protocol")));
    // The generic PROTOCOL_UNREACHABLE is not also raised for the same
    // row/file once the more specific LOCATOR_MISSING already explains why.
    assert.ok(!result.some((f) => f.code === "PROTOCOL_UNREACHABLE" && f.file === "AGENTS.md"));
  } finally {
    cleanup(dir);
  }
});

test("PROTOCOL_UNREACHABLE: a locator naming a different protocol's real path does not satisfy this row -- round 3 regression", () => {
  const dir = cleanFixture({
    rows: [
      manifestRow(),
      manifestRow({
        id: "second-protocol",
        name: "Second Protocol (DEC-TEST-2)",
        full_body: "docs/governance/protocols/SECOND_PROTOCOL.md",
        source: "CLAUDE.md heading: Second Protocol (DEC-TEST-2)",
      }),
    ],
  });
  try {
    writeFiles(dir, {
      "docs/governance/protocols/SECOND_PROTOCOL.md": mirrorMarkdown(
        "Second Protocol (DEC-TEST-2)",
        `### Second Protocol (DEC-TEST-2)\n\n${FIXTURE_BODY}`,
      ),
      "AGENTS.md":
        `${BOOTSTRAP_LINE}Example Protocol (DEC-TEST): see ` +
        "`docs/governance/protocols/SECOND_PROTOCOL.md` (a different protocol's real, existing path).\n",
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "AGENTS.md" && f.detail.includes("example-protocol")));
  } finally {
    cleanup(dir);
  }
});

// ── round 3: a fence is not only three backticks ─────────────────────────

test("a heading inside a ~~~ fence does not satisfy own-text reachability -- round 3 finding 3", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${BOOTSTRAP_LINE}~~~\n### Example Protocol (DEC-TEST)\n~~~\n\nUnrelated prose with no locator.\n`,
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "CLAUDE.md" && f.detail.includes("example-protocol")));
  } finally {
    cleanup(dir);
  }
});

test("a heading inside a blockquoted fence does not satisfy own-text reachability -- round 3 finding 3", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${BOOTSTRAP_LINE}> \`\`\`\n> ### Example Protocol (DEC-TEST)\n> \`\`\`\n\nUnrelated prose with no locator.\n`,
    });
    const result = checkProtocolReachability(dir, readBoth(dir));
    assert.ok(result.some((f) => f.file === "CLAUDE.md" && f.detail.includes("example-protocol")));
  } finally {
    cleanup(dir);
  }
});

test("UNTERMINATED_FENCE: a closing marker shorter than the opening one does not close a longer fence", () => {
  const dir = cleanFixture();
  try {
    // Opened with four backticks; a three-backtick line part-way through
    // must not count as a close (CommonMark's own rule: the close must be at
    // least as long as the open).
    writeFiles(dir, {
      "AGENTS.md":
        `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\n\n` +
        "````\nThe platform lists 290 capabilities.\n```\nStill fenced.\n````\n",
    });
    const stillOpenInside = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(stillOpenInside, []);

    // The matching four-backtick close actually closes it, and a fact after
    // it is scanned normally.
    writeFiles(dir, {
      "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\n290 capabilities.\n`,
    });
    const afterRealClose = checkMutableFacts(dir, readBoth(dir));
    assert.ok(afterRealClose.some((f) => f.detail.includes("COUNT")));
  } finally {
    cleanup(dir);
  }
});

// ── round 3: normalize the line instead of adding more patterns ─────────

test("MUTABLE_FACT_FOUND (MONEY): a figure inside a Markdown link's visible text fires -- round 3 finding 4/5/6", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n[This costs €50 per call](https://example.com/pricing).\n`,
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.ok(result.some((f) => f.detail.includes("MONEY") && f.detail.includes("€50")));
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): a count inside bold emphasis fires -- round 3 finding 4/5/6", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\nThe platform lists **290 capabilities** today.\n`,
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.ok(result.some((f) => f.detail.includes("COUNT") && /290 capabilities/i.test(f.detail)));
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): a count split across table cells still fires once the pipe becomes a space, even italic", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n| Verticals | _seven_ |\n`,
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.ok(result.some((f) => f.detail.includes("COUNT") && /seven/i.test(f.detail)));
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): a Nordic currency code (SEK) fires, alongside NOK/DKK/GBP/CHF/PLN", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\nThis costs 500 SEK per month.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("MONEY") && f.detail.includes("500 SEK")));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nThis costs 500 SEK per month.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): fires on 'valid through <date>' and 'refreshed <date>' and 'reviewed <date>' and 'current through <date>' -- round 3 finding 4", () => {
  const dir = cleanFixture();
  try {
    for (const phrase of [
      "Valid through 2026-12-01.",
      "Refreshed 2026-08-01 after the audit.",
      "Reviewed 2026-08-01 by the founder.",
      "Current through Q3 2026.",
    ]) {
      writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\n${phrase}\n` });
      const broken = checkMutableFacts(dir, readBoth(dir));
      assert.ok(broken.some((f) => f.detail.includes("DATE")), `expected a DATE finding for: ${phrase}`);
      writeFiles(dir, { "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(`\n${phrase}\n`, "") });
    }
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): fires on a verb outside the old fixed list, clears once removed -- round 3 finding 4", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\nDEC-20260905-A approved the new benefit-first positioning for the redesign.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(broken.some((f) => f.detail.includes("DECISION_SUMMARY")));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nDEC-20260905-A approved the new benefit-first positioning for the redesign.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): a decision id followed by an ordinary function word is never flagged", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, { "CLAUDE.md": `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\nSee DEC-20260905-A and the linked record for the full text.\n` });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(result, []);
  } finally {
    cleanup(dir);
  }
});

// ── round 7 finding 1: the scan is paragraph-scoped, not line-scoped ─────

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): a decision id and its summary split across an ordinary paragraph wrap still fires", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "This was decided under DEC-20260901-A:\nthe fee schedule moves to a new tier structure entirely.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(
      broken.some((f) => f.file === "CLAUDE.md" && f.detail.includes("DECISION_SUMMARY")),
      JSON.stringify(broken),
    );

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nThis was decided under DEC-20260901-A:\nthe fee schedule moves to a new tier structure entirely.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): a bare count split across an ordinary paragraph wrap still fires", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "The platform currently lists 290\ncapabilities across every vertical.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(
      broken.some((f) => f.file === "CLAUDE.md" && f.detail.includes("COUNT")),
      JSON.stringify(broken),
    );

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nThe platform currently lists 290\ncapabilities across every vertical.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (MONEY): a price split across an ordinary paragraph wrap still fires", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "This capability was repriced and now\ncosts \u20ac50 per call under the new schedule.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(
      broken.some((f) => f.file === "CLAUDE.md" && f.detail.includes("MONEY")),
      JSON.stringify(broken),
    );

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nThis capability was repriced and now\ncosts \u20ac50 per call under the new schedule.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): a staleness claim split across an ordinary paragraph wrap still fires", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "AGENTS.md":
        `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nThis section was reviewed\n2026-08-01 by the founder.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(
      broken.some((f) => f.file === "AGENTS.md" && f.detail.includes("DATE")),
      JSON.stringify(broken),
    );

    writeFiles(dir, {
      "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(
        "\nThis section was reviewed\n2026-08-01 by the founder.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND: a finding on a wrapped paragraph reports the paragraph's start line, not the line the match half sits on", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\nThe platform currently lists 290\ncapabilities across every vertical.\n`,
    });
    const lines = readFileSync(join(dir, "AGENTS.md"), "utf8").split("\n");
    const paragraphStart = lines.findIndex((l) => l.includes("The platform currently lists 290")) + 1;
    const result = checkMutableFacts(dir, readBoth(dir));
    const hit = result.find((f) => f.file === "AGENTS.md" && f.detail.includes("COUNT"));
    assert.ok(hit, JSON.stringify(result));
    assert.ok(hit.detail.startsWith(`COUNT at line ${paragraphStart}:`), hit.detail);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND: a table row is never joined into a paragraph that follows it", () => {
  const dir = cleanFixture();
  try {
    // "Verticals" and "seven" sit in a table row immediately followed by an
    // ordinary paragraph naming an unrelated noun ("registries") and a
    // count -- the table row must not absorb the paragraph after it (or vice
    // versa) into one unit, which would misreport the paragraph's count as
    // if it were part of the table row, or read the two together as one
    // nonsense adjacency.
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "| Verticals | seven |\nTwelve registries are covered separately.\n",
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    const countHits = result.filter((f) => f.file === "CLAUDE.md" && f.detail.includes("COUNT"));
    assert.ok(countHits.some((f) => /seven/i.test(f.detail)), JSON.stringify(countHits));
    assert.ok(countHits.some((f) => /twelve registries/i.test(f.detail)), JSON.stringify(countHits));
    // Neither count's snippet swallows the other noun -- proof the two lines
    // were scanned as separate units, not joined into one.
    assert.ok(!countHits.some((f) => /seven.*registries/is.test(f.detail)), JSON.stringify(countHits));
    assert.ok(!countHits.some((f) => /twelve.*verticals/is.test(f.detail)), JSON.stringify(countHits));
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND: a fence still flushes the paragraph before it, so a fact cannot join across the fence boundary", () => {
  const dir = cleanFixture();
  try {
    // A sentence naming a count, immediately followed by a fenced example
    // whose own content must never join into the paragraph before it, and
    // prose resuming after the fence must not join into the paragraph
    // before the fence either.
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "The registry lists\n```\nprice_cents: 5\n```\nnothing else on this line.\n",
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(
      result.filter((f) => f.file === "CLAUDE.md"),
      [],
      JSON.stringify(result),
    );
  } finally {
    cleanup(dir);
  }
});

// ── round 8 finding 1: a literal space cannot match a joined-unit newline ──

test("MUTABLE_FACT_FOUND (DATE): an 'as of' staleness claim wrapped at either internal space still fires", () => {
  const dir = cleanFixture();
  try {
    const wraps = [
      "This capability list is accurate as\nof September 2026 and will need review later on.",
      "This capability list is accurate as of\nSeptember 2026 and will need review later on.",
    ];
    for (const text of wraps) {
      writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\n${text}\n` });
      const broken = checkMutableFacts(dir, readBoth(dir));
      assert.ok(
        broken.some((f) => f.file === "AGENTS.md" && f.detail.includes("DATE")),
        JSON.stringify(broken),
      );
      writeFiles(dir, {
        "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(`\n${text}\n`, ""),
      });
    }
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): a 'valid through' staleness claim wrapped at either internal space still fires", () => {
  const dir = cleanFixture();
  try {
    const wraps = [
      "The pricing is valid\nthrough September 2026 for existing customers.",
      "The pricing is valid through\nSeptember 2026 for existing customers.",
    ];
    for (const text of wraps) {
      writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\n${text}\n` });
      const broken = checkMutableFacts(dir, readBoth(dir));
      assert.ok(
        broken.some((f) => f.file === "AGENTS.md" && f.detail.includes("DATE")),
        JSON.stringify(broken),
      );
      writeFiles(dir, {
        "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(`\n${text}\n`, ""),
      });
    }
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): a 'current through' staleness claim wrapped at either internal space still fires", () => {
  const dir = cleanFixture();
  try {
    const wraps = [
      "That guarantee stays current\nthrough September 2026 unless renegotiated.",
      "That guarantee stays current through\nSeptember 2026 unless renegotiated.",
    ];
    for (const text of wraps) {
      writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\n${text}\n` });
      const broken = checkMutableFacts(dir, readBoth(dir));
      assert.ok(
        broken.some((f) => f.file === "AGENTS.md" && f.detail.includes("DATE")),
        JSON.stringify(broken),
      );
      writeFiles(dir, {
        "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(`\n${text}\n`, ""),
      });
    }
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): a 'Last verified' staleness claim wrapped between 'Last' and 'verified' still fires", () => {
  const dir = cleanFixture();
  try {
    const wraps = [
      "Last\nverified: 2026-08-01 by the founder.",
      "Last verified:\n2026-08-01 by the founder.",
    ];
    for (const text of wraps) {
      writeFiles(dir, { "AGENTS.md": `${readFileSync(join(dir, "AGENTS.md"), "utf8")}\n${text}\n` });
      const broken = checkMutableFacts(dir, readBoth(dir));
      assert.ok(
        broken.some((f) => f.file === "AGENTS.md" && f.detail.includes("DATE")),
        JSON.stringify(broken),
      );
      writeFiles(dir, {
        "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8").replace(`\n${text}\n`, ""),
      });
    }
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

// ── round 8 finding 3: one fact matched twice reports once ─────────────────

test("MUTABLE_FACT_FOUND (COUNT): a count on one of the five named plurals, matched by both the named and generic pattern, reports once", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "The platform currently lists 290 capabilities across every vertical.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    const countHits = broken.filter(
      (f) => f.file === "CLAUDE.md" && f.detail.includes("COUNT") && /290 capabilities/i.test(f.detail),
    );
    assert.equal(countHits.length, 1, JSON.stringify(broken));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nThe platform currently lists 290 capabilities across every vertical.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): two genuinely distinct counts on the same line still report twice", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "The platform lists 290 capabilities and twelve registries on this line.\n",
    });
    const result = checkMutableFacts(dir, readBoth(dir));
    const countHits = result.filter((f) => f.file === "CLAUDE.md" && f.detail.includes("COUNT"));
    assert.equal(countHits.length, 2, JSON.stringify(countHits));
    assert.ok(countHits.some((f) => /290 capabilities/i.test(f.detail)), JSON.stringify(countHits));
    assert.ok(countHits.some((f) => /twelve registries/i.test(f.detail)), JSON.stringify(countHits));
  } finally {
    cleanup(dir);
  }
});

// ── round 9: remove the newline-assuming-step bug class, not one more patch ─

test("extractFactScanUnits: no unit ever contains a newline, across paragraphs, list items, table rows, block quotes, headings and fenced content", () => {
  const lines = [
    "This is an ordinary paragraph",
    "wrapped across two lines with no marker of its own.",
    "",
    "- A list item",
    "  with a wrapped continuation line.",
    "",
    "| Column A | Column B |",
    "| --- | --- |",
    "| one | two |",
    "",
    "> A block quote line",
    "> and its second line.",
    "",
    "### A heading",
    "",
    "```",
    "a fenced line",
    "that spans two lines",
    "```",
    "",
    "A final paragraph.",
  ];
  const units = extractFactScanUnits(lines, new Set(), new Set());
  assert.ok(units.length > 0);
  for (const unit of units) {
    assert.ok(!unit.text.includes("\n"), JSON.stringify(unit));
  }
});

test("extractFactScanUnits: a joined unit's internal whitespace is collapsed to single spaces", () => {
  const lines = ["This paragraph wraps", "  with leading indentation on its second line."];
  const units = extractFactScanUnits(lines, new Set(), new Set());
  assert.equal(units.length, 1);
  assert.equal(
    units[0].text,
    "This paragraph wraps with leading indentation on its second line.",
  );
});

// ── round 9 finding: normalizeLineForScan's bare `.` never matched a joined
// unit's embedded newline, so an emphasis span wrapped across it was missed
// entirely (three planted cases from the round 9 finding) ──────────────────

test("MUTABLE_FACT_FOUND (COUNT): an italic span wrapped between the count and the named noun still fires -- round 9 finding", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "_290\ncapabilities_ of ours are listed here.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(
      broken.some((f) => f.file === "CLAUDE.md" && f.detail.includes("COUNT")),
      JSON.stringify(broken),
    );

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\n_290\ncapabilities_ of ours are listed here.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DATE): a 'valid through' claim wrapped inside an italic span still fires -- round 9 finding", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "The pricing is _valid through\nQ3 2026_ for existing customers.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    assert.ok(
      broken.some((f) => f.file === "CLAUDE.md" && f.detail.includes("DATE")),
      JSON.stringify(broken),
    );

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nThe pricing is _valid through\nQ3 2026_ for existing customers.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (COUNT): a bold span wrapped between the count and the named noun fires with a clean, newline-free snippet -- round 9 finding", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "**290\ncapabilities** are listed here.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    const hit = broken.find((f) => f.file === "CLAUDE.md" && f.detail.includes("COUNT"));
    assert.ok(hit, JSON.stringify(broken));
    // Before round 9's fix, a bold two-marker span still produced this
    // finding (the paired markers happened to collapse to nothing, leaving
    // \s+ to match the raw newline), but its snippet carried the newline
    // verbatim -- exactly the old shape the redesign is supposed to remove.
    assert.ok(!hit.detail.includes("\n"), JSON.stringify(hit));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\n**290\ncapabilities** are listed here.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

// ── round 9: findDecisionSummaries' snippet is the matched slice, not the
// whole unit, so two distinct decision summaries sharing one unit both
// report ─────────────────────────────────────────────────────────────────

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): two distinct decision summaries sharing one paragraph-joined unit both report", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "DEC-20260101-A retired the old widget entirely for good. DEC-20260102-B\n" +
        "replaced it with a much better one.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    const summaries = broken.filter((f) => f.file === "CLAUDE.md" && f.detail.includes("DECISION_SUMMARY"));
    assert.equal(summaries.length, 2, JSON.stringify(summaries));
    assert.ok(summaries.some((f) => f.detail.includes("DEC-20260101-A")), JSON.stringify(summaries));
    assert.ok(summaries.some((f) => f.detail.includes("DEC-20260102-B")), JSON.stringify(summaries));
    // Each snippet starts with its own decision id and the two snippets are
    // distinct, so the dedup key (category + snippet + line) still keeps
    // them apart. Round 10 removed the next-id cutoff this test used to
    // check for (a mention of DEC-20260102-B inside DEC-20260101-A's own
    // snippet no longer truncates it, per round 10 finding 2), so the first
    // snippet may now legitimately include the second id's text too.
    const first = summaries.find((f) => f.detail.includes('"DEC-20260101-A'));
    const second = summaries.find((f) => f.detail.includes('"DEC-20260102-B'));
    assert.notEqual(first.detail, second.detail, JSON.stringify(summaries));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nDEC-20260101-A retired the old widget entirely for good. DEC-20260102-B\nreplaced it with a much better one.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): a decision id repeated verbatim in one unit still dedupes to one finding", () => {
  const dir = cleanFixture();
  try {
    // The repeated phrase (id + summary) is deliberately longer than
    // DECISION_SUMMARY_SNIPPET_CAP (round 10): once both occurrences'
    // captured text is at least that long, each snippet truncates to the
    // same first-120-characters prefix of the identical phrase, so the two
    // occurrences dedupe to one finding under the category+snippet+line
    // key even though round 10 removed the next-id and sentence cutoffs
    // that used to make this converge. A phrase shorter than the cap would
    // not dedupe this way, because the first occurrence's untruncated text
    // would run on into the second occurrence's own text.
    const phrase =
      "DEC-20260901-A: approved the redesign because of extensive testing " +
      "across multiple environments and careful review of every " +
      "consequence considered before finalizing this call.";
    assert.ok(phrase.length > 120, "fixture phrase must exceed the snippet cap");
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n${phrase} ${phrase}\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    const summaries = broken.filter((f) => f.file === "CLAUDE.md" && f.detail.includes("DECISION_SUMMARY"));
    assert.equal(summaries.length, 1, JSON.stringify(summaries));
    assert.ok(summaries[0].detail.trim().endsWith('..."'), JSON.stringify(summaries));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        `\n### Unrelated section\n\n${phrase} ${phrase}\n`,
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

// ── round 10: findDecisionSummaries' snippet is a fixed-length cap, not an
// inferred sentence or next-id boundary ─────────────────────────────────────

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): an abbreviation's period does not truncate the snippet", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "DEC-20260101-A retired the old registry lookup (e.g. widgets) for good\n" +
        "reasons stated below.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    const summaries = broken.filter((f) => f.file === "CLAUDE.md" && f.detail.includes("DECISION_SUMMARY"));
    assert.equal(summaries.length, 1, JSON.stringify(summaries));
    // The old sentence-boundary inference stopped at "(e.g." because a
    // period followed by whitespace read as a sentence end -- round 10
    // finding 1. The snippet must run past the abbreviation.
    assert.ok(summaries[0].detail.startsWith('DECISION_SUMMARY at line'), JSON.stringify(summaries));
    assert.ok(summaries[0].detail.includes("DEC-20260101-A retired the old registry lookup"), JSON.stringify(summaries));
    assert.ok(!summaries[0].detail.includes('(e.g."'), JSON.stringify(summaries));
    assert.ok(summaries[0].detail.includes("reasons stated below"), JSON.stringify(summaries));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nDEC-20260101-A retired the old registry lookup (e.g. widgets) for good\nreasons stated below.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): a mention of another decision id does not truncate the snippet", () => {
  const dir = cleanFixture();
  try {
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        "DEC-20260101-A retired the old widget for good, unlike DEC-20260102-B\n" +
        "which never shipped.\n",
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    const summaries = broken.filter((f) => f.file === "CLAUDE.md" && f.detail.includes("DECISION_SUMMARY"));
    assert.equal(summaries.length, 1, JSON.stringify(summaries));
    // The old next-id-boundary inference stopped at "unlike" because
    // DEC-20260102-B is only mentioned, not the start of its own summary --
    // round 10 finding 2. The snippet must run past that mention.
    assert.ok(summaries[0].detail.includes("DEC-20260101-A retired the old widget for good"), JSON.stringify(summaries));
    assert.ok(!summaries[0].detail.trim().endsWith("unlike\""), JSON.stringify(summaries));
    assert.ok(summaries[0].detail.includes("which never shipped"), JSON.stringify(summaries));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        "\n### Unrelated section\n\nDEC-20260101-A retired the old widget for good, unlike DEC-20260102-B\nwhich never shipped.\n",
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

test("MUTABLE_FACT_FOUND (DECISION_SUMMARY): a snippet longer than the cap is truncated with a marker, and two distinct ids still dedupe apart", () => {
  const dir = cleanFixture();
  try {
    const longTail = "x".repeat(200);
    writeFiles(dir, {
      "CLAUDE.md":
        `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n### Unrelated section\n\n` +
        `DEC-20260101-A retired the old widget for a very long list of reasons: ${longTail}. ` +
        `DEC-20260102-B replaced it with a very long list of reasons too: ${longTail}.\n`,
    });
    const broken = checkMutableFacts(dir, readBoth(dir));
    const summaries = broken.filter((f) => f.file === "CLAUDE.md" && f.detail.includes("DECISION_SUMMARY"));
    // Both ids still report, and as two distinct findings -- a cap that
    // truncated both summaries down to an identical prefix would have
    // collapsed them into one finding under the category+snippet+line
    // dedup key, which is exactly what this test would catch.
    assert.equal(summaries.length, 2, JSON.stringify(summaries));
    assert.ok(summaries.some((f) => f.detail.includes("DEC-20260101-A")), JSON.stringify(summaries));
    assert.ok(summaries.some((f) => f.detail.includes("DEC-20260102-B")), JSON.stringify(summaries));
    const first = summaries.find((f) => f.detail.includes("DEC-20260101-A"));
    const second = summaries.find((f) => f.detail.includes("DEC-20260102-B"));
    assert.notEqual(first.detail, second.detail, JSON.stringify(summaries));
    assert.ok(first.detail.trim().endsWith('..."'), JSON.stringify(first));
    assert.ok(second.detail.trim().endsWith('..."'), JSON.stringify(second));

    writeFiles(dir, {
      "CLAUDE.md": readFileSync(join(dir, "CLAUDE.md"), "utf8").replace(
        `\n### Unrelated section\n\nDEC-20260101-A retired the old widget for a very long list of reasons: ${longTail}. ` +
          `DEC-20260102-B replaced it with a very long list of reasons too: ${longTail}.\n`,
        "",
      ),
    });
    const fixed = checkMutableFacts(dir, readBoth(dir));
    assert.deepEqual(fixed, []);
  } finally {
    cleanup(dir);
  }
});

// ── real repo ─────────────────────────────────────────────────────────────

test("real repo: CLAUDE.md and AGENTS.md pass entrypoint parity today", () => {
  const result = checkEntrypointParity(realRoot);
  assert.deepEqual(result.findings, []);
});
