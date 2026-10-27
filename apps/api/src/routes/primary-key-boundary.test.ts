import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { AppEnv } from "../types.js";
import { authRoute } from "./auth.js";
import { transactionsRoute } from "./transactions.js";
import { disputeRoute } from "./dispute.js";
import { generateAuditToken } from "../lib/audit-token.js";
import { walletRoute } from "./wallet.js";

const state = vi.hoisted(() => ({ identity: null as any, db: null as any, writes: vi.fn(), checkout: vi.fn() }));
vi.mock("../lib/api-keys.js", () => ({authenticateApiKey: async () => state.identity}));
vi.mock("../db/index.js", () => ({getDb: () => state.db}));

vi.mock("../lib/key-recovery.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/key-recovery.js")>(),
  redeemRecoveryToken: async () => ({ok: true, userId: state.identity.user.id, apiKey: "sk_live_recovered_test", keyPrefix: "sk_live_recover"}),
}));
vi.mock("../lib/stripe.js", () => ({getStripe: () => ({checkout: {sessions: {create: state.checkout}}})}));
vi.mock("../lib/account-closure.js", () => ({
  describeAuditKeysHeld: async () => [],
  applyClosurePlan: async () => {state.writes(); return {contentRedacted: 0, legalHoldSkipped: 0};},
  buildClosureSummary: () => ({}),
}));
vi.mock("../lib/wallet-service.js", () => ({forfeitOnClosure: async () => state.writes()}));

let app: Hono<AppEnv>, id: string;
beforeEach(() => {
  state.writes.mockClear(); state.checkout.mockReset();
  state.checkout.mockResolvedValue({id: "session-test", url: "https://checkout.example.test"});
  id = randomUUID();
  state.identity = {user: {id: randomUUID()}, apiKeyId: randomUUID()};
  const q: any = {
    from: () => q, leftJoin: () => q, orderBy: () => q, where: () => q, limit: () => q, set: () => {state.writes(); return q;},
    values: () => {state.writes(); return q;}, returning: () => q,
    then: (resolve: any, reject: any) => Promise.resolve([{id, legalHold: false, balanceCents: 1000, submittedAt: new Date()}]).then(resolve, reject),
  };
  state.db = {execute: async () => [{count: 1}], select: () => q, update: () => q, insert: () => q, transaction: (fn: any) => fn(state.db)};
  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {const logger: any = {info: () => {}, child: () => logger}; c.set("log", logger); await next();});
  app.route("/v1/auth", authRoute); app.route("/v1/transactions", transactionsRoute); app.route("/v1/wallet", walletRoute); app.route("/v1/transactions", disputeRoute);
});
it.each([
  ["POST", "/v1/auth/api-key", {}],
  ["DELETE", "/v1/auth/me", {}],
  ["DELETE", "/v1/transactions/ID", {}],
  ["POST", "/v1/transactions/ID/audit-token", {}],
  ["POST", "/v1/wallet/topup", {amount_cents: 1000}],
  ["POST", "/v1/transactions/ID/dispute", {reason: "Synthetic review request"}],
])("%s %s denies additional keys before side effects and accepts the primary key", async (method, template, body) => {
  const request = () => app.request(template.replace("ID", id), {method, headers: {Authorization: "Bearer sk_live_synthetic", "Content-Type": "application/json"}, body: JSON.stringify(body)});
  const denied = await request();
  expect(denied.status).toBe(403);
  expect(await denied.json()).toEqual({error_code: "primary_key_required", message: "Use the account's primary key for this action", details: {fix: "Send the account's primary API key in the Authorization: Bearer <api_key> header."}});
  expect(state.writes).not.toHaveBeenCalled(); expect(state.checkout).not.toHaveBeenCalled();
  state.identity.apiKeyId = null;
  const accepted = await request();
  expect(accepted.status).toBe(template.endsWith("/dispute") ? 202 : 200);
  if (template.includes("topup")) expect(state.checkout).toHaveBeenCalledOnce();
});
it("allows additional keys to read wallet balance and transaction history", async () => {
  expect((await app.request("/v1/wallet/balance", {headers: {Authorization: "Bearer sk_live_synthetic"}})).status).toBe(200);
  for (const path of ["/v1/wallet/transactions", "/v1/transactions"]) {
    expect((await app.request(path, {headers: {Authorization: "Bearer sk_live_synthetic"}})).status).toBe(200);
  }
});

it("returns primary_key_required even after additional-key wallet rate saturation", async () => {
  const headers = {Authorization: "Bearer sk_live_synthetic", "Content-Type": "application/json"};
  for (let i = 0; i < 5; i++) expect((await app.request("/v1/wallet/balance", {headers})).status).toBe(200);
  expect((await app.request("/v1/wallet/balance", {headers})).status).toBe(429);
  const denied = await app.request("/v1/wallet/topup", {method: "POST", headers, body: JSON.stringify({amount_cents: 1000})});
  expect(denied.status).toBe(403); expect(await denied.json()).toMatchObject({error_code: "primary_key_required"});
  expect(state.checkout).not.toHaveBeenCalled();
});
it("preserves signed-token data-subject dispute submission without an account key", async () => {
  const {token, expiresAt} = generateAuditToken(id);
  const response = await app.request(`/v1/transactions/${id}/dispute?token=${token}&expires_at=${expiresAt}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({reason: "Synthetic review request", contact_email: "subject@example.test"})});
  expect(response.status).toBe(202); expect(state.writes).toHaveBeenCalledOnce();
});

it("recovery response tells the owner that additional keys survive and how to revoke them", async () => {
  const response = await app.request("/v1/auth/recover/confirm", {method: "POST", headers: {"Content-Type": "application/json", "X-Forwarded-For": "192.0.2.189"}, body: JSON.stringify({email: "owner@example.test", token: "synthetic-token"})});
  expect(response.status).toBe(200);
  const result = await response.json() as any;
  expect(result.message).toContain("Additional keys remain active and can still spend up to their caps.");
  expect(result.message).toContain("GET /v1/api-keys");
  expect(result.message).toContain("DELETE /v1/api-keys/{id}");
});
