import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { scanSource, snapshot, compareBaseline, validateBaseline, check, BASELINE, SOURCE } from './check-upstream-catches.mjs';

const FILE = `${SOURCE}/example.ts`;
const scan = (text) => scanSource(FILE, text);
const debt = (text) => snapshot(scan(text).findings);
const empty = { version: 1, entries: [] };
const silent = 'const result = await fetch(url).catch(() => []);';

for (const [name, code] of [
  ['empty arrow', 'p.catch(() => {});'],
  ['array fallback', 'p.catch(() => []);'],
  ['null fallback', 'p.catch(() => null);'],
  ['false fallback', 'p.catch(() => false);'],
  ['zero fallback', 'p.catch(() => 0);'],
  ['undefined fallback', 'p.catch(() => undefined);'],
  ['object fallback', 'p.catch(() => ({}));'],
  ['block return', 'p.catch(function (error) { return []; });'],
  ['catch fallthrough', 'try { run(); } catch { /* continue */ }'],
  ['assignment fallback', 'try { run(); } catch { result = []; }'],
  ['ordinary catch return', 'try { run(); } catch (e) { return null; }'],
  ['named handler', 'p.catch(silentHelper);'],
  ['bracket catch', 'p["catch"](() => []);'],
  ['optional catch', 'p?.catch?.(() => []);'],
  ['conditional throw', 'p.catch(e => { if (e.retry) throw e; return []; });'],
  ['conditional log', 'p.catch(e => { if (debug) logError("oops", e); return []; });'],
  ['optional logger', 'p.catch(e => { logger?.warn?.({err:e}, "failed"); return []; });'],
  ['optional log helper', 'p.catch(e => logError?.("failed", e));'],
  ['optional rejection', 'p.catch(e => Promise.reject?.(e));'],
  ['suppressed structured debug log', 'p.catch(e => { log.debug({err:e}, "failed"); return []; });'],
  ['suppressed logger debug log', 'p.catch(e => { logger.debug({err:e}, "failed"); return []; });'],
  ['log after return', 'p.catch(e => { return []; logError("oops", e); });'],
  ['nested helper log', 'p.catch(e => { const helper = () => logError("oops", e); return []; });'],
  ['marker inside nested example', 'p.catch(() => ({example: { unavailable: true }}));'],
  ['false marker', 'p.catch(() => ({unavailable: false}));'],
  ['overridden marker', 'p.catch(() => ({unavailable: true, ...other}));'],
  ['duplicate quoted marker', 'p.catch(() => ({unavailable: true, "unavailable": false}));'],
  ['computed marker overwrite', 'p.catch(() => ({unavailable: true, [field]: false}));'],
  ['unimplemented degraded marker', 'p.catch(() => ({degraded: true}));'],
  ['empty exception reason', 'p.catch(() => { // degraded-ok:\n return []; });'],
  ['complex control flow', 'p.catch(e => { for (;;) { if (stop) return []; } throw e; });'],
]) test(`detects ${name}`, () => assert.equal(scan(code).findings.length, 1));

for (const [name, code] of [
  ['throw', 'p.catch(e => { throw new Error("upstream unavailable", { cause:e }); });'],
  ['both branches throw', 'p.catch(e => { if (e.code) throw e; else throw new Error("upstream unavailable"); });'],
  ['return rejection', 'p.catch(e => Promise.reject(e));'],
  ['structured log', 'p.catch(e => { logError("failed", e); return []; });'],
  ['logger call', 'try { run(); } catch (e) { logger.warn({err:e}, "failed"); }'],
  ['unavailable marker', 'p.catch(() => ({unavailable: true}));'],
  ['skipped marker', 'p.catch(() => ({skipped: true} as const));'],
  ['both branches observable', 'p.catch(e => { if (a) logError("a",e); else logWarn("b",e); return null; });'],
  ['local documented exception', 'p.catch(() => { // degraded-ok: optional enrichment; required leg is independently checked\n return []; });'],
  ['callback exception', 'p.catch(// degraded-ok: helper rethrows every provider failure\n rethrow);'],
  ['try-catch exception', 'try { run(); }\n// degraded-ok: parser miss tries a validated secondary format\ncatch { return []; }'],
]) test(`accepts ${name}`, () => assert.equal(scan(code).findings.length, 0));

