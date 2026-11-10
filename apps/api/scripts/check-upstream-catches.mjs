#!/usr/bin/env node
/**
 * Promise-audit T1: prevent new silent catch handlers in capability sources.
 * This is a conservative syntax guard, not proof of billability or upstream
 * correctness. A log satisfies the audit's observability rule, not a refund rule.
 * Existing findings are debt, never approval. Their exact fingerprints and
 * multiplicities must match the baseline, which cannot grow against the merge
 * base. On first adoption the ceiling is derived from that base's source tree.
 * No executors, credentials, network calls or production data are loaded.
 */
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE = 'apps/api/src/capabilities';
export const BASELINE = 'apps/api/scripts/upstream-catch-baseline.json';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const key = (entry) => `${entry.file}:${entry.fingerprint}`;
const sourceFile = (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts');

function tokens(node, source) {
  const out = [];
  function visit(part) {
    if (part.kind >= ts.SyntaxKind.FirstJSDocNode && part.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = part.getChildren(source);
    if (children.length) children.forEach(visit);
    else if (part.kind !== ts.SyntaxKind.SyntaxList) out.push([part.kind, part.getText(source).replace(/\r\n/g, '\n')]);
  }
  visit(node);
  return JSON.stringify(out);
}

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}

function member(node) {
  node = unwrap(node);
  if (node && ts.isPropertyAccessExpression(node)) return { receiver: node.expression, name: node.name.text };
  if (node && ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    return { receiver: node.expression, name: node.argumentExpression.text };
  }
  return null;
}

function logged(node) {
  node = unwrap(node);
  if (!node || !ts.isCallExpression(node)) return false;
  const callee = unwrap(node.expression);
  if (node.questionDotToken || callee.questionDotToken) return false;
  if (ts.isIdentifier(callee)) return ['logError', 'logWarn', 'logInfo'].includes(callee.text);
  const prop = member(callee);
  return prop && ts.isIdentifier(prop.receiver) && ['log', 'logger', 'console'].includes(prop.receiver.text) &&
    ['error', 'warn', 'info', 'debug', 'log', 'fatal'].includes(prop.name);
}

function rejected(node) {
  node = unwrap(node);
  if (!node || !ts.isCallExpression(node)) return false;
  if (node.questionDotToken || unwrap(node.expression).questionDotToken) return false;
  const prop = member(node.expression);
  return prop?.name === 'reject' && ts.isIdentifier(prop.receiver) && prop.receiver.text === 'Promise';
}

function marked(node) {
  node = unwrap(node);
  if (!node || !ts.isObjectLiteralExpression(node)) return false;
  // Only direct literal markers count; nested examples and later spreads cannot
  // waive a handler. The billing contract is verified separately by replay tests.
  if (node.properties.some(ts.isSpreadAssignment)) return false;
  const nameOf = (p) => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
  if (node.properties.some((p) => p.name && ts.isComputedPropertyName(p.name))) return false;
  return node.properties.some((p) => ts.isPropertyAssignment(p) &&
    ['unavailable', 'skipped'].includes(nameOf(p)) &&
    unwrap(p.initializer)?.kind === ts.SyntaxKind.TrueKeyword &&
    node.properties.filter((q) => nameOf(q) === nameOf(p)).length === 1);
}

/** Track the small, explicit control-flow forms we can prove locally. */
function flow(statement, states) {
  if (!states.length) return { states, unsafe: false };
  if (ts.isBlock(statement)) {
    let unsafe = false;
    for (const child of statement.statements) {
      const next = flow(child, states);
      states = next.states; unsafe ||= next.unsafe;
    }
    return { states, unsafe };
  }
  if (ts.isThrowStatement(statement)) return { states: [], unsafe: false };
  if (ts.isReturnStatement(statement)) return {
    states: [], unsafe: states.includes(false) && !marked(statement.expression) &&
      !rejected(statement.expression) && !logged(statement.expression),
  };
  if (ts.isIfStatement(statement)) {
    const yes = flow(statement.thenStatement, states);
    const no = statement.elseStatement ? flow(statement.elseStatement, states) : { states, unsafe: false };
    return { states: [...new Set([...yes.states, ...no.states])], unsafe: yes.unsafe || no.unsafe };
  }
  if (ts.isExpressionStatement(statement) && logged(statement.expression)) return { states: [true], unsafe: false };
  if (ts.isVariableStatement(statement) || ts.isExpressionStatement(statement) ||
    ts.isFunctionDeclaration(statement) || ts.isEmptyStatement(statement)) return { states, unsafe: false };
  // Loops, switch, nested try/finally and other complex transfers are not proved
  // by the guard. They need an explicit, handler-local reviewed exception.
  return { states, unsafe: states.includes(false) };
}

function reasonFor(handler, body, source) {
  const positions = [handler.pos];
  if (body && ts.isBlock(body)) positions.push(body.getStart(source) + 1);
  for (const pos of positions) {
    const comments = [...(ts.getLeadingCommentRanges(source.text, pos) ?? []), ...(ts.getTrailingCommentRanges(source.text, pos) ?? [])];
    for (const c of comments) {
      if (c.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
      const match = source.text.slice(c.pos, c.end).match(/^\/\/\s*degraded-ok:\s*(\S.*)$/);
      if (match) return match[1].trim();
    }
  }
  return null;
}

export function scanSource(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) throw new Error(`${file}: source parse failed; cannot certify catches`);
  const findings = [], waived = [];
  let handlers = 0;
  function inspect(handler, body, anchor, kind) {
    handlers++;
    const line = source.getLineAndCharacterOfPosition(handler.getStart(source)).line + 1;
    const reason = reasonFor(handler, body, source);
    if (reason) { waived.push({ file, line, reason }); return; }
    let safe = false;
    if (body && ts.isBlock(body)) {
      const result = flow(body, [false]);
      safe = !result.unsafe && !result.states.includes(false);
    } else if (body) safe = Boolean(logged(body) || rejected(body) || marked(body));
    if (!safe) findings.push({ file, line, kind,
      fingerprint: createHash('sha256').update(`${kind}:${tokens(anchor, source)}`).digest('hex') });
  }
  function visit(node) {
    if (ts.isCatchClause(node)) inspect(node, node.block, node.parent, 'catch');
    if (ts.isCallExpression(node) && member(node.expression)?.name === 'catch' && node.arguments.length) {
      const handler = unwrap(node.arguments[0]);
      // Unknown callbacks are findings too: naming a helper cannot hide a new
      // silent handler. A reviewer can document a narrow exception at the callback.
      const body = ts.isArrowFunction(handler) || ts.isFunctionExpression(handler) ? handler.body : null;
      inspect(node.arguments[0], body, node, 'promise-catch');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { findings, waived, handlers };
}

export function snapshot(findings) {
  const entries = new Map();
  for (const finding of findings) {
    const id = key(finding);
    if (entries.has(id)) entries.get(id).count++;
    else entries.set(id, { file: finding.file, fingerprint: finding.fingerprint, count: 1, line: finding.line });
  }
  return { version: 1, entries: [...entries.values()].sort((a, b) => key(a).localeCompare(key(b))) };
}

export function validateBaseline(value) {
  if (value?.version !== 1 || !Array.isArray(value.entries)) throw new Error('Invalid upstream catch baseline');
  const seen = new Set();
  for (const e of value.entries) {
    if (typeof e.file !== 'string' || !e.file.startsWith(`${SOURCE}/`) || e.file.includes('..') || e.file.includes('\\') ||
      !sourceFile(e.file) || !/^[a-f0-9]{64}$/.test(e.fingerprint) || !Number.isSafeInteger(e.count) || e.count < 1 ||
      !Number.isSafeInteger(e.line) || e.line < 1 || seen.has(key(e))) throw new Error('Invalid or duplicate upstream catch baseline entry');
    seen.add(key(e));
  }
  return value;
}

export function compareBaseline(current, baseline, previous) {
  [current, baseline, previous].forEach(validateBaseline);
  const failures = [];
  const counts = (v) => new Map(v.entries.map((e) => [key(e), e.count]));
  const actual = counts(current), allowed = counts(baseline), ceiling = counts(previous);
  for (const [id, count] of actual) if (count > (allowed.get(id) ?? 0)) failures.push(`NEW_SILENT_CATCH ${id}`);
  for (const [id, count] of allowed) {
    if (count > (ceiling.get(id) ?? 0)) failures.push(`BASELINE_GREW ${id}`);
    if (count > (actual.get(id) ?? 0)) failures.push(`SHRINK_BASELINE ${id}`);
  }
  return failures;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in scan: ${path}`);
    return entry.isDirectory() ? walk(path) : sourceFile(path) ? [path] : [];
  }).sort();
}

function git(root, args, extra = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...extra });
}

function priorBaseline(root, base) {
  const listed = git(root, ['ls-tree', '--name-only', base, '--', BASELINE]).trim();
  if (listed) return validateBaseline(JSON.parse(git(root, ['show', `${base}:${BASELINE}`])));
  // First introduction: derive debt from the unchanged base, never trust a new
  // baseline to approve handlers introduced in the same PR.
  const files = git(root, ['ls-tree', '-r', '--name-only', base, '--', SOURCE]).trim().split('\n').filter(sourceFile);
  if (!files.length) throw new Error('Base has no capability sources');
  const data = git(root, ['cat-file', '--batch'], { encoding: null, input: files.map((f) => `${base}:${f}\n`).join('') });
  const findings = []; let offset = 0;
  for (const file of files) {
    const end = data.indexOf(10, offset);
    const header = data.subarray(offset, end).toString('utf8').match(/^[a-f0-9]+ blob (\d+)$/);
    if (!header) throw new Error('Cannot read historical capability source');
    const size = Number(header[1]); offset = end + 1;
    findings.push(...scanSource(file, data.subarray(offset, offset + size).toString('utf8')).findings);
    offset += size + 1;
  }
  return snapshot(findings);
}

export function check(root = ROOT, ref = 'origin/main') {
  const paths = walk(join(root, SOURCE));
  if (!paths.length) throw new Error('No capability sources; refusing an empty scan');
  const results = paths.map((path) => scanSource(relative(root, path).replace(/\\/g, '/'), readFileSync(path, 'utf8')));
  const findings = results.flatMap((r) => r.findings);
  const baseline = validateBaseline(JSON.parse(readFileSync(join(root, BASELINE), 'utf8')));
  const refSha = git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  const base = git(root, ['merge-base', 'HEAD', refSha]).trim();
  const failures = compareBaseline(snapshot(findings), baseline, priorBaseline(root, base));
  return { ok: !failures.length, base, files: paths.length, handlers: results.reduce((n, r) => n + r.handlers, 0),
    pending: findings.length, waived: results.flatMap((r) => r.waived), failures, findings };
}

function main() {
  const args = process.argv.slice(2); let root = ROOT, ref = 'origin/main', json = false, makeSnapshot = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--root' || arg === '--base') {
      const value = args.shift(); if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--root') root = resolve(value); else ref = value;
    } else if (arg === '--json') json = true;
    else if (arg === '--snapshot') makeSnapshot = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (makeSnapshot) {
    const paths = walk(join(root, SOURCE)); if (!paths.length) throw new Error('No capability sources');
    const findings = paths.flatMap((path) => scanSource(relative(root, path).replace(/\\/g, '/'), readFileSync(path, 'utf8')).findings);
    console.log(JSON.stringify(snapshot(findings), null, 2)); return;
  }
  const report = check(root, ref);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Upstream catch guard: ${report.files} files, ${report.handlers} handlers, ${report.pending} existing findings, ${report.waived.length} documented exceptions.`);
    for (const failure of report.failures) console.error(failure);
    if (!report.ok) console.error('Throw, log, return an explicit degraded marker, or add a reviewed handler-local // degraded-ok: reason. Remove fixed baseline entries; never enlarge the baseline.');
  }
  if (!report.ok) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Upstream catch guard failed closed: ${error.message}`); process.exitCode = 1; }
}
