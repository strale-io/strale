/**
 * POST /v1/admin/wallets/credit — no-database contract tests for the admin
 * wall, safety guards, ledger idempotency and weekly operator-credit cap.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  accounts: [] as Array<{ id: string; email: string; deletedAt: Date | null }>,
  dbReached: false,
  duplicate: false,
  weeklyCents: 0,
  transactionAccountClosed: false,
  executed: [] as unknown[],
}));

const tx = vi.hoisted(() => ({
  select: vi.fn(() => {
    const chain = {
      from: () => chain,
      where: () => chain,
      for: () => Promise.resolve([{ deletedAt: state.transactionAccountClosed ? new Date("2026-11-16T00:00:00Z") : null }]),
    };
    return chain;
  }),
  execute: vi.fn(async (query: unknown) => {
    state.executed.push(query);
    if (state.executed.length === 1) return state.duplicate ? [{ exists: true }] : [];
    if (state.executed.length === 2) return [];
    return [{ total_cents: String(state.weeklyCents) }];
  }),
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    select: () => {
      state.dbReached = true;
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(state.accounts),
      };
      return chain;
    },
    transaction: (fn: (inner: typeof tx) => unknown) => fn(tx),
  }),
}));

const wallet = vi.hoisted(() => ({
  lockWalletForUser: vi.fn(async () => ({ id: "wallet-1", balanceCents: 100 })),
  credit: vi.fn(async () => undefined),
  readBalance: vi.fn(async () => 300),
}));
vi.mock("../lib/wallet-service.js", () => wallet);

const USER_ID = "3f2b7c1e-8d4a-4b6f-9a10-2c5e7d9f1a23";
const EMAIL = "holder@customer.test";
const SECRET = "unit-test-admin-secret-plenty-of-entropy-0123456789";
const OK = { email: EMAIL, confirm_email: EMAIL, amount_cents: 200, reason: "TKT-20261116-0042" };

async function loadRoute() {
  const { adminRoute } = await import("./admin.js");
  return adminRoute;
}

function request(body: unknown, auth: string | null = `Bearer ${SECRET}`) {
  return loadRoute().then((route) =>
    route.request("/wallets/credit", {
      method: "POST",
      headers: { ...(auth ? { Authorization: auth } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  process.env.ADMIN_SECRET = SECRET;
  await loadRoute();
}, 60_000);

beforeEach(() => {
  state.accounts = [{ id: USER_ID, email: EMAIL, deletedAt: null }];
  state.dbReached = false;
  state.duplicate = false;
  state.weeklyCents = 0;
  state.transactionAccountClosed = false;
  state.executed = [];
  tx.execute.mockClear();
  tx.select.mockClear();
  wallet.lockWalletForUser.mockClear();
  wallet.lockWalletForUser.mockResolvedValue({ id: "wallet-1", balanceCents: 100 });
  wallet.credit.mockClear();
  wallet.readBalance.mockClear();
  wallet.readBalance.mockResolvedValue(300);
});

describe("POST /v1/admin/wallets/credit", () => {
  it.each([null, "Bearer wrong-secret"])("refuses %s without touching the database", async (auth) => {
    expect((await request(OK, auth)).status).toBe(401);
    expect(state.dbReached).toBe(false);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it.each([
    ["email mismatch", { ...OK, confirm_email: "other@customer.test" }],
    ["missing email", { ...OK, email: undefined }],
    ["zero amount", { ...OK, amount_cents: 0 }],
    ["negative amount", { ...OK, amount_cents: -5 }],
    ["amount above the maximum", { ...OK, amount_cents: 2001 }],
    ["fractional amount", { ...OK, amount_cents: 1.5 }],
    ["string amount", { ...OK, amount_cents: "100" }],
    ["empty reason", { ...OK, reason: "  " }],
    ["email in reason", { ...OK, reason: "asked by holder@customer.test" }],
    ["phone in reason", { ...OK, reason: "called from +46 70 123 45 67" }],
  ])("answers 400 for %s and credits nothing", async (_label, body) => {
    expect((await request(body)).status).toBe(400);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown account", async () => {
    state.accounts = [];
    expect((await request(OK)).status).toBe(404);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it("answers 409 for a closed account", async () => {
    state.accounts[0]!.deletedAt = new Date("2026-11-01T00:00:00Z");
    expect((await request(OK)).status).toBe(409);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it("refuses an internal account", async () => {
    state.accounts = [{ id: USER_ID, email: "system@strale.internal", deletedAt: null }];
    const body = { ...OK, email: "system@strale.internal", confirm_email: "system@strale.internal" };
    expect((await request(body)).status).toBe(400);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it("answers 404 when the account has no wallet", async () => {
    wallet.lockWalletForUser.mockResolvedValueOnce(null);
    expect((await request(OK)).status).toBe(404);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it("answers 409 when closure wins while the credit waits for the wallet lock", async () => {
    state.transactionAccountClosed = true;
    expect((await request(OK)).status).toBe(409);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it("refuses a duplicate description", async () => {
    state.duplicate = true;
    expect((await request(OK)).status).toBe(409);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it("refuses a credit that would exceed the rolling weekly cap", async () => {
    state.weeklyCents = 1900;
    expect((await request(OK)).status).toBe(409);
    expect(wallet.credit).not.toHaveBeenCalled();
  });

  it("allows a credit that exactly reaches the rolling weekly cap", async () => {
    state.weeklyCents = 1800;
    expect((await request(OK)).status).toBe(200);
    expect(wallet.credit).toHaveBeenCalledTimes(1);
  });

  it("writes one operator credit and returns integer cents", async () => {
    const response = await request(OK);
    expect(response.status).toBe(200);
    expect(wallet.credit).toHaveBeenCalledExactlyOnceWith(tx, {
      walletId: "wallet-1",
      amountCents: 200,
      type: "operator_credit",
      description: "operator: TKT-20261116-0042",
    });
    expect(await response.json()).toEqual({
      status: "credited",
      user_id: USER_ID,
      amount_cents: 200,
      balance_cents: 300,
      ledger_type: "operator_credit",
    });
  });

  it("binds no Date or Buffer through handler SQL", async () => {
    expect((await request(OK)).status).toBe(200);
    const unsafe = (value: unknown): boolean => {
      if (value instanceof Date || Buffer.isBuffer(value)) return true;
      if (Array.isArray(value)) return value.some(unsafe);
      if (value && typeof value === "object") {
        return Object.values(value as Record<string, unknown>).some(unsafe);
      }
      return false;
    };
    expect(state.executed).toHaveLength(3);
    expect(state.executed.some(unsafe)).toBe(false);
  });
});
