/**
 * Reply Parser — HM-4
 *
 * Parses the plain-text body of a reply email and extracts the action keyword.
 * The founder replies to digest or interrupt emails with a keyword; this module
 * extracts the first recognised action from the reply text.
 *
 * Supported keywords (case-insensitive):
 *   APPROVE-N | APPROVE N   → approve Tier 3 proposal #N
 *   REJECT-N  | REJECT N    → reject Tier 3 proposal #N
 *   ACKNOWLEDGE-N | ACK-N   → acknowledge finding #N (add to backlog)
 *   KEEP                    → override suspension warning
 *   RESTORE slug            → restore capability to validating state
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedReply {
  action: "approve" | "reject" | "acknowledge" | "keep" | "restore" | "unknown";
  /** The N in APPROVE-N / REJECT-N / ACKNOWLEDGE-N */
  identifier?: number;
  /** The slug in RESTORE slug */
  slug?: string;
  /** Cleaned reply text (quoted lines + signature stripped) */
  cleanedText: string;
  /** Original raw text before cleaning */
  rawText: string;
}

// ─── Signature / quote markers ───────────────────────────────────────────────

const SIGNATURE_MARKERS = [
  /^-- ?$/m,              // Standard email sig separator
  /^---+$/m,              // Markdown horizontal rule
  /^Sent from my /im,     // Mobile clients
  /^Get Outlook for /im,  // Outlook mobile
  /^On .+ wrote:$/im,     // "On Mon, Jan 1 ... wrote:" (quoted header)
  /^>{3,}/m,              // 3+ consecutive > lines (heavy quoting)
];

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Parse a raw email body and return the first recognised action.
 */
export function parseReplyAction(emailBody: string): ParsedReply {
  const rawText = emailBody ?? "";
  const cleanedText = stripEmailNoise(rawText);

  // Try each keyword in precedence order
  const approve = matchNumberedKeyword(cleanedText, /\bAPPROVE[-\s](\d+)\b/i);
  if (approve !== null) {
    return { action: "approve", identifier: approve, cleanedText, rawText };
  }

  const reject = matchNumberedKeyword(cleanedText, /\bREJECT[-\s](\d+)\b/i);
  if (reject !== null) {
    return { action: "reject", identifier: reject, cleanedText, rawText };
  }

  const ack =
    matchNumberedKeyword(cleanedText, /\bACKNOWLEDGE[-\s](\d+)\b/i) ??
    matchNumberedKeyword(cleanedText, /\bACK[-\s](\d+)\b/i);
  if (ack !== null) {
    return { action: "acknowledge", identifier: ack, cleanedText, rawText };
  }

  const restoreSlug = matchRestoreSlug(cleanedText);
  if (restoreSlug !== null) {
    return { action: "restore", slug: restoreSlug, cleanedText, rawText };
  }

  if (/\bKEEP\b/i.test(cleanedText)) {
    return { action: "keep", cleanedText, rawText };
  }

  return { action: "unknown", cleanedText, rawText };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Remove quoted reply lines and signature blocks from an email body.
 */
function stripEmailNoise(text: string): string {
  // Split into lines
  const lines = text.split(/\r?\n/);

  // Find the first signature marker line and truncate there
  let cutLine = lines.length;
  for (const marker of SIGNATURE_MARKERS) {
    for (let i = 0; i < lines.length; i++) {
      if (marker.test(lines[i])) {
        if (i < cutLine) cutLine = i;
        break;
      }
    }
  }

  // Keep only lines before the signature, removing quoted lines (> prefix)
  const cleaned = lines
    .slice(0, cutLine)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .trim();

  return cleaned;
}

/**
 * Match a keyword that takes a numeric argument (APPROVE-1, REJECT 2, etc.)
 * Returns the number or null if no match.
 */
function matchNumberedKeyword(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return isNaN(n) || n < 1 ? null : n;
}

/**
 * Match `RESTORE <slug>` where slug is a kebab-case string.
 * Returns the slug or null if no match.
 */
function matchRestoreSlug(text: string): string | null {
  const m = text.match(/\bRESTORE\s+([\w-]+)\b/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  return slug.length > 0 ? slug : null;
}
