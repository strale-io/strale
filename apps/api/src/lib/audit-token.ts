import { createHmac } from "node:crypto";

const AUDIT_SECRET = process.env.AUDIT_HMAC_SECRET || "strale-audit-default-secret";

export function generateAuditToken(transactionId: string): string {
  return createHmac("sha256", AUDIT_SECRET)
    .update(transactionId)
    .digest("hex")
    .substring(0, 32);
}

export function verifyAuditToken(transactionId: string, token: string): boolean {
  const expected = generateAuditToken(transactionId);
  return token === expected;
}

export function getShareableUrl(transactionId: string): string {
  const token = generateAuditToken(transactionId);
  return `https://strale.dev/audit/${transactionId}?token=${token}`;
}
