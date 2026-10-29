import { CLIENT_ID, VERSION } from "./package-version.js";

// Agent-safe CLI for the Strale API. Contract (README "Contract"):
//   - exactly one JSON document on stdout on success, nothing else;
//   - one JSON error document on stderr on failure, with the API's stable
//     error_code and its fix text, and a documented non-zero exit code;
//   - never prompts, never reads stdin, never colours, never checks for a TTY;
//   - the API key comes from STRALE_API_KEY and nowhere else;
//   - `run` refuses to send anything without --max-price-cents.

export const API_BASE_URL = "https://api.strale.io";
const REQUEST_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;
const DEFAULT_WAIT_SECONDS = 120;
/** The API's absolute per-request cap (MAX_PRICE_CAP_CENTS in apps/api/src/routes/do.ts). */
const MAX_PRICE_CAP_CENTS = 2000;

export const EXIT = {
  OK: 0,
  API_ERROR: 1,
  USAGE: 2,
  AUTH: 3,
  PAYMENT: 4,
  RATE_LIMITED: 5,
  NETWORK: 6,
} as const;

const AUTH_CODES = new Set(["unauthorized", "primary_key_required"]);
const PAYMENT_CODES = new Set([
  "payment_required",
  "insufficient_balance",
  "budget_exceeded",
  "spend_cap_exceeded",
  "key_hourly_cap_exceeded",
  "key_total_cap_exceeded",
]);

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface CliDeps {
  env: Record<string, string | undefined>;
  io: CliIo;
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface CliErrorBody {
  error_code: string;
  message: string;
  fix?: string;
  retryable?: boolean;
  next_step?: string;
  http_status?: number;
  source: "api" | "cli";
  details?: Record<string, unknown>;
}

class CliError extends Error {
  constructor(readonly body: CliErrorBody, readonly exitCode: number) {
    super(body.message);
  }
}

function usage(message: string, fix: string): CliError {
  return new CliError({ error_code: "invalid_request", message, fix, retryable: false, source: "cli" }, EXIT.USAGE);
}

export function exitCodeFor(errorCode: string, httpStatus?: number): number {
  if (AUTH_CODES.has(errorCode) || httpStatus === 401) return EXIT.AUTH;
  if (PAYMENT_CODES.has(errorCode) || httpStatus === 402) return EXIT.PAYMENT;
  if (errorCode === "rate_limited" || httpStatus === 429) return EXIT.RATE_LIMITED;
  return EXIT.API_ERROR;
}

// ─── Argument parsing ────────────────────────────────────────────────────────

interface Parsed {
  positionals: string[];
  flags: Map<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(["dry-run", "full", "help"]);

function parseArgs(argv: string[], allowed: Set<string>): Parsed {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-h") {
      flags.set("help", true);
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!allowed.has(name) && name !== "help") {
      throw usage(`Unknown option '--${name}'.`, `Run 'strale help' for the options each command accepts.`);
    }
    if (flags.has(name)) {
      throw usage(`Option '--${name}' was given more than once.`, `Pass '--${name}' once.`);
    }
    if (BOOLEAN_FLAGS.has(name)) {
      if (eq !== -1) throw usage(`Option '--${name}' takes no value.`, `Pass '--${name}' on its own.`);
      flags.set(name, true);
      continue;
    }
    let value: string | undefined;
    if (eq !== -1) value = arg.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) value = argv[++i];
    if (value === undefined) {
      throw usage(`Option '--${name}' needs a value.`, `Pass '--${name} <value>' or '--${name}=<value>'.`);
    }
    flags.set(name, value);
  }
  return { positionals, flags };
}

function stringFlag(p: Parsed, name: string): string | undefined {
  const v = p.flags.get(name);
  return typeof v === "string" ? v : undefined;
}

function intFlag(p: Parsed, name: string, min: number, max: number): number | undefined {
  const raw = stringFlag(p, name);
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) < min || Number(raw) > max) {
    throw usage(`'--${name}' must be a whole number from ${min} to ${max}; got '${raw}'.`, `Pass '--${name}' as an integer between ${min} and ${max}.`);
  }
  return Number(raw);
}

function oneQueryArg(p: Parsed, command: string, what: string): string {
  const text = p.positionals.join(" ").trim();
  if (!text) throw usage(`'strale ${command}' needs ${what}.`, `Run 'strale ${command} <${what.replace(/^an? /, "")}>'.`);
  return text;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  auth?: "required" | "optional" | "none";
  headers?: Record<string, string>;
}

