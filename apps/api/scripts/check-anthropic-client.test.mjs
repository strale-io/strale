import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasDirectAnthropic } from './check-anthropic-client.mjs';
test('blocks a planted direct constructor and SDK import alias', () => {
  assert.equal(hasDirectAnthropic('const client = new Anthropic({});'), true);
  assert.equal(hasDirectAnthropic('import Client from "@anthropic-ai/sdk"; new Client({});'), true);
  assert.equal(hasDirectAnthropic('const client = createAnthropicClient({});'), false);
});

test('blocks namespace, named and dynamic SDK construction', () => {
  for (const source of [
    'import * as SDK from "@anthropic-ai/sdk"; new SDK.default({});',
    'import * as SDK from "@anthropic-ai/sdk"; new SDK.Anthropic({});',
    'import * as Anthropic from "@anthropic-ai/sdk"; new Anthropic["default"]({});',
    'import { Anthropic as Client } from "@anthropic-ai/sdk"; new Client({});',
    'const { default: Client } = await import("@anthropic-ai/sdk"); new Client({});',
    'new (await import("@anthropic-ai/sdk")).default({});',
  ]) assert.equal(hasDirectAnthropic(source), true, source);
  assert.equal(hasDirectAnthropic('import type * as SDK from "@anthropic-ai/sdk"; const x = createAnthropicClient();'), false);
});
