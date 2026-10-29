// Holds the n8n jobs to the Zapier app's job module (D5), which they port.
// Both are driven with the same inputs and a recording executor that answers
// from the same fixtures; they must send the same tool calls and return the
// same fields. Differences are deliberate and listed here: n8n keeps match
// evidence as structured JSON (Zapier needs JSON strings), nests the two
// screening results under 'sanctions' and 'pep', and adds the transaction IDs
// a user reviews before rerunning.
// Runs inside the Strale repository only; skipped in a standalone checkout.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const zapierJobsPath = join(__dirname, '../../zapier-strale/lib/jobs.js');
const available = existsSync(zapierJobsPath);
const fixtures = require('./fixtures/responses.json');

function recorder() {
	const calls = [];
	return {
		calls,
		execute: async (slug, inputs) => {
			calls.push({ slug, inputs });
			return fixtures[slug].result;
		},
	};
}

const n8nOnly = new Set(['transaction_id']);
const jsonStrings = new Set(['sanctions_matches', 'pep_matches', 'sanctions_lists', 'pep_lists']);

// n8n nests the two screening results; flatten them back to Zapier's names.
function flatten(output) {
	if (!output.sanctions) return output;
	const { name, sanctions: s, pep: p } = output;
	return {
		name,
		sanctions_match_count: s.match_count,
		pep_match_count: p.match_count,
		sanctions_matches: s.matches,
		pep_matches: p.matches,
		sanctions_lists: s.lists,
		pep_lists: p.lists,
		sanctions_source: s.source,
		pep_source: p.source,
		sanctions_queried_at: s.checked_at,
		pep_screened_at: p.checked_at,
	};
}

function comparable(zapierOutput, n8nOutput) {
	const n8n = Object.fromEntries(Object.entries(flatten(n8nOutput)).filter(([k]) => !n8nOnly.has(k)));
	const zapier = Object.fromEntries(
		Object.entries(zapierOutput).map(([k, v]) => [k, jsonStrings.has(k) ? JSON.parse(v) : v]),
	);
	return { zapier, n8n };
}

const cases = [
	['lookup_company', 'lookUpCompany', { country: 'GB', registration_number: '00445790' }, { country: 'GB', registrationNumber: '00445790' }],
	['lookup_company', 'lookUpCompany', { country: 'uk', company_name: 'Example Ltd' }, { country: 'uk', companyName: 'Example Ltd' }],
	['lookup_company', 'lookUpCompany', { country: 'SE', registration_number: '5560000000' }, { country: 'SE', registrationNumber: '5560000000' }],
	['lookup_company', 'lookUpCompany', { country: 'NO', company_name: 'Example AS' }, { country: 'NO', companyName: 'Example AS' }],
	['lookup_company', 'lookUpCompany', { country: 'FI', registration_number: '0000000-0' }, { country: 'FI', registrationNumber: '0000000-0' }],
	['check_eu_vat', 'checkVatNumber', { vat_number: 'SE556703748501' }, { vatNumber: 'SE556703748501' }],
	['screen_name', 'screenName', { name: 'Example Person' }, { name: 'Example Person' }],
	[
		'screen_name',
		'screenName',
		{ name: 'Example Person', country: 'se', birth_date: '1970-01-31' },
		{ name: 'Example Person', country: 'se', birthDate: '1970-01-31' },
	],
];

test('n8n jobs send the same tool calls and return the same fields as the Zapier jobs', { skip: !available }, async () => {
	const { jobs: zapierJobs } = require(zapierJobsPath);
	const n8nJobs = require('../dist/nodes/Strale/jobs.js');
	for (const [zapierKey, n8nKey, zapierInput, n8nInput] of cases) {
		const z = recorder();
		const n = recorder();
		const zapierOutput = await zapierJobs[zapierKey].run(zapierInput, z.execute);
		const n8nOutput = await n8nJobs[n8nKey](n8nInput, n.execute);
		assert.deepEqual(n.calls, z.calls, `${n8nKey} calls`);
		const { zapier, n8n } = comparable(zapierOutput, n8nOutput);
		assert.deepEqual(n8n, zapier, `${n8nKey} output`);
		assert.deepEqual(n8nJobs.jobTools[n8nKey], zapierJobs[zapierKey].tools, `${n8nKey} tools`);
	}
});

test('n8n exposes only the Zapier jobs that are publicly visible', { skip: !available }, () => {
	const { jobs: zapierJobs } = require(zapierJobsPath);
	const n8nJobs = require('../dist/nodes/Strale/jobs.js');
	const visible = Object.values(zapierJobs)
		.filter((job) => !job.hidden)
		.flatMap((job) => job.tools)
		.sort();
	assert.deepEqual(Object.values(n8nJobs.jobTools).flat().sort(), visible);
});
