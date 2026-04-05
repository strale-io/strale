import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { transactions, capabilities } from "../db/schema.js";
import { verifyAuditToken } from "../lib/audit-token.js";
import { apiError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

export const auditRoute = new Hono<AppEnv>();

// GET /v1/audit/:transactionId — Public (token-authenticated) audit record
auditRoute.get("/:transactionId", async (c) => {
  const transactionId = c.req.param("transactionId");
  const token = c.req.query("token");

  if (!token) {
    return c.json(
      apiError("unauthorized", "Audit token required. Include ?token=<hmac> in the URL."),
      401,
    );
  }

  if (!verifyAuditToken(transactionId, token)) {
    return c.json(
      apiError("unauthorized", "Invalid audit token."),
      401,
    );
  }

  const db = getDb();
  const [txn] = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      priceCents: transactions.priceCents,
      latencyMs: transactions.latencyMs,
      provenance: transactions.provenance,
      auditTrail: transactions.auditTrail,
      transparencyMarker: transactions.transparencyMarker,
      dataJurisdiction: transactions.dataJurisdiction,
      createdAt: transactions.createdAt,
      completedAt: transactions.completedAt,
      capabilityId: transactions.capabilityId,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!txn) {
    return c.json(
      apiError("not_found", "Transaction not found or audit token invalid."),
      404,
    );
  }

  // Get capability details
  const [cap] = await db
    .select({
      slug: capabilities.slug,
      name: capabilities.name,
      dataSource: capabilities.dataSource,
      dataClassification: capabilities.dataClassification,
      transparencyTag: capabilities.transparencyTag,
    })
    .from(capabilities)
    .where(eq(capabilities.id, txn.capabilityId!))
    .limit(1);

  // Return the stored audit trail (which should be the full audit object)
  // If the transaction was created before the audit trail upgrade, construct a basic one
  const audit = txn.auditTrail ?? {
    transaction_id: txn.id,
    timestamp: txn.createdAt?.toISOString(),
    completed_at: txn.completedAt?.toISOString(),
    capability: cap?.slug ?? "unknown",
    data_source: cap?.dataSource ?? "unknown",
    data_classification: cap?.dataClassification ?? "unknown",
    transparency_marker: txn.transparencyMarker,
    data_jurisdiction: txn.dataJurisdiction,
    latency_ms: txn.latencyMs,
    status: txn.status,
  };

  return c.json({
    audit,
    transaction_status: txn.status,
    generated_at: new Date().toISOString(),
    note: "This compliance record was generated automatically by Strale. For questions: compliance@strale.io",
  });
});
