import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { Parser as CommonMarkParser } from "commonmark";
import { parse as parseYaml } from "yaml";

export const DECISION_CANDIDATE_BANNER =
  "> [!CAUTION]\n" +
  "> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**\n" +
  "> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.";

export const DECISION_INDEX_CANDIDATE_BANNER =
  "> [!CAUTION]\n" +
  "> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**\n" +
  "> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.";

export const DECISION_RECORD_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Repo-native decision record candidate",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "title",
    "status",
    "topic",
    "scope",
    "owner",
    "decided_at",
    "relations",
    "evidence",
    "migration_status",
    "authority_scope",
    "authority_active",
    "phase",
  ],
  properties: {
    id: { type: "string", pattern: "^DEC-[0-9]{8}-[A-Z]$" },
    title: { type: "string", minLength: 1 },
    status: {
      enum: ["proposed", "active", "superseded", "rejected", "retired"],
    },
    topic: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    scope: {
      enum: ["global", "product", "technical", "operational", "design"],
    },
    owner: { enum: ["petter", "codex", "claude"] },
    decided_at: { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    relations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "target"],
        properties: {
          type: {
            enum: ["supersedes", "amends", "interprets", "affirms", "related_to"],
          },
          target: { type: "string", pattern: "^DEC-[0-9]{8}-[A-Z]$" },
        },
      },
    },
    evidence: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    migration_status: { const: "candidate" },
    authority_scope: { const: "none" },
    authority_active: { const: false },
    phase: { const: "M2" },
  },
};

export const DECISION_ID_COLLISION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Historical decision ID collision registry",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "authority_scope",
    "status",
    "complete",
    "phase",
    "authority_active",
    "source_data_source",
    "observed_at",
    "collision_count",
    "source_row_count",
    "collisions",
  ],
  properties: {
    schema_version: { const: 1 },
    authority_scope: { const: "none" },
    status: { const: "candidate" },
    complete: { const: false },
    phase: { const: "M2" },
    authority_active: { const: false },
    source_data_source: { type: "string", pattern: "^collection://" },
    observed_at: { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    collision_count: { type: "integer", minimum: 0 },
    source_row_count: { type: "integer", minimum: 0 },
    collisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "resolution_status", "records"],
        properties: {
          id: { type: "string", pattern: "^DEC-.+" },
          resolution_status: { enum: ["unresolved", "resolved"] },
          resolution_evidence: { type: ["string", "null"] },
          records: {
            type: "array",
            minItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "historical_status", "source_url"],
              properties: {
                title: { type: "string", minLength: 1 },
                historical_status: {
                  enum: ["proposed", "active", "superseded", "rejected", "retired"],
                },
                source_url: { type: "string", pattern: "^https://app\\.notion\\.com/" },
              },
            },
          },
        },
        allOf: [
          {
            if: {
              required: ["resolution_status"],
              properties: { resolution_status: { const: "resolved" } },
            },
            then: {
              required: ["resolution_evidence"],
              properties: { resolution_evidence: { type: "string", minLength: 1 } },
            },
          },
        ],
      },
    },
  },
};

const PROTECTED_HEADINGS = [
  "Decision",
  "Context",
  "Rationale",
  "Consequences",
  "Reversal conditions",
];
const NON_RETIRING_RELATIONS = new Set([
  "amends",
  "interprets",
  "affirms",
  "related_to",
]);
const PROTECTED_HISTORICAL_STATUSES = new Set(["active", "superseded", "retired"]);
const EFFECTIVE_SUPERSEDER_STATUSES = new Set(["active", "superseded", "retired"]);
const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  proposed: new Set(["proposed", "active", "rejected"]),
  active: new Set(["active", "superseded", "retired"]),
  superseded: new Set(["superseded"]),
  rejected: new Set(["rejected"]),
  retired: new Set(["retired"]),
});
const ACYCLIC_RELATIONS = new Set([
  "supersedes",
  "amends",
  "interprets",
  "affirms",
]);
const INVERSE_RELATION = Object.freeze({
  supersedes: "superseded_by",
  amends: "amended_by",
  interprets: "interpreted_by",
  affirms: "affirmed_by",
  related_to: "related_from",
});
const ajv = new Ajv2020({ allErrors: true });
const validateSchema = ajv.compile(DECISION_RECORD_SCHEMA);
const validateCollisionSchema = ajv.compile(DECISION_ID_COLLISION_SCHEMA);
const commonMarkParser = new CommonMarkParser();

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

