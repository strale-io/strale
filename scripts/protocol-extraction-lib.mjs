// Library for the protocol-extraction check (T6 M3 batch 6a). CLAUDE.md
// remains the sole authority for every mandatory protocol until the
// founder-gated M4 cutover; this check exists so an extracted mirror under
// docs/governance/protocols/*.md can never quietly diverge from the
// CLAUDE.md section it copies. It never edits either file.
//
// A candidate protocol file is any docs/governance/protocols/*.md file that
// contains the BEGIN or END verbatim marker (files without either marker -
// the existing checklists and README - are ignored by rule, not by name).
// For each candidate, the check:
//   1. Confirms exactly one BEGIN marker and exactly one END marker.
//   2. Confirms YAML front matter exists and sets authority_active: false
//      and a non-empty source_heading.
//   3. Locates source_heading as an exact heading line (any level) in
//      CLAUDE.md - never by line number, so unrelated CLAUDE.md edits don't
//      break this - and requires exactly one match.
//   4. Extracts CLAUDE.md's section for that heading (the heading line
//      through the last line before the next heading of the same or higher
//      level, trailing blank lines trimmed) and compares it, line by line,
//      to the text between the file's BEGIN/END markers (also trailing-
//      blank-trimmed). Both sides are CRLF-to-LF normalized before
//      comparison, since CLAUDE.md is CRLF and the extracted mirror is LF
//      (docs/governance/** carries `text eol=lf` in .gitattributes).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export function repoRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}

export const CLAUDE_MD_PATH = "CLAUDE.md";
export const PROTOCOLS_DIR = "docs/governance/protocols";
export const BEGIN_MARKER = "<!-- BEGIN VERBATIM FROM CLAUDE.md -->";
export const END_MARKER = "<!-- END VERBATIM FROM CLAUDE.md -->";

function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

function readTextNormalized(absolutePath) {
  return normalizeEol(readFileSync(absolutePath, "utf8"));
}

/** Splits a Markdown file into its leading YAML front matter (or null if
 * absent / unparsable) and the remaining body text. */
export function splitFrontmatter(content) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);
  if (!match) return { frontmatter: null, body: content };
  let frontmatter;
  try {
    frontmatter = parseYaml(match[1]);
  } catch {
    frontmatter = null;
  }
  if (frontmatter === null || typeof frontmatter !== "object") {
    return { frontmatter: null, body: match[2] };
  }
  return { frontmatter, body: match[2] };
}

function findMarkerOccurrences(bodyLines, marker) {
  const occurrences = [];
  bodyLines.forEach((line, idx) => {
    if (line.trim() === marker) occurrences.push(idx);
  });
  return occurrences;
}

/** Every line in `claudeLines` that is an exact heading match (any level,
 * "#" through "######") for `headingText`, trimmed. */
