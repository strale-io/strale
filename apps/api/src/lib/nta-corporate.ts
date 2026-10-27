import { readTextWithLimit } from "./resource-limits.js";
import { logWarn } from "./log.js";
import { JSDOM } from "jsdom";
import { apiError, type ErrorCode } from "./errors.js";
import { assertTargetAllowed } from "./tos-blocklist.js";
import { CapabilityRefusalError } from "./capability-refusal.js";
import { SourceBlockedError } from "./site-access.js";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_RECORDS = 50;
const COOLDOWN_MS = 60_000;
const MAX_IN_FLIGHT = 4;
let blockedUntil = 0;
let inFlight = 0;

function tooManyMatches(): Error {
  const message = "Ambiguous Japanese company name: too many companies match; provide the 13-digit corporate number.";
  return Object.assign(new CapabilityRefusalError(message), apiError("invalid_request", message));
}

export const NTA_SOURCE = "https://www.houjin-bangou.nta.go.jp/";
const ARTICLE_6_CREDIT = "このサービスは、国税庁法人番号システムWeb-API 機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない";
// Article 6 of the Web-API terms, verbatim; then the content licence credit.
export const NTA_ATTRIBUTION = `${ARTICLE_6_CREDIT}\n国税庁法人番号公表サイト（国税庁）（${NTA_SOURCE}）をもとにStraleが加工して作成。`;

export function ntaError(code: ErrorCode, message: string): Error & ReturnType<typeof apiError> {
  return Object.assign(new Error(message), apiError(code, message));
}

/** NTA check digit: 9 - (weighted sum of the 12 base digits modulo 9).
 * Positions count from the right, alternating weights 1 (odd) and 2 (even).
 */
export function validCorporateNumber(value: string): boolean {
  if (!/^[1-9]\d{12}$/.test(value)) return false;
  const sum = [...value.slice(1)].reverse().reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 2), 0);
  return Number(value[0]) === 9 - sum % 9;
}

export interface NtaResponse {
  records: Record<string, string>[];
  count: number;
  lastUpdateDate: string;
}

/** v4 revision 1.2 §§2.3.1, 4.3, 5.2, type=12. No external entities. */
function parseResponse(xml: string): NtaResponse {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw ntaError("execution_failed", "NTA returned an unsupported XML document. Retry later.");
  // Bound work before allocating a DOM, including a split/incomplete result.
  const countText = /<count>\s*(\d+)\s*<\/count>/.exec(xml)?.[1];
  if (countText && Number(countText) > MAX_RECORDS) throw tooManyMatches();
  // Also bound dishonest/missing count envelopes before XML allocation.
  if ((xml.match(/<corporation(?:\s|>)/g) ?? []).length > MAX_RECORDS) throw tooManyMatches();
  let dom: JSDOM;
  try {
    dom = new JSDOM(xml, { contentType: "application/xml" });
  } catch {
    throw ntaError("execution_failed", "NTA returned invalid XML. Retry later.");
  }
  try {
    const root = dom.window.document.documentElement;
    const text = (name: string) => [...root.children].find(e => e.tagName === name)?.textContent?.trim() ?? "";
    if (root.tagName !== "corporations" || !/^\d+$/.test(text("count"))) {
      throw ntaError("execution_failed", "NTA returned an unexpected response. Retry later.");
    }
    const records = [...root.children].filter(e => e.tagName === "corporation").map(e =>
      Object.fromEntries([...e.children].map(field => [field.tagName, field.textContent?.trim() ?? ""])),
    );
    const count = Number(text("count"));
    if ((count === 0) !== (records.length === 0) || count < records.length || records.some(r => !/^\d{13}$/.test(r.corporateNumber ?? ""))) {
      throw ntaError("execution_failed", "NTA returned an incomplete response. Retry later.");
    }
    return { records, count, lastUpdateDate: text("lastUpdateDate") };
  } finally {
    dom.window.close();
  }
}

/** One free official request. Exported for the credential-only operator smoke;
 * no catalogue execution, dispatcher, production DB, or Strale key required.
 * Caller validates the search input before entering this transport.
 */
