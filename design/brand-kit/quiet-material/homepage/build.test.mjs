import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const build = resolve(here, 'build.mjs');
const base = JSON.parse(await readFile(resolve(here, 'registry.json'), 'utf8'));
const evidence = JSON.parse(await readFile(resolve(here, 'verification.json'), 'utf8'));
const brief = JSON.parse(await readFile(resolve(here, '../../../../docs/programs/brand-website/homepage-brief.json'), 'utf8'));
const temporary = await mkdtemp(resolve(tmpdir(), 'strale-homepage-test-'));
let passed = 0;

async function rejects(name, mutate, expected) {
  const candidate = structuredClone(base);
  mutate(candidate);
  const file = resolve(temporary, `${name}.json`);
  await writeFile(file, JSON.stringify(candidate), 'utf8');
  const result = spawnSync(process.execPath, [build, '--check', '--registry', file], {encoding:'utf8'});
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expected)) throw new Error(`${name} did not fail for ${expected}: ${output}`);
  passed += 1;
}

async function rejectsEvidence(name, mutate, expected) {
  const candidate = structuredClone(evidence);
  mutate(candidate);
  const file = resolve(temporary, `${name}.json`);
  await writeFile(file, JSON.stringify(candidate), 'utf8');
  const result = spawnSync(process.execPath, [build, '--check', '--evidence', file], {encoding:'utf8'});
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expected)) throw new Error(`${name} did not fail for ${expected}: ${output}`);
  passed += 1;
}

async function rejectsBrief(name, mutate, expected) {
  const candidate = structuredClone(brief);
  mutate(candidate);
  const file = resolve(temporary, `${name}.json`);
  await writeFile(file, JSON.stringify(candidate), 'utf8');
  const result = spawnSync(process.execPath, [build, '--check', '--brief', file], {encoding:'utf8'});
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expected)) throw new Error(`${name} did not fail for ${expected}: ${output}`);
  passed += 1;
}

try {
  await rejects('production-state', registry => { registry.production_adopted = true; }, 'cannot imply production');
  await rejects('blocked-section', registry => { registry.sections = ['opening','breadth','shared-access','execution-record','begin']; }, 'exact four-section order');
  await rejects('source-digest', registry => { registry.source_bindings[0].sha256 = '0'.repeat(64); }, 'Source binding changed');
  await rejectsBrief('missing-execution-gate', candidate => { candidate.sections = candidate.sections.filter(section => section.id !== 'execution-record'); }, 'design gate is missing or changed');
  await rejectsBrief('changed-execution-gate', candidate => { candidate.sections.find(section => section.id === 'execution-record').design_gate = 'Outline only.'; }, 'design gate is missing or changed');
  await rejectsEvidence('empty-screenshots', result => { result.screenshots = {}; }, 'screenshot evidence is incomplete');
  await rejectsEvidence('missing-browser-check', result => { delete result.checks.browser_console_clean; }, 'required checks are incomplete');
  await rejectsEvidence('stale-verifier', result => { result.inputs.local_sources['verify.mjs'] = '0'.repeat(64); }, 'input/output inventory is stale');
} finally {
  await rm(temporary, {recursive:true, force:true});
}
console.log(`Homepage negative contract tests passed (${passed}).`);
