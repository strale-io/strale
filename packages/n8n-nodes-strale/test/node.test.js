// Offline tests for the built node. They load the compiled node and drive its
// execute() through n8n-workflow's own primitives: parameter resolution with
// NodeHelpers.getNodeParameters (defaults and displayOptions), required-field
// issues with NodeHelpers.getNodeParametersIssues, and n8n's error classes.
// HTTP goes through a recorded httpRequestWithAuthentication; nothing leaves
// the machine and no paid call is made.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { NodeHelpers, NodeApiError, NodeOperationError } = require('n8n-workflow');

const { Strale } = require('../dist/nodes/Strale/Strale.node.js');
const { StraleApi } = require('../dist/credentials/StraleApi.credentials.js');
const { VERSION } = require('../dist/nodes/Strale/transport.js');
const pkg = require('../package.json');
const fixtures = require('./fixtures/responses.json');

const node = new Strale();
const description = node.description;

function makeNode(parameters) {
	return {
		id: 'test-node',
		name: 'Strale',
		type: 'n8n-nodes-strale.strale',
		typeVersion: 1,
		position: [0, 0],
		parameters,
		credentials: { straleApi: { id: '1', name: 'Strale account' } },
	};
}

// A minimal IExecuteFunctions. Parameter values are resolved the way n8n
// resolves them, from the node description, so a wrong default or a broken
// displayOptions rule shows up here.
function context(itemParameters, responder, { continueOnFail = false } = {}) {
	const calls = [];
	const resolved = itemParameters.map((p) =>
		NodeHelpers.getNodeParameters(description.properties, p, true, false, { typeVersion: 1 }, description),
	);
	const ctx = {
		calls,
		getInputData: () => itemParameters.map(() => ({ json: {} })),
		getNodeParameter(name, itemIndex, fallback) {
			const value = resolved[itemIndex][name];
			if (value === undefined) {
				if (fallback !== undefined) return fallback;
				throw new Error(`Could not get parameter "${name}"`);
			}
			return value;
		},
		getNode: () => makeNode(itemParameters[0]),
		continueOnFail: () => continueOnFail,
		helpers: {
			async httpRequestWithAuthentication(credentialType, options) {
				calls.push({ credentialType, options });
				return responder(options, calls.length);
			},
		},
	};
	return ctx;
}

const ok = (slug) => ({ statusCode: 200, body: fixtures[slug] });
const bySlug = (options) =>
	options.method === 'POST' ? ok(options.body.capability_slug) : { statusCode: 404, body: {} };

test('package version and client header agree', () => {
	assert.equal(VERSION, pkg.version);
	assert.match(pkg.version, /^1\./);
});

test('package has no runtime dependencies and the built code reads no environment or files', () => {
	assert.equal(pkg.dependencies, undefined);
	assert.deepEqual(Object.keys(pkg.peerDependencies), ['n8n-workflow']);
	const walk = (dir) =>
		readdirSync(dir).flatMap((name) => {
			const full = join(dir, name);
			return statSync(full).isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
		});
	for (const file of walk(join(__dirname, '../dist'))) {
		const code = readFileSync(file, 'utf8');
		assert.doesNotMatch(code, /process\.env|require\("(node:)?fs"\)|require\("(node:)?child_process"\)/, file);
	}
});

