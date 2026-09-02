// Pure functions behind the T12 research contract (docs/research/*.md).
// Spec: archive/sessions/2026-09-02-t12-research-contract-plan.md
//
// Mirrors the shape of program-tracks-lib.mjs and decision-records-lib.mjs:
// Ajv 2020 schema validation for structure, hand-written checks for
// relations a schema cannot see (reciprocal supersession, one current file
// per topic, resolvable links, active decisions citing only current
// research, the ideas-file line shape).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { isCalendarDate, repoRootFrom, trackedFiles } from "./program-tracks-lib.mjs";

export { repoRootFrom, trackedFiles };

function slash(value) {
  return value.split(sep).join("/");
}

/** True when this module was invoked directly (`node scripts/x.mjs`), not imported. */
export function isDirectInvocation(importMetaUrl) {
  if (!process.argv[1]) return false;
  const invoked = slash(resolve(process.argv[1])).toLowerCase();
  const modulePath = slash(new URL(importMetaUrl).pathname.replace(/^\/([A-Za-z]:)/, "$1")).toLowerCase();
  return invoked === modulePath;
}

export const RESEARCH_DIR = "docs/research";
export const SCHEMA_PATH = "docs/research/research.schema.json";
export const README_PATH = "docs/research/README.md";
export const IDEAS_PATH = "docs/company/IDEAS.md";
export const WARN_DIRS = ["docs/strategy", "docs/audits", "docs/diligence"];

const FILENAME_PATTERN = /^(\d{4}-\d{2}-\d{2})-[a-z0-9][a-z0-9-]*\.md$/;
const IDEAS_LINE = /^- (\d{4}-\d{2}-\d{2}) · (inbox|considered|promoted|dropped) · (.+?)(?: · → (.+))?$/;
const DEC_ID_PATTERN = /^DEC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

