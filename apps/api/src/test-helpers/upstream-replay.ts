/**
 * Recorded upstream responses for network executors (H7c batch 2).
 *
 * A recording holds what an executor's upstream answered once, live, on the
 * manifest's known_answer input. The contract test replays it into the real
 * executor with `fetch` stubbed and the clock frozen at the capture moment,
 * so a regression in the executor's request building or parsing fails CI
 * without the network. The recorder (`scripts/record-upstream.ts`) and the
 * test (`capabilities/upstream-replay-contract.test.ts`) share this module so
 * they cannot disagree about the format or how a request matches.
 *
 * What is stored, and what never is:
 *   - request: method, full URL, and the body for non-GET requests. Request
 *     headers are never stored, so no key or token can be recorded.
 *   - response: status, headers minus transport framing, and the body as
 *     received (after fetch's own decompression). Set-Cookie values are
 *     replaced; e-mail addresses in text bodies are replaced.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readBodyWithLimit, ResourceLimitError } from "../lib/resource-limits.js";

export const RECORDINGS_DIR = resolve(import.meta.dirname, "../capabilities/__fixtures__/upstream");

/** Largest response body a recording may hold; bigger upstreams need a narrower capture. */
export const MAX_RECORDED_BODY_BYTES = 256 * 1024;

export interface RecordedRequest {
  method: string;
  url: string;
  body?: string;
}

export interface RecordedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  body_encoding: "utf8" | "base64";
}

export interface RecordedExchange {
  request: RecordedRequest;
  response: RecordedResponse;
}

export interface UpstreamRecording {
  slug: string;
  /** ISO time of the live capture; replay freezes Date here. */
  recorded_at: string;
  /** The known_answer input the capture ran on. A changed manifest input makes the recording stale. */
  input: Record<string, unknown>;
  /** What the recorder changed in the bodies, in words. */
  redactions: string[];
  exchanges: RecordedExchange[];
}

export function loadRecordings(): UpstreamRecording[] {
  return readdirSync(RECORDINGS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(resolve(RECORDINGS_DIR, f), "utf8")) as UpstreamRecording);
}

export function recordingPath(slug: string): string {
  return resolve(RECORDINGS_DIR, `${slug}.json`);
}

/** Bodies of these statuses must be null when building a Response (1xx never reaches a recording). */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);
/** Headers that describe the wire framing, not the content; replay must not repeat them. */
const DROPPED_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);
const TEXT_TYPE = /^(text\/|application\/(?:[\w.+-]*\+)?(?:json|xml|javascript|x-www-form-urlencoded|csv|rss|atom)\b)/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Normalise any fetch call to the parts a recording keys on. */
export async function describeRequest(input: RequestInfo | URL, init?: RequestInit): Promise<RecordedRequest> {
  const req = input instanceof Request ? input : undefined;
  const url = req ? req.url : String(input);
  const method = String(init?.method ?? req?.method ?? "GET").toUpperCase();
  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (init?.body !== undefined && init.body !== null) {
      body = typeof init.body === "string" ? init.body : await new Request(url, { method, body: init.body }).text();
    } else if (req) {
      body = await req.clone().text();
    }
  }
  return body ? { method, url, body } : { method, url };
}

export function requestKey(r: RecordedRequest): string {
  return `${r.method} ${r.url}${r.body ? ` <body ${createHash("sha256").update(r.body).digest("hex").slice(0, 12)}>` : ""}`;
}

function sameRequest(a: RecordedRequest, b: RecordedRequest): boolean {
  return a.method === b.method && a.url === b.url && (a.body ?? "") === (b.body ?? "");
}

/** Consume a live response into recordable form; `oversize` (and an empty body) when it exceeds the cap. */
export async function captureResponse(response: Response): Promise<RecordedResponse & { oversize: boolean }> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (DROPPED_RESPONSE_HEADERS.has(name)) return;
    headers[name] = name === "set-cookie" ? value.replace(/^([^=;]+)=[^;]*/, "$1=redacted") : value;
  });
  let bytes: Buffer = Buffer.alloc(0);
  let oversize = false;
  try {
    bytes = await readBodyWithLimit(response, MAX_RECORDED_BODY_BYTES, "upstream_response");
  } catch (err) {
    if (!(err instanceof ResourceLimitError)) throw err;
    oversize = true;
  }
  const textual = TEXT_TYPE.test(headers["content-type"] ?? "") || isUtf8Text(bytes);
  return {
    status: response.status,
    headers,
    body: oversize ? "" : textual ? bytes.toString("utf8") : bytes.toString("base64"),
    body_encoding: textual ? "utf8" : "base64",
    oversize,
  };
}