test('credential authenticates with a bearer header and tests against the wallet balance', () => {
	const cred = new StraleApi();
	assert.equal(cred.name, 'straleApi');
	assert.equal(cred.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
	assert.equal(cred.test.request.url, '/v1/wallet/balance');
	assert.equal(cred.test.request.method, 'GET');
	assert.equal(cred.properties[0].typeOptions.password, true);
	assert.deepEqual(description.credentials, [{ name: 'straleApi', required: true }]);
});

test('every operation returns at most ten top-level fields (n8n UX guideline)', async () => {
	const params = [
		{ resource: 'company', operation: 'lookUp', country: 'SE', registrationNumber: '5560000000' },
		{ resource: 'vatNumber', operation: 'check', vatNumber: 'SE556703748501' },
		{ resource: 'person', operation: 'screenName', name: 'Example Person' },
	];
	const [items] = await node.execute.call(context(params, bySlug));
	for (const item of items) assert.ok(Object.keys(item.json).length <= 10, Object.keys(item.json).join());
});

test('description offers exactly the three fixed jobs and no arbitrary-tool operation', () => {
	const operations = description.properties
		.filter((p) => p.name === 'operation')
		.flatMap((p) => p.displayOptions.show.resource.map((r) => p.options.map((o) => `${r}:${o.value}`)))
		.flat();
	assert.deepEqual(operations.sort(), ['company:lookUp', 'person:screenName', 'vatNumber:check']);
	assert.equal(description.usableAsTool, true);
	const names = description.properties.map((p) => p.name);
	for (const forbidden of ['slug', 'capabilitySlug', 'capability', 'inputs']) {
		assert.ok(!names.includes(forbidden), `unexpected parameter ${forbidden}`);
	}
});

test('n8n reports the registration number as a missing required parameter', () => {
	const values = NodeHelpers.getNodeParameters(
		description.properties,
		{ resource: 'company', operation: 'lookUp' },
		true,
		false,
		{ typeVersion: 1 },
		description,
	);
	const issues = NodeHelpers.getNodeParametersIssues(description.properties, makeNode(values), description);
	assert.ok(issues?.parameters?.registrationNumber, JSON.stringify(issues));
	const named = NodeHelpers.getNodeParameters(
		description.properties,
		{ resource: 'company', operation: 'lookUp', lookUpBy: 'companyName', companyName: 'Example' },
		true,
		false,
		{ typeVersion: 1 },
		description,
	);
	assert.equal(named.registrationNumber, undefined, 'hidden field must not resolve');
	assert.equal(NodeHelpers.getNodeParametersIssues(description.properties, makeNode(named), description), null);
});

test('look up a company sends one capped call with the client header and maps the result', async () => {
	const ctx = context(
		[{ resource: 'company', operation: 'lookUp', country: 'GB', registrationNumber: ' 00445790 ' }],
		bySlug,
	);
	const [[item]] = await node.execute.call(ctx);
	assert.equal(ctx.calls.length, 1);
	const { credentialType, options } = ctx.calls[0];
	assert.equal(credentialType, 'straleApi');
	assert.equal(options.method, 'POST');
	assert.equal(options.url, 'https://api.strale.io/v1/do');
	assert.deepEqual(options.qs, { src: 'n8n' });
	assert.equal(options.headers['X-Strale-Client'], `n8n-nodes-strale/${pkg.version}`);
	assert.deepEqual(options.body, {
		capability_slug: 'uk-company-data',
		inputs: { company_number: '00445790' },
		max_price_cents: 100,
		timeout_seconds: 20,
	});
	assert.deepEqual(item.pairedItem, { item: 0 });
	assert.deepEqual(item.json, {
		company_name: 'Example Company',
		registration_number: 'EXAMPLE',
		country: 'GB',
		status: 'active',
		address: 'Example address',
		source: 'Example registry',
		fetched_at: '2026-10-27T12:00:00.000Z',
		transaction_id: 'synthetic-transaction',
	});
});

test('Swedish lookups join the structured address and refuse a name before any call', async () => {
	const ctx = context([{ resource: 'company', operation: 'lookUp', country: 'SE', registrationNumber: '5560000000' }], bySlug);
	const [[item]] = await node.execute.call(ctx);
	assert.equal(ctx.calls[0].options.body.inputs.org_number, '5560000000');
	assert.equal(item.json.address, 'Example street, EXAMPLE, Example city, SE');

	const named = context(
		[{ resource: 'company', operation: 'lookUp', country: 'SE', lookUpBy: 'companyName', companyName: 'Example AB' }],
		bySlug,
	);
	await assert.rejects(node.execute.call(named), (error) => {
		assert.ok(error instanceof NodeOperationError);
		assert.match(error.message, /requires a registration number/);
		return true;
	});
	assert.equal(named.calls.length, 0);
});

test('a blank registration number is refused as a registration number, before any call', async () => {
	const ctx = context([{ resource: 'company', operation: 'lookUp', country: 'GB', registrationNumber: '   ' }], bySlug);
	await assert.rejects(node.execute.call(ctx), /Registration number must contain/);
	assert.equal(ctx.calls.length, 0);
});

test('check a VAT number', async () => {
	const ctx = context([{ resource: 'vatNumber', operation: 'check', vatNumber: 'SE556703748501' }], bySlug);
	const [[item]] = await node.execute.call(ctx);
	assert.deepEqual(ctx.calls[0].options.body.inputs, { vat_number: 'SE556703748501' });
	assert.equal(item.json.valid, false);
	assert.equal(item.json.country_code, 'SE');
	assert.equal(item.json.source, 'VIES');
});

test('screen a name runs sanctions then PEP and keeps match evidence as structured data', async () => {
	const ctx = context(
		[
			{
				resource: 'person',
				operation: 'screenName',
				name: 'Example Person',
				additionalFields: { country: 'se', birthDate: '1970-01-31' },
			},
		],
		bySlug,
	);
	const [[item]] = await node.execute.call(ctx);
	assert.deepEqual(
		ctx.calls.map((c) => c.options.body),
		[
			{
				capability_slug: 'sanctions-check',
				inputs: { name: 'Example Person', entity_type: 'person', country: 'SE', birth_date: '1970-01-31' },
				max_price_cents: 100,
				timeout_seconds: 20,
			},
			{
				capability_slug: 'pep-check',
				inputs: { name: 'Example Person', country: 'SE', date_of_birth: '1970-01-31' },
				max_price_cents: 100,
				timeout_seconds: 20,
			},
		],
	);
	assert.deepEqual(item.json, {
		name: 'Example Person',
		sanctions: {
			match_count: 0,
			matches: [],
			lists: { collection: 'example', source_count: 0, major_lists: [] },
			source: 'dilisense',
			checked_at: '2026-10-27T12:00:00.000Z',
			transaction_id: 'synthetic-transaction',
		},
		pep: {
			match_count: 0,
			matches: [],
			lists: { collection: 'example', source_count: 0, major_lists: [] },
			source: 'dilisense',
			checked_at: '2026-10-27T12:00:00.000Z',
			transaction_id: 'synthetic-transaction',
		},
	});
});

test('an invalid birth date fails as a configuration error before any billed call', async () => {
	const ctx = context(
		[{ resource: 'person', operation: 'screenName', name: 'Example Person', additionalFields: { birthDate: '1970-02-30' } }],
		bySlug,
	);
	await assert.rejects(node.execute.call(ctx), NodeOperationError);
	assert.equal(ctx.calls.length, 0);
});

test('a rejected key stops the screening before the second billed check', async () => {
	const ctx = context([{ resource: 'person', operation: 'screenName', name: 'Example Person' }], () => ({
		statusCode: 401,
		body: { error_code: 'invalid_api_key', message: 'The API key is not valid.' },
	}));
	await assert.rejects(node.execute.call(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.httpCode, '401');
		assert.equal(error.message, 'The API key is not valid.');
		assert.match(error.description, /Strale credential/);
		return true;
	});
	assert.equal(ctx.calls.length, 1);
});