/** File names under docs/research/ that end in .md, top-level only (data subfolders + JSON ignored). README.md is the generated index, not a research file. */
export function listResearchFiles(root) {
  const dir = resolve(root, RESEARCH_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md") && d.name !== "README.md")
    .map((d) => d.name)
    .sort();
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

/** Parses `---\nYAML\n---\nbody` front matter. Throws if missing/malformed. */
export function parseFrontMatter(content) {
  const normalized = normalizeNewlines(content);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("front matter is missing or malformed");
  const metadata = parseYaml(match[1]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("front matter must be a mapping");
  }
  return { metadata, body: match[2] };
}

/**
 * Loads every docs/research/*.md file. Returns
 * { file, metadata: null|object, body: string, error: null|string }
 * per file — parse errors are captured as findings, not thrown, so one
 * broken file doesn't stop the whole check.
 */
export function loadResearchFiles(root) {
  return listResearchFiles(root).map((name) => {
    const file = `${RESEARCH_DIR}/${name}`;
    const content = readFileSync(resolve(root, file), "utf8");
    try {
      const { metadata, body } = parseFrontMatter(content);
      return { file, name, metadata, body, error: null };
    } catch (err) {
      return { file, name, metadata: null, body: "", error: err.message };
    }
  });
}

/** True for a file name matching YYYY-MM-DD-<slug>.md with a real calendar date. */
export function isValidResearchFilename(name) {
  const match = FILENAME_PATTERN.exec(name);
  if (!match) return false;
  return isCalendarDate(match[1]);
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** True when a source/link target is a URL (or other external scheme) rather than a repo path. */
export function isExternalReference(target) {
  return URL_SCHEME.test(target);
}

/**
 * Resolves a non-URL reference relative to `fromDir` (a repo-relative
 * directory) against the repo root, and classifies it: MISSING, NOT_A_FILE,
 * UNTRACKED, or OK. Strips a trailing #fragment before resolving.
 */
export function classifyRepoReference(root, fromDir, target, tracked) {
  const withoutFragment = target.split("#")[0];
  if (!withoutFragment) return "OK"; // pure #anchor within the same doc
  const normalized = withoutFragment.replace(/\\/g, "/");
  const absolute = resolve(root, fromDir, normalized);
  if (!existsSync(absolute)) return "MISSING";
  if (!statSync(absolute).isFile()) return "NOT_A_FILE";
  if (tracked) {
    const relative = absolute.slice(resolve(root).length + 1).replace(/\\/g, "/");
    if (!tracked.has(relative)) return "UNTRACKED";
  }
  return "OK";
}

/**
 * Resolves a markdown link target: repo docs conventionally write both
 * doc-relative links ("../../apps/api/foo.ts") and repo-root-relative links
 * ("apps/api/foo.ts", no prefix — common when a path is written for
 * copy-paste/search rather than true relative navigation). Accepted if
 * either base resolves.
 */
export function classifyLinkTarget(root, fromDir, target, tracked) {
  const viaFromDir = classifyRepoReference(root, fromDir, target, tracked);
  if (viaFromDir === "OK") return "OK";
  const viaRoot = classifyRepoReference(root, ".", target, tracked);
  if (viaRoot === "OK") return "OK";
  // Prefer the more specific problem when both fail identically; MISSING beats a
  // less informative code so the message points at "not found" over "not a file".
  return viaFromDir === "MISSING" ? viaRoot : viaFromDir;
}

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Extracts markdown link targets (`[text](target)`) from a body. */
export function extractMarkdownLinks(body) {
  const out = [];
  let m;
  const re = new RegExp(MARKDOWN_LINK);
  while ((m = re.exec(body))) out.push(m[1]);
  return out;
}

/**
 * Validates one research record's front matter against the schema. Returns
 * a list of finding strings (empty means valid).
 */
export function validateFrontMatterSchema(metadata, schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (validate(metadata)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`);
}

/**
 * Full per-file structural + relational check. `records` is the full loaded
 * set (loadResearchFiles output) so relation checks (topic index,
 * supersession) can be done once by the caller and passed in via `byName`
 * and `topicCurrentCounts` — see checkAllResearch for the orchestration.
 */
export function checkResearchFile(root, record, { schema, tracked, byName }) {
  const findings = [];
  const add = (code, detail) => findings.push({ code, file: record.file, detail });

  if (!isValidResearchFilename(record.name)) {
    add("FILENAME_INVALID", `${record.name} does not match YYYY-MM-DD-<slug>.md with a real calendar date`);
  }

  if (record.error) {
    add("FRONT_MATTER_MISSING", record.error);
    return findings; // nothing else to check without parsed front matter
  }

  const schemaErrors = validateFrontMatterSchema(record.metadata, schema);
  for (const e of schemaErrors) add("FRONT_MATTER_INVALID", e);
  if (schemaErrors.length > 0) return findings; // structure broken; relation checks would be noise

  const meta = record.metadata;

  // Supersession relations.
  if (meta.status === "superseded") {
    const target = byName.get(meta.superseded_by);
    if (!target) {
      add("DANGLING_SUPERSEDED_BY", `${record.name}: superseded_by ${meta.superseded_by} does not exist — fix: point superseded_by at an existing docs/research file, or drop it and set status to current/historical`);
    } else if (!Array.isArray(target.metadata?.supersedes) || !target.metadata.supersedes.includes(record.name)) {
      add("NON_RECIPROCAL_SUPERSESSION", `${record.name} names superseded_by ${meta.superseded_by}, but that file's supersedes does not list ${record.name} back — fix: add ${record.name} to ${meta.superseded_by}'s supersedes array`);
    }
  }
  for (const target of meta.supersedes ?? []) {
    const targetRecord = byName.get(target);
    if (!targetRecord) {
      add("DANGLING_SUPERSEDES", `${record.name}: supersedes names ${target}, which does not exist — fix: remove it from supersedes or correct the file name`);
      continue;
    }
    if (targetRecord.metadata?.status === "historical") {
      add("SUPERSEDES_HISTORICAL", `${record.name} claims to supersede ${target}, but ${target} is historical (not superseded) — fix: historical files stand alone; remove ${target} from supersedes, or change ${target}'s status to superseded with superseded_by: ${record.name}`);
      continue;
    }
    if (targetRecord.metadata?.status !== "superseded" || targetRecord.metadata?.superseded_by !== record.name) {
      add("NON_RECIPROCAL_SUPERSESSION", `${record.name} lists ${target} in supersedes, but ${target} is not status:superseded with superseded_by: ${record.name} — fix: set ${target}'s status to superseded and superseded_by to ${record.name}`);
    }
  }

  // Markdown links in the body must resolve (repo-relative only; URLs are not fetched).
  for (const link of extractMarkdownLinks(record.body)) {
    if (isExternalReference(link)) continue;
    const problem = classifyLinkTarget(root, RESEARCH_DIR, link, tracked);
    if (problem !== "OK") {
      add("DANGLING_LINK", `${record.name}: link target "${link}" is ${problem} — fix: correct the relative path or remove the link`);
    }
  }

  // sources: repo-path entries must resolve; URLs are accepted as-is.
  for (const source of meta.sources ?? []) {
    if (isExternalReference(source)) continue;
    const problem = classifyRepoReference(root, ".", source, tracked);
    if (problem !== "OK") {
      add("DANGLING_SOURCE", `${record.name}: sources entry "${source}" is ${problem} — fix: correct the repo path or use the actual URL`);
    }
  }

  return findings;
}

/** Detects a cycle in the superseded_by chain starting from every superseded record. */
export function findSupersessionCycles(byName) {
  const findings = [];
  const state = new Map();
  const visit = (name, stack) => {
    if (!name || state.get(name) === "done") return;
    if (state.get(name) === "visiting") {
      findings.push({ code: "SUPERSESSION_CYCLE", file: `${RESEARCH_DIR}/${name}`, detail: `cycle: ${[...stack, name].join(" -> ")} — fix: break the cycle so supersession forms a chain, not a loop` });
      return;
    }
    const record = byName.get(name);
    if (!record || record.metadata?.status !== "superseded") return;
    state.set(name, "visiting");
    visit(record.metadata.superseded_by, [...stack, name]);
    state.set(name, "done");
  };
  for (const name of byName.keys()) visit(name, []);
  return findings;
}

/** More than one status:current file per topic. */
export function findMultipleCurrentPerTopic(records) {
  const findings = [];
  const byTopic = new Map();
  for (const r of records) {
    if (r.error || !r.metadata || r.metadata.status !== "current") continue;
    const topic = r.metadata.topic;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(r.name);
  }
  for (const [topic, names] of byTopic) {
    if (names.length > 1) {
      findings.push({
        code: "MULTIPLE_CURRENT_PER_TOPIC",
        file: `${RESEARCH_DIR}/${names[0]}`,
        detail: `topic "${topic}" has ${names.length} status:current files: ${names.join(", ")} — fix: mark all but one superseded (with superseded_by pointing at the survivor) or historical`,
      });
    }
  }
  return findings;
}

/** Active decision records (docs/decisions/records/*.md) whose evidence cites non-current research. */
export function findActiveDecisionsCitingNonCurrentResearch(root, byName) {
  const findings = [];
  const dir = resolve(root, "docs/decisions/records");
  if (!existsSync(dir)) return findings;
  for (const name of readdirSync(dir).filter((f) => /^DEC-.*\.md$/.test(f))) {
    const file = `docs/decisions/records/${name}`;
    let metadata;
    try {
      ({ metadata } = parseFrontMatter(readFileSync(resolve(root, file), "utf8")));
    } catch {
      continue; // decision-records-lib's own checker owns malformed decision records
    }
    if (metadata.status !== "active") continue;
    for (const ev of metadata.evidence ?? []) {
      const match = /^docs\/research\/([^/]+\.md)$/.exec(ev);
      if (!match) continue;
      const researchName = match[1];
      const researchRecord = byName.get(researchName);
      const status = researchRecord?.metadata?.status;
      if (!researchRecord || status !== "current") {
        findings.push({
          code: "ACTIVE_DECISION_CITES_NONCURRENT_RESEARCH",
          file,
          detail: `${name} (active) cites ${ev} (status: ${status ?? "missing"}) — fix: cite the current file on that topic, or update the decision's evidence`,
        });
      }
    }
  }
  return findings;
}

/**
 * Parses one docs/company/IDEAS.md line. Only lines starting with "- " are
 * treated as idea-entry candidates (everything else — headings, prose,
 * blank lines — is documentation around the list, not data). Returns null
 * for a non-candidate line, or {malformed, date, status, text, target, raw}.
 */
const IDEA_LINE_CANDIDATE = /^-\s+\d/;
export function parseIdeaLine(line) {
  if (!IDEA_LINE_CANDIDATE.test(line.trimStart())) return null;
  const match = IDEAS_LINE.exec(line);
  if (!match) return { malformed: true, raw: line };
  const [, date, status, text, target] = match;
  return { malformed: false, date, status, text, target: target ?? null, raw: line };
}

/**
 * Lines of `content`, with fenced code blocks (```...```) removed — the
 * IDEAS.md header documents the line shape inside a fence, and that
 * example line must not be checked as a real entry.
 */
function stripFencedCodeBlocks(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(null); // keep line numbering aligned; fence delimiter itself is never an idea line
      continue;
    }
    out.push(inFence ? null : line);
  }
  return out;
}

