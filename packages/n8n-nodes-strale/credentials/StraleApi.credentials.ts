import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class StraleApi implements ICredentialType {
	name = 'straleApi';

	displayName = 'Strale API';

	icon: Icon = { light: 'file:../nodes/Strale/strale.svg', dark: 'file:../nodes/Strale/strale.dark.svg' };

	documentationUrl = 'https://github.com/strale-io/strale/tree/main/packages/n8n-nodes-strale#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Your Strale API key. Each check is paid from your prepaid Strale wallet.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// An authenticated read of the wallet balance. It runs no paid check.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.strale.io',
			url: '/v1/wallet/balance',
			method: 'GET',
		},
	};
}
