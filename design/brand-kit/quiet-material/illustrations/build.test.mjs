import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOutputs, json, render, validateBriefContract, validateEvidence, validateToken} from './build.mjs';

const token = json('../../../tokens/candidates/quiet-material-illustrations.json');
const foundation = json('../../../tokens/candidates/quiet-material-patterns.json');

test('rejects semantic drift between the homepage brief and asset registry', () => {
  const brief = json('../../../../docs/programs/brand-website/homepage-brief.json');
  validateBriefContract(brief);
  const changed = structuredClone(brief);
  changed.illustrations.find(item => item.id === 'shared-access-diagram').labels[2] = 'Monitoring';
  assert.throws(() => validateBriefContract(changed), /labels must agree/);
  const missing = structuredClone(brief);
  missing.illustrations = missing.illustrations.filter(item => item.id !== 'shared-access-diagram');
  assert.throws(() => validateBriefContract(missing), /contract is missing/);
});

test('rejects a missing task label and disconnected topology contract', () => {
  const missingLabel = structuredClone(token);
  missingLabel.layout.geometry.narrow.labels.pop();
  assert.throws(() => validateToken(missingLabel, foundation), /label count/);

  const missingTopology = structuredClone(token);
  missingTopology.layout.geometry.desktop.connector.path = '';
  assert.throws(() => validateToken(missingTopology, foundation), /connector path/);
});

test('detects a stale generated export', () => {
  const expected = render(token, foundation);
  assert.throws(() => assertOutputs(expected, path => path === 'index.html' ? 'stale' : expected[path]), /Stale output index\.html/);
});

test('requires verification evidence', () => {
  assert.throws(() => validateEvidence(null, render(token, foundation)), /Missing verification evidence/);
});
