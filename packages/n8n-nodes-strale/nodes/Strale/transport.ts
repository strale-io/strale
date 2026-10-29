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
export const ITEM_DEADLINE_MS = 60_000;
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

/**
 * Run one Strale tool and return its completed result. Never resubmits: a
 * pending check is polled by transaction ID, so a slow check is billed once.
 */
export async function runTool(
	ctx: IExecuteFunctions,
	itemIndex: number,
	deadline: number,
	slug: string,
	inputs: IDataObject,
): Promise<StraleResult> {
	const remaining = () => Math.max(1, Math.min(30_000, deadline - Date.now()));
	if (Date.now() >= deadline) {
		throw new NodeApiError(ctx.getNode(), {} as JsonObject, {
			itemIndex,
			message: 'The time limit for this item was reached.',
			description:
				'Earlier checks for this item may have completed and been billed. Review your Strale transactions before rerunning.',
		});
	}
	const response = await request(ctx, 'POST', '/v1/do', itemIndex, remaining(), {
		capability_slug: slug,
		inputs,
		max_price_cents: MAX_PRICE_CENTS,
		timeout_seconds: EXECUTION_TIMEOUT_SECONDS,
	});
	let result = asObject(response.result);
	const transactionId = typeof result.transaction_id === 'string' ? result.transaction_id : undefined;
	const advice = transactionId
		? `Review Strale transaction ${transactionId} before rerunning; it may already have completed and been billed.`
		: 'Review your Strale transactions before rerunning; completed checks may already have been billed.';
	while (result.status === 'executing' && transactionId && Date.now() < deadline - 1_500) {
		await sleep(POLL_INTERVAL_MS);
		try {
			result = await request(
				ctx,
				'GET',
				`/v1/transactions/${encodeURIComponent(transactionId)}`,
				itemIndex,
				remaining(),
			);
		} catch (error) {
			// Rerunning the item would repeat the billed POST, so every failure
			// to read the result carries the transaction to review.
			const description =
				error instanceof NodeApiError
					? [error.description, advice].filter(Boolean).join(' ')
					: advice;
			// The NodeApiError constructor returns an existing NodeApiError
			// unchanged, so rebuild it from its parts to attach the advice.
			throw error instanceof NodeApiError
				? new NodeApiError(ctx.getNode(), { message: error.message } as JsonObject, {
						itemIndex,
						message: error.message,
						httpCode: error.httpCode ?? undefined,
						description,
					})
				: new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex, description });
		}
	}
	if (result.status !== 'completed') {
		throw new NodeApiError(ctx.getNode(), result as JsonObject, {
			itemIndex,
			message: `Strale transaction ${transactionId ?? '(ID unavailable)'} has not completed successfully.`,
			description: asObject(result.details).fix
				? String(asObject(result.details).fix)
				: advice,
		});
	}
	return result as unknown as StraleResult;
}
