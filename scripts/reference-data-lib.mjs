// Reference-data register (robustness R2): config/reference-data.yaml lists every
// reference dataset hard-coded into the tools (FATF and EU lists, VAT and tax
// rates, legal deadlines, code lists), where each comes from, when it was last
// checked against that source and when it is next due.
//
// Two modes, kept apart on purpose:
//   structural  (PR CI)        the register agrees with the code. Never depends on
//                              today's date, so the passage of time cannot turn
//                              every PR red. That happened once: codex:check failed
//                              on main from 2026-09-07 to 2026-09-10 and blocked
//                              every PR in the repository (DEC-20260910-A).
//   due         (weekly-drift) rows whose check date has passed. Lands in the
//                              weekly drift issue, never in PR CI.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const REGISTER_PATH = "config/reference-data.yaml";
export const HARM = new Set(["A", "B", "C", "D"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// A date constant that labels a dataset: FATF_LISTS_AS_OF, PRICING_VERIFIED_ON.
const DATE_CONST = /\bconst\s+([A-Z][A-Z0-9_]*(?:_AS_OF|_VERIFIED_ON))\s*(?::\s*string\s*)?=\s*"(\d{4}-\d{2}-\d{2})"/g;
// Where the date constants live. Tests are excluded: they pin dates, they do not own them.
export const SCAN_ROOTS = ["apps/api/src"];

export function repoRootFrom(metaUrl) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "..");
}

export function loadRegister(root) {
  const text = fs.readFileSync(path.join(root, REGISTER_PATH), "utf8");
  return YAML.parse(text);
}

function isDate(s) {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The date by which a row must next be checked against its source.
// A dated row is due review_days after it was last checked: checked_on when the
// row has one (the as_of constant then dates the source's own version, such as
// a FATF plenary), otherwise as_of.
export function dueDate(row) {
  const checked = isDate(row.checked_on) ? row.checked_on : row.as_of;
  if (isDate(checked) && Number.isInteger(row.review_days)) return addDays(checked, row.review_days);
  if (isDate(row.first_review_by)) return row.first_review_by;
  return null;
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "__fixtures__") continue;
      walk(p, out);
    } else if (/\.(ts|mts|mjs|js)$/.test(ent.name) && !/\.test\.|\.spec\./.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

// Every dataset date constant in the scanned code: [{ file, name, value }].
export function findDateConstants(root) {
  const found = [];
  for (const r of SCAN_ROOTS) {
    const abs = path.join(root, r);
    if (!fs.existsSync(abs)) continue;
    for (const f of walk(abs, [])) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(DATE_CONST)) {
        found.push({ file: path.relative(root, f).split(path.sep).join("/"), name: m[1], value: m[2] });
      }
    }
  }
  return found;
}