export function parseDecisionRecord(file, content) {
  const normalized = normalizeNewlines(content);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("front matter is missing or malformed");
  const metadata = parseYaml(match[1]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("front matter must be a mapping");
  }
  return { file, metadata, body: match[2], content: normalized };
}

function semanticText(node) {
  if (node.type === "softbreak" || node.type === "linebreak") return "\n";
  let value = node.literal ?? "";
  for (let child = node.firstChild; child; child = child.next) {
    value += semanticText(child);
  }
  return value;
}

export function protectedDecisionSections(body) {
  const normalized = normalizeNewlines(body);
  const document = commonMarkParser.parse(normalized);
  const headings = [];
  const walker = document.walker();
  let event;
  while ((event = walker.next())) {
    if (!event.entering) continue;
    const { node } = event;
    if (node.type === "html_block" || node.type === "html_inline") return null;
    if (node.type !== "heading" || node.level !== 2) continue;
    headings.push({
      text: semanticText(node),
      topLevel: node.parent === document,
      startLine: node.sourcepos[0][0],
      endLine: node.sourcepos[1][0],
    });
  }
  if (
    headings.length !== PROTECTED_HEADINGS.length ||
    headings.some((heading, index) =>
      !heading.topLevel || heading.text !== PROTECTED_HEADINGS[index]
    )
  ) {
    return null;
  }
  const lines = normalized.split("\n");
  const sections = {};
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index].endLine;
    const end = headings[index + 1] ? headings[index + 1].startLine - 1 : lines.length;
    sections[headings[index].text] = lines.slice(start, end).join("\n").trim();
  }
  return sections;
}

export function readDecisionRecords(root) {
  const directory = resolve(root, "docs/decisions/records");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => /^DEC-.*\.md$/.test(file))
    .sort()
    .map((name) => {
      const file = `docs/decisions/records/${name}`;
      return parseDecisionRecord(file, readFileSync(resolve(root, file), "utf8"));
    });
}

export function readDecisionIdCollisions(root) {
  const file = "docs/decisions/id-collisions.yaml";
  const absolute = resolve(root, file);
  if (!existsSync(absolute)) throw new Error(`${file} is missing`);
  const registry = parseYaml(readFileSync(absolute, "utf8"));
  return { file, registry };
}

function finding(code, path, detail) {
  return { code, path, ...(detail ? { detail } : {}) };
}

function relationConnectsActivePair(recordsById, left, right) {
  const queue = [left.metadata.id];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === right.metadata.id) return true;
    const record = recordsById.get(id);
    if (!record) continue;
    const neighbours = [];
    for (const candidate of recordsById.values()) {
      for (const relation of candidate.metadata.relations ?? []) {
        if (!NON_RETIRING_RELATIONS.has(relation.type)) continue;
        if (candidate.metadata.id === id) neighbours.push(relation.target);
        if (relation.target === id) neighbours.push(candidate.metadata.id);
      }
    }
    for (const neighbour of neighbours) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
  }
  return false;
}

export function validateDecisionIdCollisions(file, registry) {
  const findings = [];
  if (!validateCollisionSchema(registry)) {
    for (const error of validateCollisionSchema.errors ?? []) {
      findings.push(
        finding(
          "DECISION_ID_COLLISION_SCHEMA_INVALID",
          file,
          `${error.instancePath || "/"} ${error.message}`,
        ),
      );
    }
    return findings;
  }
  const seenIds = new Set();
  for (const collision of registry.collisions) {
    if (seenIds.has(collision.id)) {
      findings.push(finding("DECISION_ID_COLLISION_DUPLICATE", file, collision.id));
    }
    seenIds.add(collision.id);
    const urls = collision.records.map((record) => record.source_url);
    if (new Set(urls).size !== urls.length) {
      findings.push(finding("DECISION_ID_COLLISION_SOURCE_DUPLICATE", file, collision.id));
    }
    if (collision.resolution_status === "unresolved" && collision.resolution_evidence) {
      findings.push(finding("DECISION_ID_COLLISION_FALSE_RESOLUTION", file, collision.id));
    }
  }
  if (registry.collision_count !== registry.collisions.length) {
    findings.push(
      finding(
        "DECISION_ID_COLLISION_COUNT_MISMATCH",
        file,
        `${registry.collision_count}/${registry.collisions.length}`,
      ),
    );
  }
  const sourceRows = registry.collisions.reduce(
    (total, collision) => total + collision.records.length,
    0,
  );
  if (registry.source_row_count !== sourceRows) {
    findings.push(
      finding(
        "DECISION_ID_COLLISION_ROW_COUNT_MISMATCH",
        file,
        `${registry.source_row_count}/${sourceRows}`,
      ),
    );
  }
  return findings;
}