function isUtf8Text(bytes: Buffer): boolean {
  if (bytes.length === 0) return true;
  const text = bytes.toString("utf8");
  return !text.includes("�") && !/[\x00-\x08\x0E-\x1F]/.test(text);
}

/** A display name in front of an address ("Ada Lovelace <ada@example.org>") names a person. */
const NAMED_EMAIL = new RegExp(`[^"<>,;:\\\\]{1,80}<(${EMAIL.source})>`, "g");

/**
 * Replace e-mail addresses in every text body, and the display name written
 * in front of one; returns how many addresses were replaced.
 */
export function redactEmails(exchanges: RecordedExchange[]): number {
  let count = 0;
  for (const { response } of exchanges) {
    if (response.body_encoding !== "utf8") continue;
    response.body = response.body.replace(NAMED_EMAIL, "Fixture person <$1>").replace(EMAIL, (m) => {
      if (m.endsWith("@example.invalid")) return m;
      count++;
      return "redacted@example.invalid";
    });
  }
  return count;
}

export type Perturbation = "empty" | "hollow";

/** Every JSON leaf changed while every key and array element stays: strings empty, numbers -1, booleans flipped. */
function hollowJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hollowJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hollowJson(v)]));
  if (typeof value === "string") return "";
  if (typeof value === "number") return -1;
  if (typeof value === "boolean") return !value;
  return value;
}

/**
 * The perturbed body. `empty` keeps only the outer shape (`{}`, `[]` or
 * nothing). `hollow` keeps the structure and replaces the values: JSON leaves
 * as hollowJson, XML attribute values and text emptied. An executor that
 * merely throws on `empty` still has to show, under `hollow`, that its
 * contract reads the values.
 */
function perturbed(recorded: RecordedResponse, mode: Perturbation): string {
  if (recorded.body_encoding !== "utf8") return "";
  const text = recorded.body.trimStart();
  if (text.startsWith("{") || text.startsWith("[")) {
    if (mode === "empty") return text.startsWith("{") ? "{}" : "[]";
    try {
      return JSON.stringify(hollowJson(JSON.parse(text)));
    } catch {
      return "";
    }
  }
  if (mode === "hollow" && text.startsWith("<")) return text.replace(/="[^"]*"/g, '=""').replace(/>[^<]+</g, "><");
  return "";
}

/** A Response carrying a recorded answer, as fetch would have returned it for `url`. */
export function recordedResponse(url: string, recorded: RecordedResponse, perturb?: Perturbation): Response {
  const body = NULL_BODY_STATUSES.has(recorded.status)
    ? null
    : perturb
      ? perturbed(recorded, perturb)
      : recorded.body_encoding === "base64"
        ? Buffer.from(recorded.body, "base64")
        : recorded.body;
  const contentType = recorded.headers["content-type"];
  const headers = perturb ? (contentType ? { "content-type": contentType } : {}) : recorded.headers;
  const response = new Response(body, { status: recorded.status, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

export interface ReplayFetch {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Requests answered from the recording. */
  served: RecordedRequest[];
  /** Requests the recording has no answer for; each one also rejected the fetch. */
  misses: RecordedRequest[];
}

/**
 * A fetch that answers only from the recording, matching method, URL and
 * body exactly. Identical requests are answered in recorded order, and the
 * last answer repeats. `perturb` answers every request with the recorded
 * status and content type but a perturbed body (see `perturbed`): an
 * executor whose contract still passes then does not depend on the upstream
 * content, and its test proves nothing about parsing. The response `url` is
 * always the request URL; replay does not model a fetch-followed redirect.
 */
export function createReplayFetch(exchanges: RecordedExchange[], opts: { perturb?: Perturbation } = {}): ReplayFetch {
  const used = new Map<RecordedExchange, number>();
  const state: ReplayFetch = {
    served: [],
    misses: [],
    fetch: async (input, init) => {
      const request = await describeRequest(input, init);
      const candidates = exchanges.filter((e) => sameRequest(e.request, request));
      const next = candidates.find((e) => !used.has(e)) ?? candidates.at(-1);
      if (!next) {
        state.misses.push(request);
        throw new Error(`no recorded upstream response for ${requestKey(request)}`);
      }
      used.set(next, (used.get(next) ?? 0) + 1);
      state.served.push(request);
      return recordedResponse(request.url, next.response, opts.perturb);
    },
  };
  return state;
}
