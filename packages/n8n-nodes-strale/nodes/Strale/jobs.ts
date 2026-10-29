// The fixed jobs this node offers. They mirror the Zapier app's job module
// (packages/zapier-strale/lib/jobs.js in the Strale repository): the same
// tools, the same inputs sent to them and the same output fields. A parity
// test holds the two together. A verified n8n package may not have runtime
// dependencies, so the definitions are ported here rather than imported.
//
// There is no arbitrary-tool operation. Each job names its tools.

export interface StraleResult {
	transaction_id?: string;
	status?: string;
	output: Record<string, unknown>;
	provenance?: { source?: string; fetched_at?: string };
}

export type Execute = (slug: string, inputs: Record<string, unknown>) => Promise<StraleResult>;

export class JobInputError extends Error {}

export interface CompanyRoute {
	slug: string;
	input: string;
	output: string;
	names: boolean;
}

export const companyRoutes: Record<string, CompanyRoute> = {
	GB: { slug: 'uk-company-data', input: 'company_number', output: 'company_number', names: true },
	SE: { slug: 'swedish-company-data', input: 'org_number', output: 'org_number', names: false },
	NO: { slug: 'norwegian-company-data', input: 'org_number', output: 'org_number', names: true },
	FI: { slug: 'finnish-company-data', input: 'business_id', output: 'business_id', names: true },
};

export const jobTools: Record<string, string[]> = {
	lookUpCompany: Object.values(companyRoutes).map((route) => route.slug),
	checkVatNumber: ['vat-validate'],
	screenName: ['sanctions-check', 'pep-check'],
};

function requiredText(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.trim().length < 2) {
		throw new JobInputError(`${label} must contain at least two characters.`);
	}
	return value.trim();
}

export function countryCode(value: unknown): string {
	const code = requiredText(value, 'Country').toUpperCase();
	if (!/^[A-Z]{2}$/.test(code)) throw new JobInputError('Use a two-letter country code.');
	return code === 'UK' ? 'GB' : code;
}

function evidence(result: StraleResult) {
	return {
		source: result.provenance?.source ?? null,
		fetched_at: result.provenance?.fetched_at ?? null,
	};
}

function text(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

export interface LookUpCompanyInput {
	country: string;
	registrationNumber?: string;
	companyName?: string;
}

export async function lookUpCompany(input: LookUpCompanyInput, execute: Execute) {
	const code = countryCode(input.country);
	const route = companyRoutes[code];
	if (!route) throw new JobInputError('Choose GB, SE, NO or FI.');
	const number = input.registrationNumber?.trim();
	const name = input.companyName?.trim();
	if (number && name) {
		throw new JobInputError('Supply a registration number or a company name, not both.');
	}
	if (!number && !route.names) {
		throw new JobInputError('Swedish lookup requires a registration number.');
	}
	const inputs = number
		? { [route.input]: requiredText(number, 'Registration number') }
		: { company_name: requiredText(name, 'Company name') };
	const result = await execute(route.slug, inputs);
	const output = result.output;
	const address = output.registered_address as
		| { street?: string; postal_code?: string; city?: string; country?: string }
		| undefined;
	return {
		company_name: text(output.company_name),
		registration_number: text(output[route.output]),
		country: code,
		status: text(output.status),
		address:
			text(output.address) ??
			(address
				? [address.street, address.postal_code, address.city, address.country]
						.filter(Boolean)
						.join(', ')
				: null),
		...evidence(result),
		transaction_id: result.transaction_id ?? null,
	};
}

export async function checkVatNumber(input: { vatNumber: string }, execute: Execute) {
	const result = await execute('vat-validate', {
		vat_number: requiredText(input.vatNumber, 'VAT number'),
	});
	const output = result.output;
	return {
		valid: output.valid ?? null,
		vat_number: output.vat_number ?? null,
		company_name: output.company_name ?? null,
		company_address: output.company_address ?? null,
		country_code: output.country_code ?? null,
		...evidence(result),
		transaction_id: result.transaction_id ?? null,
	};
}

export interface ScreenNameInput {
	name: string;
	country?: string;
	birthDate?: string;
}

export async function screenName(input: ScreenNameInput, execute: Execute) {
	const name = requiredText(input.name, 'Name');
	const context = input.country ? { country: countryCode(input.country) } : {};
	const birthDate = input.birthDate?.trim();
	if (
		birthDate &&
		(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
			Number.isNaN(Date.parse(birthDate)) ||
			new Date(birthDate).toISOString().slice(0, 10) !== birthDate)
	) {
		throw new JobInputError('Use a valid birth date in YYYY-MM-DD format.');
	}
	// Sequential: the second billable check does not start if the first fails.
	const sanctions = await execute('sanctions-check', {
		name,
		entity_type: 'person',
		...context,
		...(birthDate ? { birth_date: birthDate } : {}),
	});
	const pep = await execute('pep-check', {
		name,
		...context,
		...(birthDate ? { date_of_birth: birthDate } : {}),
	});
	const check = (result: StraleResult, timeKey: string) => ({
		match_count: result.output.match_count ?? null,
		matches: result.output.matches ?? null,
		lists: result.output.lists_queried ?? null,
		source: result.output.source ?? null,
		checked_at: result.output[timeKey] ?? null,
		transaction_id: result.transaction_id ?? null,
	});
	return {
		name,
		sanctions: check(sanctions, 'queried_at'),
		pep: check(pep, 'screened_at'),
	};
}
