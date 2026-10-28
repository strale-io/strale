#!/usr/bin/env node
// SYNCED FROM wow-core — edit there. Shared, conditional GitHub REST client (Node >=18).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class GitHubApiError extends Error {}

function executable(bin, args) {
  return /\.(?:c|m)?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
}
function invoke(args, { bin = process.env.WOW_GH_API_GH || 'gh', input } = {}) {
  const [command, argv] = executable(bin, args);
  try {
    return execFileSync(command, argv, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true, timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const output = String(error.stdout || '');
    if (output) return output; // gh exits non-zero for HTTP failures but still supplies -i output.
    const detail = String(error.stderr || error.message || 'GitHub API request failed').trim().split(/\r?\n/, 1)[0];
    throw new GitHubApiError(detail || 'GitHub API request failed');
  }
}
function response(text) {
  let offset = 0, status, headerText, body;
  // Only consume response blocks at the start. A JSON/string body is allowed to begin with "HTTP/".
  while (true) {
    const block = text.slice(offset); const match = block.match(/^HTTP\/\S+\s+(\d{3})[^\r\n]*\r?\n/);
    if (!match) break;
    const split = block.search(/\r?\n\r?\n/);
    if (split < 0) { headerText = block; body = ''; status = Number(match[1]); break; }
    status = Number(match[1]); headerText = block.slice(0, split);
    const separator = block.slice(split).match(/^\r?\n\r?\n/)[0];
    body = block.slice(split + separator.length);
    // Interim responses can precede the real response. Never reinterpret a final response body.
    if (status < 100 || status >= 200) break;
    offset += split + separator.length;
  }
  if (status === undefined) throw new GitHubApiError('GitHub API returned no HTTP status');
  const headers = {};
  for (const line of headerText.split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(':'); if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { status, headers, body };
}
function cachePath(endpoint, root) {
  const key = createHash('sha256').update(`${process.env.GH_HOST || 'github.com'}\n${endpoint}`).digest('hex');
  return path.join(root || process.env.WOW_GH_CACHE_HOME || path.join(os.homedir(), '.wow-core', 'gh-cache'), `${key}.json`);
}
function cached(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && typeof value.etag === 'string' && Object.hasOwn(value, 'body') ? value : null;
  } catch { return null; }
}
function save(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  try { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(temp, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 }); renameSync(temp, file); }
  catch { try { rmSync(temp, { force: true }); } catch {} }
}
function json(body) { try { return JSON.parse(body); } catch { throw new GitHubApiError('GitHub API returned invalid JSON'); } }
function limited(result) {
  return result.status === 429 || (result.status === 403 && (result.headers['x-ratelimit-remaining'] === '0' ||
    result.headers['retry-after'] !== undefined || /rate\s*limit/i.test(result.body)));
}
const pendingReset = new Map();
function waitDelay(delay, reset, options) {
  const maximum = options.maxWaitMs ?? 15 * 60_000;
  delay = Math.max(0, Math.min(maximum, delay));
  (options.onRateLimit || (() => {}))({ reset, delay });
  return (options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(delay);
}
async function backoff(result, options) {
  const retry = Number(result.headers['retry-after']);
  if (Number.isFinite(retry) && retry >= 0) return waitDelay(retry * 1000, undefined, options);
  const raw = invoke(['api', 'rate_limit'], options); const data = json(raw);
  const reset = Number(data?.resources?.core?.reset ?? data?.rate?.reset);
  if (!Number.isFinite(reset)) throw new GitHubApiError('GitHub rate limit response omitted reset');
  const now = options.now ? options.now() : Date.now();
  await waitDelay(reset * 1000 - now + 3_000, reset, options);
}

export async function ghGet(endpoint, options = {}) {
  const file = cachePath(endpoint, options.cacheRoot); const old = cached(file);
  const budget = process.env.GH_HOST || 'github.com'; const now = options.now ? options.now() : Date.now();
  if ((pendingReset.get(budget) || 0) * 1000 > now) {
    await waitDelay(pendingReset.get(budget) * 1000 - now + 3_000, pendingReset.get(budget), options);
    pendingReset.delete(budget);
  }
  const args = ['api', '-i', endpoint]; if (old?.etag) args.push('-H', `If-None-Match: ${old.etag}`);
  let result = response(invoke(args, options));
  if (limited(result)) {
    await backoff(result, options);
    if ([403, 429].includes(result.status)) result = response(invoke(args, options));
  }
  if ((result.status === 304 || (result.status >= 200 && result.status < 300)) && result.headers['x-ratelimit-remaining'] === '0') {
    const reset = Number(result.headers['x-ratelimit-reset']); if (Number.isFinite(reset)) pendingReset.set(budget, reset);
  }
  if (result.status === 304) {
    if (!old || !Object.hasOwn(old, 'body')) throw new GitHubApiError('GitHub returned 304 without a cached body');
    return old.body;
  }
  if (result.status < 200 || result.status >= 300) throw new GitHubApiError(`GitHub API returned HTTP ${result.status}`);
  const body = json(result.body); const etag = result.headers.etag;
  if (etag) save(file, { etag, body });
  return body;
}

export async function ghWrite(endpoint, method, body, options = {}) {
  const args = ['api', '-i', endpoint, '--method', method, '--input', '-'];
  let result = response(invoke(args, { ...options, input: JSON.stringify(body) }));
  if (limited(result)) {
    await backoff(result, options);
    // A successful write consumed the last call but already took effect; never duplicate it.
    if ([403, 429].includes(result.status)) result = response(invoke(args, { ...options, input: JSON.stringify(body) }));
  }
  if (result.status < 200 || result.status >= 300) throw new GitHubApiError(`GitHub API returned HTTP ${result.status}`);
  return json(result.body);
}
