import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const isDocsPath = (file) => /^(docs|archive|handoff)\//.test(file) || /^[^/]+\.md$/.test(file);
export const docsOnly = (files) => files.length > 0 && files.every(isDocsPath);
export const briefsChanged = (files) => files.some((f) => /^docs\/company\/briefs\//.test(f) ||
  /^apps\/api\/src\/lib\/ceo-brief-lint/.test(f) || ['apps/api/scripts/check-ceo-brief.ts', '.github/workflows/ci.yml'].includes(f));
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head, output, event] = process.argv.slice(2);
  const files = execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  appendFileSync(output, `docs_only=${event === 'push' ? false : docsOnly(files)}\nbriefs_changed=${event === 'push' || briefsChanged(files)}\n`);
}