test('comments, strings and unrelated nested logs do not spoof the scanner', () => {
  const result = scan('// p.catch(() => []);\nconst note="catch { return [] }"; p.catch(e => { /* throw e; */ return null; });');
  assert.equal(result.handlers, 1); assert.equal(result.findings.length, 1);
});
test('a local exception cannot waive a sibling handler', () => {
  const result = scan('p.catch(() => { // degraded-ok: optional leg is checked by caller\n return []; }); q.catch(() => []);');
  assert.equal(result.waived.length, 1); assert.equal(result.findings.length, 1);
});
test('a later comment cannot waive the handler', () => {
  assert.equal(scan('p.catch(() => { return []; // degraded-ok: too late\n });').findings.length, 1);
});
test('formatting and comments do not change fingerprints; regex contents do', () => {
  assert.equal(debt(silent).entries[0].fingerprint, debt('// intro\nconst result = await fetch( url ).catch( () => /*note*/ [] );').entries[0].fingerprint);
  assert.notEqual(debt(String.raw`p.catch(() => /a\/\/b/);`).entries[0].fingerprint, debt(String.raw`p.catch(() => /c\/\/b/);`).entries[0].fingerprint);
});
test('a duplicate handler cannot borrow an existing fingerprint allowance', () => {
  const failures = compareBaseline(debt(silent + silent), debt(silent), debt(silent));
  assert.ok(failures.some((f) => f.startsWith('NEW_SILENT_CATCH')));
});
test('baseline growth cannot hide a new or altered handler', () => {
  const old = debt(silent), next = debt(silent.replace('[]', 'null'));
  assert.ok(compareBaseline(next, next, old).some((f) => f.startsWith('BASELINE_GREW')));
});
test('fixes must shrink the baseline; removed debt cannot be reintroduced', () => {
  const old = debt(silent);
  assert.ok(compareBaseline(empty, old, old).some((f) => f.startsWith('SHRINK_BASELINE')));
  assert.deepEqual(compareBaseline(empty, empty, old), []);
  assert.ok(compareBaseline(old, old, empty).some((f) => f.startsWith('BASELINE_GREW')));
});
test('invalid, duplicate and negative-count baseline records fail closed', () => {
  const base = debt(silent);
  for (const bad of [null, {}, {version:2,entries:[]}, {...base,entries:[...base.entries,...base.entries]},
    {version:1,entries:[{...base.entries[0],count:0}]}, {version:1,entries:[{...base.entries[0],file:'../escape.ts'}]}]) {
    assert.throws(() => validateBaseline(bad));
  }
});
test('malformed TypeScript fails closed', () => assert.throws(() => scan('try { catch {')));