export async function fetchNtaCorporations(query: string, byNumber: boolean): Promise<NtaResponse> {
  const id = process.env.NTA_HOUJIN_APP_ID?.trim();
  if (!id) throw ntaError("capability_unavailable", "Japanese company data is temporarily unavailable. Contact Strale support.");
  const url = new URL(`https://api.houjin-bangou.nta.go.jp/4/${byNumber ? "num" : "name"}`);
  url.searchParams.set("id", id);
  url.searchParams.set("type", "12");
  if (byNumber) {
    url.searchParams.set("history", "0");
    url.searchParams.set("number", query);
  } else {
    // Overview §4.1.3: Japanese target=2 uses full-width characters;
    // English registered names use target=3 and half-width characters.
    const english = /^[\x20-\x7e]+$/.test(query);
    const name = english ? query : query.normalize("NFKC").replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, "　");
    url.searchParams.set("name", name);
    url.searchParams.set("target", english ? "3" : "2");
    url.searchParams.set("mode", "2");
    url.searchParams.set("change", "0");
    url.searchParams.set("close", "1");
  }
  assertTargetAllowed(url.href);
  if (Date.now() < blockedUntil) {
    throw ntaError("capability_unavailable", "NTA source unavailable during access cool-down. Retry after 60 seconds.");
  }
  if (inFlight >= MAX_IN_FLIGHT) {
    throw ntaError("capability_unavailable", "NTA source unavailable: lookup capacity reached. Retry shortly.");
  }
  inFlight++;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Strale/1.0 (+https://strale.dev)", Accept: "application/xml" },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    // Never log request URLs, exception causes, or upstream error bodies: they
    // can contain the application ID. Bound body reads with the same signal.
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) blockedUntil = Date.now() + COOLDOWN_MS;
      if (response.status === 400) {
        // Overview §5: errors are CSV (code,message), even for type=12.
        // v4 appendix 2: 103 is legal-form-only input; 180 is too many results.
        const errorBody = await readTextWithLimit(response, 16 * 1024, "NTA error response");
        const errorCode = /^\s*(\d{3}),/.exec(errorBody)?.[1];
        if (errorCode === "180") throw tooManyMatches();
        if (errorCode) {
          const message = errorCode === "103"
            ? "'company_name' must be a registered name including more than the legal form; or provide the 13-digit corporate number."
            : "'corporate_number' or 'company_name' must be a valid 13-digit corporate number or registered name. Check the input and try again.";
          throw Object.assign(new CapabilityRefusalError(message), apiError("invalid_request", message));
        }
      }
      if (!response.bodyUsed) await response.body?.cancel().catch(() => {
        logWarn("nta-response-cancel-failed", "NTA response cancellation failed.");
      });
      const code: ErrorCode = response.status === 403 || response.status === 429 ? "rate_limited"
        : response.status === 404 || response.status === 401 ? "capability_unavailable" : "execution_failed";
      if (code === "rate_limited") {
        // Strale chose this shared-ID source. This is a counted fault, with
        // no caller-refusal marker or wording that triggers transport retries.
        const message = `Source unavailable to Strale: NTA access restricted (status ${response.status}). Retry after 60 seconds.`;
        throw Object.assign(new SourceBlockedError(message, { kind: "http", status: response.status }), apiError(code, message));
      }
      throw ntaError(code, `NTA request failed (status ${response.status}). Contact Strale support if this persists.`);
    }
    const body = await readTextWithLimit(response, MAX_RESPONSE_BYTES, "NTA response");
    return parseResponse(body);
  } catch (err) {
    if (err instanceof Error && "error_code" in err) throw err;
    const timeout = err instanceof Error && ["TimeoutError", "AbortError"].includes(err.name);
    throw ntaError(timeout ? "timeout_exceeded" : "execution_failed", timeout ? "NTA request timed out. Retry later." : "NTA request failed. Retry later.");
  } finally {
    inFlight--;
  }
}

// Resource definition (download/API), fields 9, 15, 25, 26 and 29.
const PROCESSES: Record<string, string> = {
  "01": "新規", "11": "商号又は名称の変更", "12": "国内所在地の変更", "13": "国外所在地の変更",
  "21": "登記記録の閉鎖等", "22": "登記記録の復活等", "71": "吸収合併", "72": "吸収合併無効", "81": "商号の登記の抹消", "99": "削除",
};
const CLOSE_REASONS: Record<string, string> = { "01": "清算の結了等", "11": "合併による解散等", "21": "登記官による閉鎖", "31": "その他の清算の結了等" };
const KINDS: Record<string, string> = { "101": "国の機関", "201": "地方公共団体", "301": "株式会社", "302": "有限会社", "303": "合名会社", "304": "合資会社", "305": "合同会社", "399": "その他の設立登記法人", "401": "外国会社等", "499": "その他" };

export function mapNtaCorporation(r: Record<string, string>): Record<string, unknown> {
  // Resource definition, field 9, printed p.2 (v4 spec appendix 1): process
  // 22 means the closure was invalidated and the register restored. It wins
  // over stale closure fields, which are still returned as source data.
  const closed = r.process !== "22" && (r.process === "21" || !!r.closeDate || !!r.closeCause);
  const status = closed ? (["01", "11", "31"].includes(r.closeCause) ? "dissolved" : "closed")
    : ["81", "99"].includes(r.process) ? "inactive"
    : ["01", "11", "12", "13", "22", "71", "72"].includes(r.process) ? "active" : "unknown";
  return {
    company_name: r.name || null,
    registration_number: r.corporateNumber,
    business_type: KINDS[r.kind] ?? null,
    address: r.addressOutside || [r.prefectureName, r.cityName, r.streetNumber].filter(Boolean).join("") || null,
    registration_date: null, // assignmentDate is NOT the date of incorporation.
    status,
    industry: null,
    directors: null,
    assignment_date: r.assignmentDate || null,
    last_updated: r.updateDate || null,
    english_name: r.enName || null,
    furigana: r.furigana || null,
    postal_code: r.postCode || null,
    process_code: r.process || null,
    process_description: PROCESSES[r.process] ?? null,
    close_date: r.closeDate || null,
    close_reason_code: r.closeCause || null,
    close_reason: CLOSE_REASONS[r.closeCause] ?? null,
    successor_corporate_number: r.successorCorporateNumber || null,
    search_excluded: r.hihyoji === "1" ? true : r.hihyoji === "0" ? false : null,
    attribution: NTA_ATTRIBUTION,
  };
}