test('a non-retryable cap surfaces the API fix text', async () => {
	const ctx = context([{ resource: 'vatNumber', operation: 'check', vatNumber: 'SE556703748501' }], () => ({
		statusCode: 429,
		body: {
			error_code: 'spend_cap_exceeded',
			message: 'Hourly spend cap reached.',
			details: { retryable: false, fix: 'Wait for the hour to pass or raise the cap.' },
		},
	}));
	await assert.rejects(node.execute.call(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.httpCode, '429');
		assert.equal(error.description, 'Wait for the hour to pass or raise the cap.');
		return true;
	});
});

// GET /v1/transactions/:id answers with the flat transaction record, keyed `id`
// (apps/api/src/routes/transactions.ts), not the /v1/do envelope.
const transactionRecord = (id, status, extra = {}) => ({
	id,
	type: 'capability',
	status,
	capability_slug: 'vat-validate',
	output: status === 'completed' ? fixtures['vat-validate'].result.output : null,
	provenance: status === 'completed' ? fixtures['vat-validate'].result.provenance : null,
	...extra,
});
const vatItem = [{ resource: 'vatNumber', operation: 'check', vatNumber: 'SE556703748501' }];
const accepted = (id) => ({ statusCode: 202, body: { result: { transaction_id: id, status: 'executing' } } });

// Moves the clock forward by `step` ms on every Date.now() call.
async function withFastClock(step, fn) {
	const realNow = Date.now;
	let t = realNow();
	Date.now = () => (t += step);
	try {
		return await fn();
	} finally {
		Date.now = realNow;
	}
}

test('a pending check is polled by transaction ID, never resubmitted, and keeps its ID', async () => {
	const ctx = context(vatItem, (options, n) =>
		options.method === 'POST'
			? accepted('tx-1')
			: { statusCode: 200, body: transactionRecord('tx-1', n < 3 ? 'executing' : 'completed') },
	);
	const [[item]] = await node.execute.call(ctx);
	assert.deepEqual(
		ctx.calls.map((c) => `${c.options.method} ${c.options.url}`),
		[
			'POST https://api.strale.io/v1/do',
			'GET https://api.strale.io/v1/transactions/tx-1',
			'GET https://api.strale.io/v1/transactions/tx-1',
		],
	);
	assert.equal(item.json.valid, false);
	assert.equal(item.json.source, 'VIES');
	assert.equal(item.json.transaction_id, 'tx-1');
});

test('a polled check that failed reports its fix and transaction', async () => {
	const ctx = context(vatItem, (options) =>
		options.method === 'POST'
			? accepted('tx-4')
			: {
					statusCode: 200,
					body: transactionRecord('tx-4', 'failed', { details: { fix: 'Check the VAT number format.' } }),
				},
	);
	await assert.rejects(node.execute.call(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.match(error.message, /tx-4 has not completed/);
		assert.match(error.description, /Check the VAT number format\..*tx-4/);
		return true;
	});
});

