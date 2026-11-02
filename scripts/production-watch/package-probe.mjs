import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { json, report } from './watch.mjs';

export function checkStartup(stderr, capabilities, solutions) {
  const match = /Loaded (\d+) capabilities, (\d+) solutions, (\d+) cap trust, (\d+) sol trust from https:\/\/api\.strale\.io/.exec(stderr);
  if (!match) throw new Error('Published package emitted no startup contract');
  const counts = match.slice(1).map(Number);
  if (counts.some((n) => n <= 0) || counts[0] !== capabilities || counts[1] !== solutions || counts[2] !== capabilities || counts[3] !== solutions) throw new Error(`Package/catalog contract mismatch: capabilities=${counts[0]}, cap trust=${counts[2]}, catalogue capabilities=${capabilities}; solutions=${counts[1]}, sol trust=${counts[3]}, catalogue solutions=${solutions}`);
  // Known-good output is allowlisted. Every other package diagnostic fails,
  // including any new logged-and-continued degradation we do not know yet.
  const unknown = stderr.split('\n').filter((line) => line.includes('[strale'))
    .filter((line) => !/\[strale-mcp\] (Loaded \d+ capabilities, \d+ solutions, \d+ cap trust, \d+ sol trust from https:\/\/api\.strale\.io|Server running on stdio \((?:6 meta-tools, )?\d+ capabilities, \d+ solutions\))$/.test(line.trim()));
  if (unknown.length) throw new Error('Published package logged a degradation');
  return counts;
}

export function checkSearch(search) {
  if (search.isError || !Array.isArray(search.content)) throw new Error('Published search failed');
  const data = search.content.find((c) => c.type === 'text')?.text;
  const results = JSON.parse(data ?? '{}').results;
  if (!Array.isArray(results) || !results.length) throw new Error('Published search returned no result');
}

class ConnectFailure extends Error {}

async function probeOnce({ cache, npmArgs = [], read = json, Transport = StdioClientTransport, ClientClass = Client } = {}) {
  const [caps, sols] = await Promise.all([read('https://api.strale.io/v1/capabilities'), read('https://api.strale.io/v1/solutions')]);
  if (!caps.capabilities?.length || !sols.solutions?.length) throw new Error('Empty live catalog');
  // This is the release smoke procedure: run the registry artefact, never
  // the local workspace. No key, paid tool, or package publish is involved.
  const cwd = await mkdtemp(join(process.cwd(), '.package-contract-'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'published-contract-probe', private: true }));
  const transport = new Transport({ command: 'npx', args: [...npmArgs, '-y', 'strale-mcp@latest'], stderr: 'pipe', cwd,
    ...(cache ? { env: { ...getDefaultEnvironment(), npm_config_cache: cache } } : {}) });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += chunk; });
  const client = new ClientClass({ name: 'strale-package-contract', version: '1.0.0' });
  const timer = setTimeout(() => { void transport.close(); }, 120_000);
  try {
    try { await client.connect(transport, { timeout: 120_000 }); }
    catch (cause) { throw new ConnectFailure('Published package install/connect failed', { cause }); }
    // Exercise an actual public MCP protocol request after initialize.
    const tools = await client.listTools({}, { timeout: 10_000 });
    if (!tools.tools?.length) throw new Error('Published package exposes no tools');
    const search = await client.callTool({ name: 'strale_search', arguments: { query: 'company' } }, undefined, { timeout: 10_000 });
    checkSearch(search);
    const counts = checkStartup(stderr, caps.capabilities.length, sols.solutions.length);
    return { counts, tools: tools.tools.length, startup: stderr.split('\n').filter((s) => s.includes('[strale-mcp]')).join('\n') };
  } finally {
    clearTimeout(timer);
    try { await client.close(); } finally {
      try { await transport.close(); } finally { await rm(cwd, { recursive: true, force: true }); }
    }
  }
}

export async function probe(options) {
  try { return await probeOnce(options); }
  catch (error) {
    if (!(error instanceof ConnectFailure)) throw error;
    return probeOnce(options);
  }
}

/** `options` is for the alert demonstration (demonstrate-alerts.mjs); the workflow passes none. */
export async function packageContract(github, context, options) {
  let result;
  let error;
  try { result = await probe(options); } catch (e) { error = e; }
  await report(github, context.repo, { label: 'package-contract', id: 'strale-mcp@latest', ok: !error, run: context.runId,
    body: error ? `Published MCP contract failed: ${error.message}` : `Published MCP contract passed: ${JSON.stringify(result)}` });
  if (error) throw error;
  return result;
}