// Structural findings. `today` is used only to refuse an as_of in the future.
export function checkRegister(root, register, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const findings = [];
  const add = (code, at, detail) => findings.push({ code, file: REGISTER_PATH, detail: `${at}: ${detail}` });
  if (!register || register.version !== 1 || !Array.isArray(register.datasets)) {
    add("REFDATA_SCHEMA", "root", "expected `version: 1` and a `datasets` list");
    return { findings, rows: [] };
  }
  const rows = register.datasets;
  const ids = new Set();
  const fileText = new Map();
  const read = (rel) => {
    if (!fileText.has(rel)) {
      const abs = path.join(root, rel);
      fileText.set(rel, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null);
    }
    return fileText.get(rel);
  };

  rows.forEach((row, i) => {
    const at = `datasets[${i}]${row?.id ? ` (${row.id})` : ""}`;
    if (!row || typeof row !== "object") return add("REFDATA_SCHEMA", at, "row must be a mapping");
    if (typeof row.id !== "string" || !ID.test(row.id)) add("REFDATA_SCHEMA", at, "id must be kebab-case");
    else if (ids.has(row.id)) add("REFDATA_DUPLICATE_ID", at, `id ${row.id} is used twice`);
    else ids.add(row.id);
    for (const k of ["file", "symbol", "holds", "recheck_against", "trigger"]) {
      if (typeof row[k] !== "string" || !row[k].trim()) add("REFDATA_SCHEMA", at, `${k} is required`);
    }
    if (!HARM.has(row.harm)) add("REFDATA_SCHEMA", at, "harm must be A, B, C or D");
    if (!Array.isArray(row.tools) || row.tools.some((t) => typeof t !== "string" || !ID.test(t))) {
      add("REFDATA_SCHEMA", at, "tools must be a list of tool slugs (empty for shared code)");
    }
    if (typeof row.active !== "boolean") add("REFDATA_SCHEMA", at, "active must be true or false");
    if (!Number.isInteger(row.review_days) || row.review_days < 1) add("REFDATA_SCHEMA", at, "review_days must be a whole number, at least 1");
    if (row.source !== null && (typeof row.source !== "string" || !row.source.trim())) {
      add("REFDATA_SCHEMA", at, "source must be text or null (none stated)");
    }

    if (row.as_of === null || row.as_of === undefined) {
      if (!isDate(row.first_review_by)) add("REFDATA_SCHEMA", at, "an undated row needs first_review_by (YYYY-MM-DD): when it is first checked against its source");
      if (row.as_of_symbol) add("REFDATA_SCHEMA", at, "as_of_symbol needs as_of");
      if (row.checked_on !== undefined) add("REFDATA_SCHEMA", at, "checked_on needs as_of");
    } else {
      if (!isDate(row.as_of)) add("REFDATA_SCHEMA", at, "as_of must be a YYYY-MM-DD date or null");
      else if (row.as_of > today) add("REFDATA_AS_OF_FUTURE", at, `as_of ${row.as_of} is after today (${today})`);
      if (typeof row.evidence !== "string" || !row.evidence.trim()) add("REFDATA_SCHEMA", at, "a dated row needs evidence: the PR or file that records the check");
      if (row.checked_on !== undefined) {
        if (!isDate(row.checked_on)) add("REFDATA_SCHEMA", at, "checked_on must be a YYYY-MM-DD date");
        else if (isDate(row.as_of) && row.checked_on < row.as_of) add("REFDATA_SCHEMA", at, `checked_on ${row.checked_on} is before the source version as_of ${row.as_of}`);
        else if (row.checked_on > today) add("REFDATA_AS_OF_FUTURE", at, `checked_on ${row.checked_on} is after today (${today})`);
      }
      if (row.first_review_by !== undefined) add("REFDATA_SCHEMA", at, "first_review_by is only for undated rows; drop it once as_of is set");
    }

    for (const slug of Array.isArray(row.tools) ? row.tools : []) {
      if (typeof slug === "string" && !fs.existsSync(path.join(root, "manifests", `${slug}.yaml`))) {
        add("REFDATA_UNKNOWN_TOOL", at, `no manifests/${slug}.yaml; a renamed or removed tool must be updated here`);
      }
    }

    if (typeof row.file !== "string") return;
    const text = read(row.file);
    if (text === null) return add("REFDATA_FILE_MISSING", at, `${row.file} does not exist`);
    if (typeof row.symbol === "string" && !text.includes(row.symbol)) {
      add("REFDATA_SYMBOL_MISSING", at, `${row.symbol} does not appear in ${row.file}`);
    }
    if (row.as_of_symbol) {
      const m = [...text.matchAll(DATE_CONST)].find((x) => x[1] === row.as_of_symbol);
      if (!m) add("REFDATA_AS_OF_SYMBOL_MISSING", at, `no date constant ${row.as_of_symbol} in ${row.file}`);
      else if (m[2] !== row.as_of) {
        add("REFDATA_AS_OF_MISMATCH", at, `${row.as_of_symbol} is ${m[2]} in the code but as_of is ${row.as_of}; update both in the same change`);
      }
    }
  });

  // The reverse direction: a dated dataset in the code must be registered.
  const named = new Set(rows.filter((r) => r?.as_of_symbol).map((r) => `${r.file}#${r.as_of_symbol}`));
  for (const c of findDateConstants(root)) {
    if (!named.has(`${c.file}#${c.name}`)) {
      findings.push({
        code: "REFDATA_UNREGISTERED_DATE",
        file: c.file,
        detail: `${c.name} = ${c.value} labels a dataset that has no row in ${REGISTER_PATH} with as_of_symbol ${c.name}`,
      });
    }
  }
  return { findings, rows };
}

// Rows whose next check is due on or before `today`. Inactive tools are skipped.
export function dueRows(rows, today) {
  const due = [];
  for (const row of rows) {
    if (!row || row.active === false) continue;
    const d = dueDate(row);
    if (d && d <= today) {
      due.push({
        id: row.id,
        harm: row.harm,
        due: d,
        kind: row.as_of ? "overdue" : "never checked",
        as_of: row.as_of ?? null,
        checked_on: row.checked_on ?? row.as_of ?? null,
        recheck_against: row.recheck_against,
        file: row.file,
      });
    }
  }
  const rank = { A: 0, B: 1, C: 2, D: 3 };
  return due.sort((a, b) => rank[a.harm] - rank[b.harm] || a.due.localeCompare(b.due));
}
