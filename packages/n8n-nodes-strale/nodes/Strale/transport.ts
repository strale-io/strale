import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

import type { StraleResult } from './jobs';

// Kept equal to package.json's version by the test suite. Reading
// package.json at runtime would be file access, which verified nodes avoid.
export const VERSION = '1.0.0';
export const CLIENT = `n8n-nodes-strale/${VERSION}`;
export const BASE_URL = 'https://api.strale.io';

// Every check is capped at one euro and asks Strale to finish within 20 s.
// A check still running after that is polled until this item's deadline.
export const MAX_PRICE_CENTS = 100;
const EXECUTION_TIMEOUT_SECONDS = 20;
// Long enough for both screening checks to be polled to completion.
export const ITEM_DEADLINE_MS = 90_000;
// Time a POST is allowed: the requested execution time plus network margin.
const POST_BUDGET_MS = (EXECUTION_TIMEOUT_SECONDS + 10) * 1_000;
const POLL_INTERVAL_MS = 1_000;

interface ErrorBody {
	error_code?: string;
	message?: string;
	retryable?: boolean;
	details?: { fix?: string; next_step?: string; retryable?: boolean };
}

interface FullResponse {
	statusCode: number;
	body: unknown;
}

function asObject(value: unknown): IDataObject {
	return value && typeof value === 'object' ? (value as IDataObject) : {};
}

async function request(
	ctx: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	itemIndex: number,
	timeout: number,
	body?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		qs: { src: 'n8n' },
		headers: { 'X-Strale-Client': CLIENT },
		json: true,
		timeout,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		...(body ? { body } : {}),
	};
	const response = (await ctx.helpers.httpRequestWithAuthentication.call(
		ctx,
		'straleApi',
		options,
	)) as FullResponse;
	const parsed = asObject(response.body);
	if (response.statusCode >= 400) {
		const error = parsed as ErrorBody;
		const fix = error.details?.fix ?? error.details?.next_step;
		const auth =
			response.statusCode === 401 ||
			['invalid_api_key', 'invalid_key', 'key_revoked', 'key_expired'].includes(
				error.error_code ?? '',
			);
		throw new NodeApiError(ctx.getNode(), parsed as JsonObject, {
			itemIndex,
			httpCode: String(response.statusCode),
			message: error.message ?? 'Strale could not complete this request.',
			description:
				[fix, auth ? 'Check the API key in your Strale credential.' : undefined]
					.filter(Boolean)
					.join(' ') || undefined,
		});
	}
	return parsed;
}

/** Review advice naming the checks already submitted for this item. */
export function billingAdvice(submitted: string[]): string {
	return submitted.length
		? `Review Strale ${submitted.length > 1 ? 'transactions' : 'transaction'} ${submitted.join(', ')} before rerunning; ${submitted.length > 1 ? 'they' : 'it'} may already have completed and been billed.`
		: 'Review your Strale transactions before rerunning; completed checks may already have been billed.';
}

/**
 * Returns an n8n error carrying the billing advice. The NodeApiError
 * constructor hands back an existing NodeApiError unchanged, so one is rebuilt
 * from its parts; anything else (a network failure) is wrapped.
 */
export function withAdvice(
	ctx: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
	advice: string,
): NodeApiError {
	if (error instanceof NodeApiError) {
		return new NodeApiError(ctx.getNode(), { message: error.message } as JsonObject, {
			itemIndex,
			message: error.message,
			httpCode: error.httpCode ?? undefined,
			description: [error.description, advice].filter(Boolean).join(' '),
		});
	}
	return new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex, description: advice });
}

/**
 * Run one Strale tool and return its completed result. Never resubmits: a
 * pending check is polled by transaction ID, so a slow check is billed once.
 * Each submitted transaction ID is appended to `submitted` as soon as it is
 * known, so a later failure in the same item can name it.
 */
export async function runTool(
	ctx: IExecuteFunctions,
	itemIndex: number,
	deadline: number,
	submitted: string[],
	slug: string,
	inputs: IDataObject,
): Promise<StraleResult> {
	const remaining = () => Math.max(1, Math.min(POST_BUDGET_MS, deadline - Date.now()));
	// A billed check is only started when it has its full time budget, so the
	// client never gives up on a call the server is still running and billing.
	if (deadline - Date.now() < POST_BUDGET_MS) {
		throw new NodeApiError(ctx.getNode(), {} as JsonObject, {
			itemIndex,
			message: 'The time limit for this item was reached before the next check could start.',
			description: billingAdvice(submitted),
		});
	}
	let response: IDataObject;
	try {
		response = await request(ctx, 'POST', '/v1/do', itemIndex, remaining(), {
			capability_slug: slug,
			inputs,
			max_price_cents: MAX_PRICE_CENTS,
			timeout_seconds: EXECUTION_TIMEOUT_SECONDS,
		});
	} catch (error) {
		// An HTTP answer from Strale is self-explanatory; a lost connection may
		// have come after the check was accepted and billed.
		throw error instanceof NodeApiError && error.httpCode
			? withAdvice(ctx, error, itemIndex, submitted.length ? billingAdvice(submitted) : '')
			: withAdvice(
					ctx,
					error,
					itemIndex,
					`The connection to Strale was lost; this ${slug} check may have run and been billed. ${billingAdvice(submitted)}`,
				);
	}
	let result = asObject(response.result);
	const transactionId = typeof result.transaction_id === 'string' ? result.transaction_id : undefined;
	if (transactionId) submitted.push(transactionId);
	while (result.status === 'executing' && transactionId && Date.now() < deadline - 1_500) {
		await sleep(POLL_INTERVAL_MS);
		try {
			// GET /v1/transactions/:id answers with the flat transaction record.
			result = await request(
				ctx,
				'GET',
				`/v1/transactions/${encodeURIComponent(transactionId)}`,
				itemIndex,
				remaining(),
			);
		} catch (error) {
			// Rerunning the item would repeat the billed POST, so every failure
			// to read the result carries the transactions to review.
			throw withAdvice(ctx, error, itemIndex, billingAdvice(submitted));
		}
	}
	if (result.status !== 'completed') {
		const fix = asObject(result.details).fix;
		throw new NodeApiError(ctx.getNode(), result as JsonObject, {
			itemIndex,
			message: `Strale transaction ${transactionId ?? '(ID unavailable)'} has not completed successfully.`,
			description: [fix ? String(fix) : undefined, billingAdvice(submitted)].filter(Boolean).join(' '),
		});
	}
	return { ...(result as unknown as StraleResult), transaction_id: transactionId };
}
