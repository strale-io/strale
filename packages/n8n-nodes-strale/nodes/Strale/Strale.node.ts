import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { checkVatNumber, companyRoutes, JobInputError, lookUpCompany, screenName } from './jobs';
import type { Execute } from './jobs';
import { billingAdvice, ITEM_DEADLINE_MS, runTool, withAdvice } from './transport';

const rerunNotice =
	'Each run is billed to your Strale wallet. Retrying or rerunning a workflow repeats completed checks and their charges.';

export class Strale implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Strale',
		name: 'strale',
		icon: { light: 'file:strale.svg', dark: 'file:strale.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Look up companies, check EU VAT numbers and screen names with Strale',
		defaults: {
			name: 'Strale',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'straleApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: rerunNotice,
				name: 'billingNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Person', value: 'person' },
					{ name: 'VAT Number', value: 'vatNumber' },
				],
				default: 'company',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['company'] } },
				options: [
					{
						name: 'Look Up',
						value: 'lookUp',
						description: 'Look up a company in its national business registry',
						action: 'Look up company',
					},
				],
				default: 'lookUp',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['vatNumber'] } },
				options: [
					{
						name: 'Check',
						value: 'check',
						description: 'Check an EU VAT number and return the registered name and address where available',
						action: 'Check VAT number',
					},
				],
				default: 'check',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['person'] } },
				options: [
					{
						name: 'Screen Name',
						value: 'screenName',
						description:
							'Screen a person name against sanctions and politically exposed person lists',
						action: 'Screen person name',
					},
				],
				default: 'screenName',
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'options',
				displayOptions: { show: { resource: ['company'], operation: ['lookUp'] } },
				options: [
					{ name: 'Finland', value: 'FI' },
					{ name: 'Norway', value: 'NO' },
					{ name: 'Sweden', value: 'SE' },
					{ name: 'United Kingdom', value: 'GB' },
				],
				default: 'GB',
				description: 'Country of the company registry to search',
			},
			{
				displayName: 'Look Up By',
				name: 'lookUpBy',
				type: 'options',
				displayOptions: { show: { resource: ['company'], operation: ['lookUp'] } },
				options: [
					{ name: 'Registration Number', value: 'registrationNumber' },
					{
						name: 'Company Name',
						value: 'companyName',
						description: 'Available for Finland, Norway and the United Kingdom',
					},
				],
				default: 'registrationNumber',
			},
			{
				displayName: 'Registration Number',
				name: 'registrationNumber',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['company'], operation: ['lookUp'], lookUpBy: ['registrationNumber'] },
				},
				default: '',
				placeholder: 'e.g. 00445790',
				description:
					'Company number (GB), organisation number (SE, NO) or business ID (FI)',
			},
			{
				displayName: 'Company Name',
				name: 'companyName',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['company'], operation: ['lookUp'], lookUpBy: ['companyName'] },
				},
				default: '',
				description:
					'Returns the best match from the registry. Check the returned registration number before relying on it.',
			},
			{
				displayName: 'VAT Number',
				name: 'vatNumber',
				type: 'string',
				required: true,
				displayOptions: { show: { resource: ['vatNumber'], operation: ['check'] } },
				default: '',
				placeholder: 'e.g. SE556703748501',
				description: 'EU VAT number including its two-letter country prefix',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				displayOptions: { show: { resource: ['person'], operation: ['screenName'] } },
				default: '',
				description:
					'Full name of the person. Potential matches are returned for you to review; they do not establish identity.',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				displayOptions: { show: { resource: ['person'], operation: ['screenName'] } },
				default: {},
				options: [
					{
						displayName: 'Country',
						name: 'country',
						type: 'string',
						default: '',
						placeholder: 'e.g. SE',
						description:
							'Two-letter country code, returned as context. It does not narrow the matches.',
					},
					{
						displayName: 'Date of Birth',
						name: 'birthDate',
						type: 'string',
						default: '',
						placeholder: 'YYYY-MM-DD',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const submitted: string[] = [];
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const deadline = Date.now() + ITEM_DEADLINE_MS;
				const execute: Execute = async (slug, inputs) =>
					await runTool(this, i, deadline, submitted, slug, inputs as IDataObject);

				let json: IDataObject;
				if (resource === 'company' && operation === 'lookUp') {
					const country = this.getNodeParameter('country', i) as string;
					const lookUpBy = this.getNodeParameter('lookUpBy', i) as string;
					if (lookUpBy === 'companyName' && !companyRoutes[country]?.names) {
						throw new NodeOperationError(
							this.getNode(),
							'Swedish lookup requires a registration number.',
							{ itemIndex: i },
						);
					}
					json = await lookUpCompany(
						lookUpBy === 'companyName'
							? { country, companyName: this.getNodeParameter('companyName', i) as string }
							: {
									country,
									registrationNumber: this.getNodeParameter('registrationNumber', i) as string,
								},
						execute,
					);
				} else if (resource === 'vatNumber' && operation === 'check') {
					json = await checkVatNumber(
						{ vatNumber: this.getNodeParameter('vatNumber', i) as string },
						execute,
					);
				} else if (resource === 'person' && operation === 'screenName') {
					const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
					json = await screenName(
						{
							name: this.getNodeParameter('name', i) as string,
							country: (extra.country as string | undefined) || undefined,
							birthDate: (extra.birthDate as string | undefined) || undefined,
						},
						execute,
					);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for "${resource}".`,
						{ itemIndex: i },
					);
				}

				returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				// runTool's errors already name the checks submitted for this item;
				// any other failure after a billed check is given the same advice.
				const wrapped =
					error instanceof JobInputError
						? new NodeOperationError(this.getNode(), error.message, { itemIndex: i })
						: submitted.length &&
							  !(error instanceof NodeApiError) &&
							  !(error instanceof NodeOperationError)
							? withAdvice(this, error, i, billingAdvice(submitted))
							: error;
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (wrapped as Error).message,
							description: (wrapped as { description?: string | null }).description ?? null,
							transaction_ids: submitted,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw wrapped;
			}
		}

		return [returnData];
	}
}