/** Validates docs/company/IDEAS.md line shape and promoted-target existence. */
export function checkIdeasFile(root, byName) {
  const findings = [];
  const absolute = resolve(root, IDEAS_PATH);
  if (!existsSync(absolute)) return findings; // generator/migration ensures it exists; nothing to check if truly absent
  const lines = stripFencedCodeBlocks(readFileSync(absolute, "utf8"));
  lines.forEach((line, i) => {
    if (line === null) return;
    const parsed = parseIdeaLine(line);
    if (!parsed) return;
    const lineNo = i + 1;
    if (parsed.malformed) {
      findings.push({
        code: "MALFORMED_IDEAS_LINE",
        file: IDEAS_PATH,
        detail: `line ${lineNo}: "${parsed.raw}" does not match "- YYYY-MM-DD · status · text [· → target]" — fix: match the line shape documented at the top of the file`,
      });
      return;
    }
    if (!isCalendarDate(parsed.date)) {
      findings.push({ code: "MALFORMED_IDEAS_LINE", file: IDEAS_PATH, detail: `line ${lineNo}: "${parsed.date}" is not a real calendar date` });
    }
    if (parsed.status === "promoted") {
      if (!parsed.target) {
        findings.push({
          code: "PROMOTED_IDEA_MISSING_TARGET",
          file: IDEAS_PATH,
          detail: `line ${lineNo}: status is promoted but names no target — fix: add "· → <research file or DEC id>"`,
        });
        return;
      }
      const targetOk = DEC_ID_PATTERN.test(parsed.target) ? decisionRecordExists(root, parsed.target) : byName.has(parsed.target);
      if (!targetOk) {
        findings.push({
          code: "PROMOTED_IDEA_DANGLING_TARGET",
          file: IDEAS_PATH,
          detail: `line ${lineNo}: promoted target "${parsed.target}" names nothing that exists — fix: point it at an existing docs/research file or DEC id`,
        });
      }
    }
  });
  return findings;
}