function fixture(t, code = silent) {
  const root = mkdtempSync(join(tmpdir(), 'strale-catch-guard-'));
  t.after(() => {
    const target = realpathSync(root), parent = realpathSync(tmpdir());
    assert.ok(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('strale-catch-guard-'));
    rmSync(target, {recursive:true,force:true});
  });
  const write = (file, value) => { mkdirSync(dirname(join(root,file)), {recursive:true}); writeFileSync(join(root,file), value); };
  const git = (...args) => execFileSync('git', args, {cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
  git('init','-b','main'); git('config','user.name','Guard fixture'); git('config','user.email','fixture@example.invalid');
  write(FILE,code); git('add','.'); git('commit','-m','base');
  return {root,write,git,base:git('rev-parse','HEAD')};
}
test('first adoption derives ceiling from base sources and rejects same-PR debt', (t) => {
  const f=fixture(t); f.write(BASELINE,JSON.stringify(debt(silent)));
  assert.equal(check(f.root,f.base).ok,true);
  f.write(FILE,silent+'\nq.catch(() => null);'); f.write(BASELINE,JSON.stringify(debt(silent+'\nq.catch(() => null);')));
  assert.ok(check(f.root,f.base).failures.some((v)=>v.startsWith('BASELINE_GREW')));
});
test('committed baseline is the ceiling after adoption, including count increases', (t) => {
  const f=fixture(t);f.write(BASELINE,JSON.stringify(debt(silent)));f.git('add','.');f.git('commit','-m','adopt');
  const base=f.git('rev-parse','HEAD'); f.write(FILE,silent+silent);f.write(BASELINE,JSON.stringify(debt(silent+silent)));
  assert.ok(check(f.root,base).failures.some((v)=>v.startsWith('BASELINE_GREW')));
});
test('missing baseline, empty source tree and missing base all fail closed', (t) => {
  const f=fixture(t); assert.throws(()=>check(f.root,f.base));
  f.write(BASELINE,JSON.stringify(debt(silent)));assert.throws(()=>check(f.root,'no-such-ref'));
  f.git('rm',FILE); assert.throws(()=>check(f.root,f.base));
});
test('CLI exits nonzero for a planted violation and reports a clean counterpart', (t) => {
  const f=fixture(t,'p.catch(e => { throw e; });');f.write(BASELINE,JSON.stringify(empty));
  const script=fileURLToPath(new URL('./check-upstream-catches.mjs',import.meta.url));
  const run=()=>spawnSync(process.execPath,[script,'--root',f.root,'--base',f.base,'--json'],{encoding:'utf8'});
  assert.equal(run().status,0); f.write(FILE,silent); const bad=run();
  assert.equal(bad.status,1);assert.equal(JSON.parse(bad.stdout).ok,false);
});
test('the existing bare-catch guard misses the planted empty-array fallback that the new guard rejects', (t) => {
  const f=fixture(t,'p.catch(e => { throw e; });');f.write(BASELINE,JSON.stringify(empty));f.write(FILE,silent);
  const old=fileURLToPath(new URL('./check-no-bare-catch.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[old,join(f.root,SOURCE)],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(check(f.root,f.base).ok,false);
});
test('plain CI output makes each documented exception visible', (t) => {
  const f=fixture(t,'p.catch(() => { // degraded-ok: optional leg checked by required result\n return []; });');
  f.write(BASELINE,JSON.stringify(empty));
  const script=fileURLToPath(new URL('./check-upstream-catches.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'--root',f.root,'--base',f.base],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/degraded-ok apps\/api\/src\/capabilities\/example.ts:1: optional leg checked by required result/);
});

test('CI keeps the existing guard and runs the new guard and planted-failure tests', () => {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
  const workflow=readFileSync(join(root,'.github/workflows/ci.yml'),'utf8');
  const steps=parse(workflow).jobs.check.steps;
  assert.ok(steps.some((s)=>s.run==='npm --workspace=apps/api run lint:no-bare-catch'));
  const lint=steps.find((s)=>s.run?.startsWith('npm --workspace=apps/api run lint:upstream-catches'));
  const tests=steps.find((s)=>s.run==='npm --workspace=apps/api run test:upstream-catches');
  assert.ok(lint && tests);assert.equal(lint.if,undefined);assert.equal(tests.if,undefined);
  assert.match(lint.run,/github\.event\.pull_request\.base\.sha/);
  assert.match(lint.run,/github\.event\.merge_group\.base_sha/);
  const pkg=JSON.parse(readFileSync(join(root,'apps/api/package.json'),'utf8'));
  assert.equal(pkg.scripts['lint:upstream-catches'],'node scripts/check-upstream-catches.mjs');
  assert.equal(pkg.scripts['test:upstream-catches'],'node --test scripts/check-upstream-catches.test.mjs');
});