export function validateDecisionRecords(records, collisionRegistry = { collisions: [] }) {
  const findings = [];
  const recordsById = new Map();
  const unresolvedCollisionIds = new Set(
    (collisionRegistry.collisions ?? [])
      .filter((collision) => collision.resolution_status === "unresolved")
      .map((collision) => collision.id),
  );

  for (const record of records) {
    if (!validateSchema(record.metadata)) {
      for (const error of validateSchema.errors ?? []) {
        findings.push(
          finding(
            "DECISION_SCHEMA_INVALID",
            record.file,
            `${error.instancePath || "/"} ${error.message}`,
          ),
        );
      }
    }
    const expectedFile = `${record.metadata.id}.md`;
    if (basename(record.file) !== expectedFile) {
      findings.push(finding("DECISION_FILENAME_MISMATCH", record.file, expectedFile));
    }
    if (!record.content.includes(DECISION_CANDIDATE_BANNER)) {
      findings.push(finding("DECISION_CANDIDATE_BANNER_MISSING", record.file));
    }
    const expectedPrefix = `${DECISION_CANDIDATE_BANNER}\n\n## Decision`;
    if (!record.body.trimStart().startsWith(expectedPrefix)) {
      findings.push(finding("DECISION_CANDIDATE_PREAMBLE_INVALID", record.file));
    }
    const sections = protectedDecisionSections(record.body);
    if (!sections) {
      findings.push(finding("DECISION_BODY_SECTIONS_INVALID", record.file));
    } else {
      for (const heading of PROTECTED_HEADINGS) {
        if (!sections[heading]) {
          findings.push(finding("DECISION_BODY_SECTION_EMPTY", record.file, heading));
        }
      }
    }
    const id = record.metadata.id;
    if (unresolvedCollisionIds.has(id)) {
      findings.push(finding("DECISION_ID_COLLISION_IMPORTED", record.file, id));
    }
    if (recordsById.has(id)) {
      findings.push(finding("DECISION_ID_DUPLICATE", record.file, id));
    } else {
      recordsById.set(id, record);
    }
    const seenEdges = new Set();
    for (const relation of record.metadata.relations ?? []) {
      const edge = `${relation.type}:${relation.target}`;
      if (seenEdges.has(edge)) {
        findings.push(finding("DECISION_RELATION_DUPLICATE", record.file, edge));
      }
      seenEdges.add(edge);
      if (relation.target === id) {
        findings.push(finding("DECISION_RELATION_SELF", record.file, edge));
      }
      if (unresolvedCollisionIds.has(relation.target)) {
        findings.push(
          finding("DECISION_RELATION_TARGET_COLLIDED", record.file, relation.target),
        );
      }
    }
  }

  const incomingSupersessions = new Map();
  for (const record of records) {
    for (const relation of record.metadata.relations ?? []) {
      if (
        relation.type !== "supersedes" ||
        !EFFECTIVE_SUPERSEDER_STATUSES.has(record.metadata.status)
      ) continue;
      const sources = incomingSupersessions.get(relation.target) ?? [];
      sources.push(record.metadata.id);
      incomingSupersessions.set(relation.target, sources);
    }
  }
  for (const record of records) {
    if (
      record.metadata.status === "superseded" &&
      !incomingSupersessions.has(record.metadata.id)
    ) {
      findings.push(finding("DECISION_SUPERSEDED_WITHOUT_SOURCE", record.file));
    }
  }

  for (const record of records) {
    for (const relation of record.metadata.relations ?? []) {
      const target = recordsById.get(relation.target);
      if (!target) {
        findings.push(
          finding("DECISION_RELATION_TARGET_MISSING", record.file, relation.target),
        );
        continue;
      }
      if (relation.type === "supersedes" && !["superseded", "retired"].includes(target.metadata.status)) {
        findings.push(
          finding(
            "DECISION_SUPERSESSION_TARGET_NOT_RETIRED",
            record.file,
            `${relation.target}:${target.metadata.status}`,
          ),
        );
      }
      if (
        relation.type === "supersedes" &&
        !EFFECTIVE_SUPERSEDER_STATUSES.has(record.metadata.status)
      ) {
        findings.push(
          finding(
            "DECISION_SUPERSESSION_SOURCE_INEFFECTIVE",
            record.file,
            record.metadata.status,
          ),
        );
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, trail) {
    if (visiting.has(id)) {
      findings.push(finding("DECISION_RELATION_CYCLE", recordsById.get(id)?.file ?? id, [...trail, id].join(" -> ")));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const record = recordsById.get(id);
    for (const relation of record?.metadata.relations ?? []) {
      if (ACYCLIC_RELATIONS.has(relation.type) && recordsById.has(relation.target)) {
        visit(relation.target, [...trail, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of recordsById.keys()) visit(id, []);

  const activeByTopic = new Map();
  for (const record of records) {
    if (record.metadata.status !== "active") continue;
    const topic = record.metadata.topic;
    const group = activeByTopic.get(topic) ?? [];
    group.push(record);
    activeByTopic.set(topic, group);
  }
  for (const [topic, group] of activeByTopic) {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        if (!relationConnectsActivePair(recordsById, group[left], group[right])) {
          findings.push(
            finding(
              "DECISION_MULTIPLE_UNRELATED_ACTIVE_TOPIC",
              group[right].file,
              `${topic}:${group[left].metadata.id},${group[right].metadata.id}`,
            ),
          );
        }
      }
    }
  }

  return findings;
}

export function validateProtectedDecisionChange(previous, next, file) {
  const findings = [];
  const allowedStatuses = ALLOWED_STATUS_TRANSITIONS[previous.metadata.status];
  if (!allowedStatuses?.has(next.metadata.status)) {
    findings.push(
      finding(
        "DECISION_ACTIVE_STATUS_REGRESSION",
        file,
        `${previous.metadata.status}->${next.metadata.status}`,
      ),
    );
  }
  if (!PROTECTED_HISTORICAL_STATUSES.has(previous.metadata.status)) return findings;
  for (const field of [
    "id",
    "title",
    "topic",
    "scope",
    "owner",
    "decided_at",
    "relations",
    "evidence",
  ]) {
    if (JSON.stringify(previous.metadata[field]) !== JSON.stringify(next.metadata[field])) {
      findings.push(finding("DECISION_ACTIVE_METADATA_CHANGED", file, field));
    }
  }
  const before = protectedDecisionSections(previous.body);
  const after = protectedDecisionSections(next.body);
  if (!before || !after) {
    findings.push(finding("DECISION_ACTIVE_BODY_UNPARSEABLE", file));
  } else if (JSON.stringify(before) !== JSON.stringify(after)) {
    findings.push(finding("DECISION_ACTIVE_BODY_CHANGED", file));
  }
  return findings;
}

export const validateActiveBodyChange = validateProtectedDecisionChange;

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export function validateActiveDecisionImmutability(root, records, baseRef = "origin/main") {
  const findings = [];
  let mergeBase;
  try {
    mergeBase = git(root, "merge-base", "HEAD", baseRef);
  } catch (error) {
    return [finding("DECISION_MERGE_BASE_UNAVAILABLE", ".", error.message)];
  }
  let baseFiles = [];
  try {
    baseFiles = git(root, "ls-tree", "-r", "--name-only", mergeBase, "--", "docs/decisions/records")
      .split("\n")
      .filter((file) => /^docs\/decisions\/records\/DEC-.*\.md$/.test(file));
  } catch (error) {
    return [finding("DECISION_BASE_RECORDS_UNAVAILABLE", ".", error.message)];
  }
  const currentByFile = new Map(records.map((record) => [record.file, record]));
  for (const file of baseFiles) {
    let previous;
    try {
      previous = parseDecisionRecord(file, git(root, "show", `${mergeBase}:${file}`));
    } catch (error) {
      findings.push(finding("DECISION_BASE_RECORD_INVALID", file, error.message));
      continue;
    }
    const next = currentByFile.get(file);
    if (!next) {
      findings.push(
        finding(
          PROTECTED_HISTORICAL_STATUSES.has(previous.metadata.status)
            ? "DECISION_ACTIVE_RECORD_REMOVED"
            : "DECISION_RECORD_REMOVED",
          file,
        ),
      );
      continue;
    }
    findings.push(...validateProtectedDecisionChange(previous, next, file));
  }
  return findings;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function code(value) {
  return "`" + value + "`";
}

export function generateDecisionIndex(records, collisionRegistry = { collisions: [] }) {
  const errors = validateDecisionRecords(records, collisionRegistry);
  if (errors.length > 0) {
    throw new Error(errors.map((item) => `${item.code} ${item.path}${item.detail ? ` ${item.detail}` : ""}`).join("; "));
  }
  const sorted = [...records].sort((left, right) =>
    left.metadata.decided_at.localeCompare(right.metadata.decided_at) ||
    left.metadata.id.localeCompare(right.metadata.id),
  );
  const verifiedAt = sorted.map((record) => record.metadata.decided_at).sort().at(-1) ?? "2026-09-01";
  const active = sorted.filter((record) => record.metadata.status === "active");
  const inactive = sorted.filter((record) => record.metadata.status !== "active");
  const inverseRows = [];
  for (const source of sorted) {
    for (const relation of source.metadata.relations) {
      inverseRows.push({
        target: relation.target,
        inverse: INVERSE_RELATION[relation.type],
        source: source.metadata.id,
      });
    }
  }
  inverseRows.sort((left, right) =>
    left.target.localeCompare(right.target) || left.inverse.localeCompare(right.inverse) || left.source.localeCompare(right.source),
  );
  const link = (id) => `[${code(id)}](../decisions/records/${id}.md)`;
  const table = (items) => items.length === 0
    ? "_None._"
    : [
        "| Decision | Status | Topic | Scope | Owner | Decided |",
        "|---|---|---|---|---|---|",
        ...items.map((record) => `| ${link(record.metadata.id)} — ${escapeCell(record.metadata.title)} | ${record.metadata.status} | ${code(record.metadata.topic)} | ${record.metadata.scope} | ${record.metadata.owner} | ${record.metadata.decided_at} |`),
      ].join("\n");
  const inverseTable = inverseRows.length === 0
    ? "_None._"
    : [
        "| Target | Generated inverse | Source |",
        "|---|---|---|",
        ...inverseRows.map((row) => `| ${link(row.target)} | ${code(row.inverse)} | ${link(row.source)} |`),
      ].join("\n");
  const unresolvedCollisions = (collisionRegistry.collisions ?? [])
    .filter((collision) => collision.resolution_status === "unresolved")
    .sort((left, right) => left.id.localeCompare(right.id));
  const collisionTable = unresolvedCollisions.length === 0
    ? "_None._"
    : [
        "| Historical ID | Source rows | Status |",
        "|---|---:|---|",
        ...unresolvedCollisions.map((collision) => `| ${code(collision.id)} | ${collision.records.length} | excluded pending resolution |`),
      ].join("\n");
  return `---\ndoc_type: generated-decision-index\nauthority_scope: none\nstatus: candidate\ncomplete: false\nphase: M2\nm1_template: false\nauthority_active: false\nverified_at: ${verifiedAt}\ngenerated: true\n---\n\n# Decision Index (Candidate)\n\n${DECISION_INDEX_CANDIDATE_BANNER}\n\n**PARTIAL GENERATED VIEW — ${code("complete: false")}.** The statuses below reproduce the formal decisions; they do not activate this index as project authority. Generated from ${code("docs/decisions/records/DEC-*.md")}.\n\n## Active decisions\n\n${table(active)}\n\n## Non-active decisions\n\n${table(inactive)}\n\n## Generated inverse relationships\n\n${inverseTable}\n\n## Unresolved historical ID collisions\n\nThese IDs are excluded from both formal records and relation targets until their conflicting source rows are reconciled. Source details are preserved in ${code("docs/decisions/id-collisions.yaml")}.\n\n${collisionTable}\n`;
}

export function decisionGeneratedFiles(root) {
  const records = readDecisionRecords(root);
  const collisions = readDecisionIdCollisions(root);
  return {
    "docs/project/DECISIONS.md": generateDecisionIndex(records, collisions.registry),
    "docs/project/schemas/decision-record.schema.json": `${JSON.stringify(DECISION_RECORD_SCHEMA, null, 2)}\n`,
    "docs/project/schemas/decision-id-collisions.schema.json": `${JSON.stringify(DECISION_ID_COLLISION_SCHEMA, null, 2)}\n`,
  };
}

export function validateDecisionRepository(root, records = readDecisionRecords(root)) {
  const collisions = readDecisionIdCollisions(root);
  return [
    ...validateDecisionIdCollisions(collisions.file, collisions.registry),
    ...validateDecisionRecords(records, collisions.registry),
    ...validateActiveDecisionImmutability(root, records),
  ];
}