async function request<T>(deps: CliDeps, opts: RequestOptions): Promise<T> {
  const apiKey = deps.env.STRALE_API_KEY?.trim() || undefined;
  if (opts.auth === "required" && !apiKey) {
    throw new CliError(
      {
        error_code: "unauthorized",
        message: "STRALE_API_KEY is not set.",
        fix: "Set the STRALE_API_KEY environment variable to your API key (sk_live_...). Get one at https://strale.dev/signup.",
        retryable: false,
        source: "cli",
      },
      EXIT.AUTH,
    );
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": CLIENT_ID,
    "X-Strale-Client": CLIENT_ID,
    ...opts.headers,
  };
  if (apiKey && opts.auth !== "none") headers.Authorization = `Bearer ${apiKey}`;
  const init: RequestInit = { method: opts.method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  let response: Response;
  try {
    response = await deps.fetch(`${API_BASE_URL}${opts.path}`, init);
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new CliError(
      {
        error_code: timedOut ? "timeout_exceeded" : "network_error",
        message: timedOut
          ? `No response from ${API_BASE_URL} within ${REQUEST_TIMEOUT_MS / 1000} seconds.`
          : `Could not reach ${API_BASE_URL}: ${err instanceof Error ? err.message : String(err)}`,
        fix: "Check network access to api.strale.io and retry.",
        retryable: true,
        source: "cli",
      },
      EXIT.NETWORK,
    );
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (response.status === 402 && body.x402Version !== undefined && body.error_code === undefined) {
      // Keyless call to a paid tool: the API answers with an x402 challenge,
      // which has no error_code. The CLI does not sign x402 payments.
      throw new CliError(
        {
          error_code: "payment_required",
          message: typeof body.error === "string" ? body.error : "This tool is not free.",
          fix: "Set STRALE_API_KEY to pay from your Strale wallet (sign up at https://strale.dev/signup), or pay per call over x402 by signing one of 'details.accepts' and sending it as the X-PAYMENT header to POST https://api.strale.io/v1/do; the CLI does not sign x402 payments.",
          retryable: false,
          source: "api",
          http_status: 402,
          details: { x402Version: body.x402Version, accepts: body.accepts },
        },
        EXIT.PAYMENT,
      );
    }
    const details = body.details && typeof body.details === "object" ? (body.details as Record<string, unknown>) : undefined;
    const errorCode = typeof body.error_code === "string" ? body.error_code : "execution_failed";
    const out: CliErrorBody = {
      error_code: errorCode,
      message:
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : `HTTP ${response.status} from the Strale API.`,
      source: "api",
      http_status: response.status,
    };
    if (typeof details?.fix === "string") out.fix = details.fix;
    if (typeof details?.retryable === "boolean") out.retryable = details.retryable;
    if (typeof details?.next_step === "string") out.next_step = details.next_step;
    // Some refusals carry guidance at the top level (free_capabilities, hint,
    // self_signup); keep it alongside details so the agent sees all of it.
    const { error_code: _code, message: _message, error: _error, details: _details, ...topLevel } = body;
    const { fix: _fix, retryable: _retryable, next_step: _nextStep, ...rest } = details ?? {};
    const extra = { ...topLevel, ...rest };
    if (Object.keys(extra).length > 0) out.details = extra;
    throw new CliError(out, exitCodeFor(errorCode, response.status));
  }

  if (data === undefined) {
    throw new CliError(
      {
        error_code: "execution_failed",
        message: `The Strale API answered HTTP ${response.status} with a body that is not JSON.`,
        fix: "Retry; if it persists, report it at https://github.com/strale-io/strale/issues.",
        retryable: true,
        http_status: response.status,
        source: "cli",
      },
      EXIT.API_ERROR,
    );
  }
  return data as T;
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdSearch(deps: CliDeps, argv: string[]): Promise<unknown> {
  const p = parseArgs(argv, new Set(["limit"]));
  const query = oneQueryArg(p, "search", "a query");
  if (query.length < 2) throw usage("The search query must be at least 2 characters.", "Pass a longer query.");
  const limit = intFlag(p, "limit", 1, 10) ?? 10;
  return request(deps, {
    method: "GET",
    path: `/v1/suggest/typeahead?q=${encodeURIComponent(query)}&limit=${limit}&src=cli`,
    auth: "none",
  });
}

interface CatalogCapability {
  slug: string;
  name?: string;
  description?: string;
  category?: string;
  price_cents?: number | null;
  is_free_tier?: boolean;
  [key: string]: unknown;
}

async function cmdTools(deps: CliDeps, argv: string[]): Promise<unknown> {
  const p = parseArgs(argv, new Set(["category", "full"]));
  if (p.positionals.length > 0) throw usage(`'strale tools' takes no arguments; got '${p.positionals.join(" ")}'.`, "Use '--category <name>' to filter, or 'strale search <query>' to search.");
  const category = stringFlag(p, "category");
  const data = await request<{ capabilities?: CatalogCapability[] }>(deps, {
    method: "GET",
    path: "/v1/capabilities?src=cli",
    auth: "none",
  });
  let tools = Array.isArray(data.capabilities) ? data.capabilities : [];
  if (category) tools = tools.filter((t) => t.category === category);
  if (!p.flags.has("full")) {
    tools = tools.map((t) => ({
      slug: t.slug,
      name: t.name,
      category: t.category,
      price_cents: t.price_cents ?? null,
      is_free_tier: t.is_free_tier === true,
      description: t.description,
    }));
  }
  return { count: tools.length, tools };
}

async function cmdBalance(deps: CliDeps, argv: string[]): Promise<unknown> {
  const p = parseArgs(argv, new Set());
  if (p.positionals.length > 0) throw usage(`'strale balance' takes no arguments; got '${p.positionals.join(" ")}'.`, "Run 'strale balance' on its own.");
  return request(deps, { method: "GET", path: "/v1/wallet/balance?src=cli", auth: "required" });
}

interface DoBody {
  result?: { status?: string; transaction_id?: string };
  [key: string]: unknown;
}

async function cmdRun(deps: CliDeps, argv: string[]): Promise<unknown> {
  const p = parseArgs(argv, new Set(["input", "max-price-cents", "timeout", "idempotency-key", "wait", "dry-run"]));
  if (p.positionals.length !== 1) {
    throw usage(
      p.positionals.length === 0 ? "'strale run' needs a capability slug." : `'strale run' takes one slug; got '${p.positionals.join(" ")}'.`,
      "Run 'strale run <slug> --input '<json>' --max-price-cents <n>'. Find slugs with 'strale search <query>'.",
    );
  }
  const slug = p.positionals[0]!;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw usage(`'${slug}' is not a capability slug.`, "Slugs are lowercase words joined by hyphens, e.g. 'iban-validate'. Find one with 'strale search <query>'.");
  }
  const maxPriceCents = intFlag(p, "max-price-cents", 0, MAX_PRICE_CAP_CENTS);
  if (maxPriceCents === undefined) {
    throw usage(
      "'strale run' refuses to run without a price cap.",
      `Pass '--max-price-cents <n>': the most you will pay for this call, in euro cents (0 to ${MAX_PRICE_CAP_CENTS}). Use 0 for free-tier tools.`,
    );
  }
  const rawInput = stringFlag(p, "input") ?? "{}";
  let inputs: unknown;
  try {
    inputs = JSON.parse(rawInput);
  } catch (err) {
    throw usage(`'--input' is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, `Pass the input as a JSON object in single quotes, e.g. --input '{"iban":"DE89370400440532013000"}'.`);
  }
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    throw usage("'--input' must be a JSON object.", `Pass the input as a JSON object, e.g. --input '{"iban":"DE89370400440532013000"}'.`);
  }
  const timeoutSeconds = intFlag(p, "timeout", 5, 60);
  const waitSeconds = intFlag(p, "wait", 0, 600) ?? DEFAULT_WAIT_SECONDS;
  const idempotencyKey = stringFlag(p, "idempotency-key");
  if (idempotencyKey !== undefined && (idempotencyKey.length === 0 || idempotencyKey.length > 255)) {
    throw usage("'--idempotency-key' must be 1 to 255 characters.", "Pass a shorter key, such as a UUID.");
  }

  const body: Record<string, unknown> = { capability_slug: slug, inputs, max_price_cents: maxPriceCents };
  if (timeoutSeconds !== undefined) body.timeout_seconds = timeoutSeconds;
  if (p.flags.has("dry-run")) body.dry_run = true;
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  // The API rejects max_price_cents <= 0 from an authenticated caller, so a
  // cap of 0 ("free tier only") is sent without the key, on the keyless path.
  const auth = maxPriceCents === 0 ? "none" : "optional";
  const first = await request<DoBody>(deps, { method: "POST", path: "/v1/do?src=cli", body, auth, headers });
  const txId = first.result?.transaction_id;
  if (first.result?.status !== "executing" || !txId) return first;
  return poll(deps, txId, waitSeconds);
}

async function poll(deps: CliDeps, txId: string, waitSeconds: number): Promise<unknown> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const deadline = now() + waitSeconds * 1000;
  let last: Record<string, unknown> = {};
  while (now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    last = await request<Record<string, unknown>>(deps, {
      method: "GET",
      path: `/v1/transactions/${encodeURIComponent(txId)}?src=cli`,
      auth: "optional",
    });
    if (last.status === "completed") return last;
    if (last.status === "failed") {
      const details = last.details && typeof last.details === "object" ? (last.details as Record<string, unknown>) : {};
      const out: CliErrorBody = {
        error_code: "execution_failed",
        message: typeof last.error === "string" ? last.error : "The capability failed.",
        source: "api",
        details: { ...details, transaction_id: txId },
      };
      if (typeof details.fix === "string") out.fix = details.fix;
      if (typeof details.retryable === "boolean") out.retryable = details.retryable;
      throw new CliError(out, EXIT.API_ERROR);
    }
  }
  throw new CliError(
    {
      error_code: "timeout_exceeded",
      message: `Transaction ${txId} was still '${String(last.status ?? "executing")}' after ${waitSeconds} seconds.`,
      fix: `The call was accepted and may already be charged; do not rerun it blindly. Fetch the result later with GET ${API_BASE_URL}/v1/transactions/${txId}, or pass '--idempotency-key' and a larger '--wait' next time.`,
      retryable: false,
      source: "cli",
      details: { transaction_id: txId },
    },
    EXIT.API_ERROR,
  );
}

// ─── Help ────────────────────────────────────────────────────────────────────

export const HELP = {
  name: "strale",
  version: VERSION,
  usage: "strale <command> [options]",
  commands: {
    search: { usage: "strale search <query> [--limit 1-10]", auth: "none" },
    tools: { usage: "strale tools [--category <name>] [--full]", auth: "none" },
    run: {
      usage: "strale run <slug> --max-price-cents <0-2000> [--input '<json object>'] [--timeout 5-60] [--wait 0-600] [--idempotency-key <key>] [--dry-run]",
      auth: "STRALE_API_KEY, except free-tier tools",
    },
    balance: { usage: "strale balance", auth: "STRALE_API_KEY" },
    help: { usage: "strale help" },
    version: { usage: "strale version" },
  },
  environment: { STRALE_API_KEY: "API key (sk_live_...). The only place the CLI reads a key from." },
  output: "One JSON document on stdout on success. One JSON error on stderr on failure.",
  exit_codes: {
    "0": "success",
    "1": "the API returned an error not listed below, the capability failed, or an async call outlived --wait (it may be charged; fetch it by transaction id)",
    "2": "usage error; nothing was sent",
    "3": "missing or rejected API key",
    "4": "payment: balance, price cap or spend cap",
    "5": "rate limited; retry later",
    "6": "network error or timeout",
  },
};

// ─── Entry ───────────────────────────────────────────────────────────────────

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    let result: unknown;
    const commandHelp = HELP.commands[command as keyof typeof HELP.commands];
    const beforeSeparator = rest.includes("--") ? rest.slice(0, rest.indexOf("--")) : rest;
    if (commandHelp && (beforeSeparator.includes("--help") || beforeSeparator.includes("-h"))) {
      deps.io.stdout(`${JSON.stringify(commandHelp)}\n`);
      return EXIT.OK;
    }
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        result = HELP;
        break;
      case "version":
      case "--version":
        result = { name: "strale-cli", version: VERSION };
        break;
      case "search":
        result = await cmdSearch(deps, rest);
        break;
      case "tools":
        result = await cmdTools(deps, rest);
        break;
      case "run":
        result = await cmdRun(deps, rest);
        break;
      case "balance":
        result = await cmdBalance(deps, rest);
        break;
      default:
        throw usage(`Unknown command '${command}'.`, "Commands: search, tools, run, balance, help, version.");
    }
    deps.io.stdout(`${JSON.stringify(result)}\n`);
    return EXIT.OK;
  } catch (err) {
    const cliErr =
      err instanceof CliError
        ? err
        : new CliError(
            {
              error_code: "execution_failed",
              message: `Unexpected CLI error: ${err instanceof Error ? err.message : String(err)}`,
              fix: "Report it at https://github.com/strale-io/strale/issues with the command you ran (without your API key).",
              source: "cli",
            },
            EXIT.API_ERROR,
          );
    deps.io.stderr(`${JSON.stringify({ error: cliErr.body })}\n`);
    return cliErr.exitCode;
  }
}