function decisionRecordExists(root, decId) {
  const dir = resolve(root, "docs/decisions/records");
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f === `${decId}.md` || f.startsWith(`${decId}--`));
}

/** Warnings (not failures): research-looking files outside the contract. */
export function findResearchLookingFilesOutsideContract(root) {
  const findings = [];
  const HEADING_RE = /^#{1,3}\s+.*(research|audit|evaluation|benchmark).*$/im;
  for (const dir of WARN_DIRS) {
    const absolute = resolve(root, dir);
    if (!existsSync(absolute)) continue;
    for (const name of readdirSync(absolute).filter((f) => f.endsWith(".md"))) {
      const content = readFileSync(resolve(absolute, name), "utf8");
      if (HEADING_RE.test(content)) {
        findings.push({
          code: "RESEARCH_LOOKING_FILE_OUTSIDE_CONTRACT",
          file: `${dir}/${name}`,
          detail: `looks like research (heading matches research/audit/evaluation/benchmark) but lives outside docs/research — consider migrating it into the research contract`,
        });
      }
    }
  }
  return findings;
}

/**
 * Runs every check and returns { failures, warnings }. This is the single
 * entry point check-research.mjs calls.
 */
export function checkAllResearch(root) {
  const schema = loadSchema(root);
  const tracked = trackedFiles(root);
  const records = loadResearchFiles(root);
  const byName = new Map(records.map((r) => [r.name, r]));

  const failures = [];
  for (const record of records) {
    failures.push(...checkResearchFile(root, record, { schema, tracked, byName }));
  }
  failures.push(...findMultipleCurrentPerTopic(records));
  failures.push(...findSupersessionCycles(byName));
  failures.push(...findActiveDecisionsCitingNonCurrentResearch(root, byName));
  failures.push(...checkIdeasFile(root, byName));

  const warnings = findResearchLookingFilesOutsideContract(root);

  return { failures, warnings, records };
}