test('a check still running at the item deadline stops with its transaction, without resubmitting', async () => {
	const ctx = context(vatItem, (options) =>
		options.method === 'POST' ? accepted('tx-3') : { statusCode: 200, body: transactionRecord('tx-3', 'executing') },
	);
	await withFastClock(20_000, () =>
		assert.rejects(node.execute.call(ctx), (error) => {
			assert.ok(error instanceof NodeApiError);
			assert.match(error.message, /tx-3 has not completed/);
			assert.match(error.description, /tx-3/);
			return true;
		}),
	);
	assert.equal(ctx.calls.filter((c) => c.options.method === 'POST').length, 1);
});

test('the second screening check is not started without its full time budget', async () => {
	const ctx = context([{ resource: 'person', operation: 'screenName', name: 'Example Person' }], (options) =>
		options.method === 'POST' ? ok(options.body.capability_slug) : { statusCode: 404, body: {} },
	);
	// Each clock read advances 35 s: the first POST starts with 90 s left, the
	// second would have under its 30 s budget.
	await withFastClock(35_000, () =>
		assert.rejects(node.execute.call(ctx), (error) => {
			assert.ok(error instanceof NodeApiError);
			assert.match(error.message, /time limit/);
			assert.match(error.description, /synthetic-transaction/);
			return true;
		}),
	);
	assert.deepEqual(
		ctx.calls.map((c) => c.options.body.capability_slug),
		['sanctions-check'],
	);
});

test('a lost connection on the billed POST says the check may have been billed', async () => {
	const ctx = context(vatItem, () => {
		throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
	});
	await assert.rejects(node.execute.call(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.match(error.description, /vat-validate check may have run and been billed/);
		return true;
	});
});

test('a PEP failure after a billed sanctions check names the sanctions transaction', async () => {
	const ctx = context([{ resource: 'person', operation: 'screenName', name: 'Example Person' }], (options) =>
		options.body.capability_slug === 'sanctions-check'
			? ok('sanctions-check')
			: { statusCode: 400, body: { error_code: 'invalid_input', message: 'The name was refused.' } },
	);
	await assert.rejects(node.execute.call(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.message, 'The name was refused.');
		assert.match(error.description, /synthetic-transaction/);
		return true;
	});
});

test('a failed poll names the transaction to review', async () => {
	const ctx = context(vatItem, (options) =>
		options.method === 'POST' ? accepted('tx-2') : { statusCode: 503, body: { message: 'Temporarily unavailable.' } },
	);
	await assert.rejects(node.execute.call(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.message, 'Temporarily unavailable.');
		assert.match(error.description, /transaction tx-2/);
		return true;
	});
	assert.equal(ctx.calls.filter((c) => c.options.method === 'POST').length, 1);
});

test('continue on fail keeps the advice and the submitted transaction IDs', async () => {
	const ctx = context(
		vatItem,
		(options) =>
			options.method === 'POST' ? accepted('tx-5') : { statusCode: 503, body: { message: 'Temporarily unavailable.' } },
		{ continueOnFail: true },
	);
	const [[item]] = await node.execute.call(ctx);
	assert.equal(item.json.error, 'Temporarily unavailable.');
	assert.deepEqual(item.json.transaction_ids, ['tx-5']);
	assert.match(item.json.description, /tx-5/);
});

test('continue on fail returns the error for one item and processes the next', async () => {
	const ctx = context(
		[
			{ resource: 'vatNumber', operation: 'check', vatNumber: 'x' },
			{ resource: 'vatNumber', operation: 'check', vatNumber: 'SE556703748501' },
		],
		bySlug,
		{ continueOnFail: true },
	);
	const [items] = await node.execute.call(ctx);
	assert.equal(items.length, 2);
	assert.match(items[0].json.error, /at least two characters/);
	assert.deepEqual(items[0].pairedItem, { item: 0 });
	assert.equal(items[1].json.valid, false);
	assert.deepEqual(items[1].pairedItem, { item: 1 });
	assert.equal(ctx.calls.length, 1);
});

test('example workflows use this node with parameters n8n resolves without issues', () => {
	const dir = join(__dirname, '../workflows');
	const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
	assert.ok(files.length >= 2);
	for (const file of files) {
		const workflow = JSON.parse(readFileSync(join(dir, file), 'utf8'));
		const strale = workflow.nodes.filter((n) => n.type === 'n8n-nodes-strale.strale');
		assert.ok(strale.length > 0, file);
		for (const n of strale) {
			assert.equal(n.typeVersion, description.version);
			assert.ok(n.credentials.straleApi, file);
			const values = NodeHelpers.getNodeParameters(description.properties, n.parameters, true, false, n, description);
			assert.equal(NodeHelpers.getNodeParametersIssues(description.properties, { ...n, parameters: values }, description), null, file);
		}
		assert.ok(workflow.connections, file);
	}
});
