#!/usr/bin/env node
/** H5: the factory is the sole production SDK constructor. No allowlist growth. */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import ts from 'typescript';
import { requireInputs } from '../../../scripts/require-inputs.mjs';
export function hasDirectAnthropic(source) {
  const ast = ts.createSourceFile('guard.ts', source, ts.ScriptTarget.Latest, true);
  const names = new Set(['Anthropic']);
  let direct = false;
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@anthropic-ai/sdk') {
      const clause = node.importClause;
      if (clause && !clause.isTypeOnly) {
        if (clause.name) names.add(clause.name.text);
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
        if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
          if (!binding.isTypeOnly && ['Anthropic', 'default'].includes(binding.propertyName?.text ?? binding.name.text)) names.add(binding.name.text);
        }
      }
    }
    // Runtime dynamic SDK imports can construct via aliases/destructuring later.
    // Ban them outside the factory rather than trying to follow data flow.
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0]?.text === '@anthropic-ai/sdk') direct = true;
    if (ts.isNewExpression(node)) {
      let expression = node.expression;
      while (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) || ts.isParenthesizedExpression(expression)) expression = expression.expression;
      if (ts.isIdentifier(expression) && names.has(expression.text)) direct = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return direct;
}
export function checkAnthropicClient(root) {
  const findings = [];
  let scanned = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'archive'].includes(entry.name)) continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.[cm]?[jt]s$/.test(entry.name) && !/\.test\.[cm]?[jt]s$/.test(entry.name)) {
        scanned++;
        if (relative(root, path).replaceAll('\\', '/') === 'src/lib/anthropic-client.ts') continue;
        if (hasDirectAnthropic(readFileSync(path, 'utf8'))) findings.push(relative(root, path));
      }
    }
  }
  walk(root);
  requireInputs(scanned, 'Anthropic client source files');
  return { scanned, findings };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkAnthropicClient(fileURLToPath(new URL('..', import.meta.url)));
  console.log(JSON.stringify(result));
  process.exitCode = result.findings.length ? 1 : 0;
}
