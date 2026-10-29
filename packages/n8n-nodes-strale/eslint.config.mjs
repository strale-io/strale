// The rules `n8n-node lint` applies (@n8n/node-cli 0.54 configs/eslint), with
// the plugin versions n8n's community package scanner uses. @n8n/node-cli
// itself is not a dependency: it pulls n8n's AI SDK and a native addon
// (isolated-vm) that does not build on this repository's Node 20 CI.
import js from '@eslint/js';
import { n8nCommunityNodesPlugin } from '@n8n/eslint-plugin-community-nodes';
import { defineConfig, globalIgnores } from 'eslint/config';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';
import tseslint from 'typescript-eslint';

const recommended = n8nCommunityNodesPlugin.configs.recommended;

export default defineConfig(
	globalIgnores(['dist', 'test', 'scripts', 'eslint.config.mjs']),
	{
		files: ['**/*.ts'],
		extends: [js.configs.recommended, tseslint.configs.recommended, recommended],
		rules: { 'prefer-spread': 'off', 'no-console': 'error' },
	},
	{ plugins: { 'n8n-nodes-base': n8nNodesBase } },
	{
		files: ['package.json', '**/*.node.json'],
		extends: [recommended],
		rules: { ...n8nNodesBase.configs.community.rules },
		languageOptions: { parser: tseslint.parser, parserOptions: { extraFileExtensions: ['.json'] } },
	},
	{
		files: ['credentials/**/*.ts'],
		rules: {
			...n8nNodesBase.configs.credentials.rules,
			'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
			'n8n-nodes-base/cred-class-field-type-options-password-missing': 'off',
		},
	},
	{
		files: ['nodes/**/*.ts'],
		rules: {
			...n8nNodesBase.configs.nodes.rules,
			'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
			'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
			'n8n-nodes-base/node-param-type-options-max-value-present': 'off',
		},
	},
);