function findHeadingOccurrences(claudeLines, headingText) {
  const occurrences = [];
  const headingRe = /^(#{1,6})\s+(.*)$/;
  const wanted = headingText.trim();
  claudeLines.forEach((line, idx) => {
    const m = headingRe.exec(line);
    if (m && m[2].trim() === wanted) {
      occurrences.push({ line: idx, level: m[1].length });
    }
  });
  return occurrences;
}

/** The section owned by a heading occurrence: from the heading line through
 * the last line before the next heading of the same or higher level
 * (fewer-or-equal "#" characters), trailing blank lines trimmed. Returns an
 * array of lines. */
function extractSection(claudeLines, occurrence) {
  const { line: startIdx, level } = occurrence;
  const headingRe = /^(#{1,6})\s+/;
  let endIdx = claudeLines.length - 1;
  for (let i = startIdx + 1; i < claudeLines.length; i++) {
    const m = headingRe.exec(claudeLines[i]);
    if (m && m[1].length <= level) {
      endIdx = i - 1;
      break;
    }
  }
  while (endIdx > startIdx && claudeLines[endIdx].trim() === "") {
    endIdx--;
  }
  return claudeLines.slice(startIdx, endIdx + 1);
}

function trimTrailingBlank(lines) {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") {
    out.pop();
  }
  return out;
}

/** Every docs/governance/protocols/*.md file that carries at least one of
 * the two verbatim markers. Files without either marker (the existing
 * checklists and README) are excluded by content, not by filename. */
export function listCandidateProtocolFiles(root) {
  const dirAbs = join(root, PROTOCOLS_DIR);
  if (!existsSync(dirAbs)) return [];
  return readdirSync(dirAbs)
    .filter((name) => name.endsWith(".md"))
    .map((name) => `${PROTOCOLS_DIR}/${name}`)
    .filter((rel) => {
      const content = readTextNormalized(join(root, rel));
      return content.includes(BEGIN_MARKER) || content.includes(END_MARKER);
    })
    .sort();
}

/** Runs every check on one candidate protocol file. Returns an array of
 * findings, each { code, file, detail }. Stops extending checks past a
 * point where a prerequisite (a single marker pair, a usable source_heading)
 * is missing, since the remaining checks have nothing to compare. */
export function checkProtocolFile(root, relPath) {
  const findings = [];
  const content = readTextNormalized(join(root, relPath));
  const { frontmatter, body } = splitFrontmatter(content);
  const bodyLines = body.split("\n");

  const beginOccurrences = findMarkerOccurrences(bodyLines, BEGIN_MARKER);
  const endOccurrences = findMarkerOccurrences(bodyLines, END_MARKER);

  if (beginOccurrences.length === 0 || endOccurrences.length === 0) {
    const missing = [];
    if (beginOccurrences.length === 0) missing.push("BEGIN");
    if (endOccurrences.length === 0) missing.push("END");
    findings.push({
      code: "PROTOCOL_MARKER_MISSING",
      file: relPath,
      detail: `missing ${missing.join(" and ")} marker`,
    });
  }
  if (beginOccurrences.length > 1 || endOccurrences.length > 1) {
    findings.push({
      code: "PROTOCOL_MARKER_DUPLICATE",
      file: relPath,
      detail: `marker appears more than once (BEGIN x${beginOccurrences.length}, END x${endOccurrences.length})`,
    });
  }

  if (frontmatter === null) {
    findings.push({
      code: "PROTOCOL_FRONTMATTER_MISSING",
      file: relPath,
      detail: "file carries a verbatim marker but no YAML front matter",
    });
  } else if (frontmatter.authority_active !== false || !frontmatter.source_heading) {
    findings.push({
      code: "PROTOCOL_FRONTMATTER_INVALID",
      file: relPath,
      detail: "front matter must set authority_active: false and a non-empty source_heading",
    });
  }

  // Nothing further to compare without exactly one marker pair.
  if (beginOccurrences.length !== 1 || endOccurrences.length !== 1) {
    return findings;
  }
  // Nothing further to compare without a usable source_heading.
  if (!frontmatter || !frontmatter.source_heading) {
    return findings;
  }

  const claudeContent = readTextNormalized(join(root, CLAUDE_MD_PATH));
  const claudeLines = claudeContent.split("\n");
  const headingOccurrences = findHeadingOccurrences(claudeLines, frontmatter.source_heading);

  if (headingOccurrences.length === 0) {
    findings.push({
      code: "PROTOCOL_HEADING_NOT_FOUND",
      file: relPath,
      detail: `source_heading not found in CLAUDE.md: ${frontmatter.source_heading}`,
    });
    return findings;
  }
  if (headingOccurrences.length > 1) {
    findings.push({
      code: "PROTOCOL_HEADING_DUPLICATE",
      file: relPath,
      detail: `source_heading found ${headingOccurrences.length} times in CLAUDE.md: ${frontmatter.source_heading}`,
    });
    return findings;
  }

  const expectedLines = extractSection(claudeLines, headingOccurrences[0]);
  const actualLines = trimTrailingBlank(bodyLines.slice(beginOccurrences[0] + 1, endOccurrences[0]));

  const maxLen = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < maxLen; i++) {
    const expected = expectedLines[i];
    const actual = actualLines[i];
    if (expected !== actual) {
      findings.push({
        code: "PROTOCOL_VERBATIM_MISMATCH",
        file: relPath,
        detail: `first differing line ${i + 1}: CLAUDE.md has ${JSON.stringify(expected ?? null)}, ${relPath} has ${JSON.stringify(actual ?? null)}`,
      });
      break;
    }
  }

  return findings;
}

/** Runs the full check across every candidate file under
 * docs/governance/protocols/. */
export function checkAllProtocolExtraction(root) {
  const files = listCandidateProtocolFiles(root);
  const findings = [];
  for (const rel of files) {
    findings.push(...checkProtocolFile(root, rel));
  }
  return { findings, fileCount: files.length };
}
