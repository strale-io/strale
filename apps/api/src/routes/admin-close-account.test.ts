/**
 * POST /v1/admin/accounts/close — the operator closure path.
 *
 * The closure itself is exercised against a real database in
 * `account-lifecycle.integration.test.ts`. This file pins what must hold with
 * no database at all: the admin wall, the guards that make a one-way action
 * hard to fire by mistake, and that both routes reach the one shared closure
 * rather than carrying their own copy.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; email: string; deletedAt: Date | null }>,
  dbReached: false,
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    select: () => {
      state.dbReached = true;
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(state.rows),
      };
      return chain;
    },
  }),
}));

const closeAccount = vi.hoisted(() =>
  vi.fn(async (_db: unknown, p: { userId: string; reason: string }) => ({
    body: { status: "redacted", user_id: p.userId, deletion_reason: p.reason } as Record<string, unknown>,
    forfeitedCents: 0,
  })),
);
vi.mock("../lib/close-account.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/close-account.js")>();
  return { AccountAlreadyClosedError: original.AccountAlreadyClosedError, closeAccount };
});

const ID = "3f2b7c1e-8d4a-4b6f-9a10-2c5e7d9f1a23";
const EMAIL = "holder@customer.test";
const SECRET = "unit-test-admin-secret-plenty-of-entropy-0123456789";

async function loadRoute() {
  const { adminRoute } = await import("./admin.js");
  return adminRoute;
}

function close(body: unknown, auth: string | null = `Bearer ${SECRET}`) {
  return loadRoute().then((route) =>
    route.request("/accounts/close", {
      method: "POST",
      headers: { ...(auth ? { Authorization: auth } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const OK = { email: EMAIL, confirm_email: EMAIL, reason: "request 2026-11-16" };

beforeAll(async () => {
  process.env.ADMIN_SECRET = SECRET;
  await loadRoute();
}, 60_000);

beforeEach(() => {
  closeAccount.mockClear();
  state.rows = [];
  state.dbReached = false;
});

describe("POST /v1/admin/accounts/close", () => {
  it.each([null, "Bearer wrong-secret"])("refuses %s without touching the database", async (auth) => {
    const res = await close(OK, auth);
    expect(res.status).toBe(401);
    expect(state.dbReached).toBe(false);
    expect(closeAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["a confirm address that does not match", { ...OK, confirm_email: "holder@customer.tset" }],
    ["no confirm address", { email: EMAIL, reason: "x" }],
    ["no address at all", { reason: "x" }],
    ["no reason", { email: EMAIL, confirm_email: EMAIL }],
    ["a blank reason", { ...OK, reason: "   " }],
    ["a reason carrying an email address", { ...OK, reason: "asked by holder@customer.test" }],
    ["a reason carrying a phone number", { ...OK, reason: "called from +46 70 123 45 67" }],
    ["a reason carrying a bare phone number", { ...OK, reason: "called from 0701234567" }],
    ["a reason carrying a personal identity number", { ...OK, reason: "verified 19800101-1234" }],
    ["a phone number shaped like a date", { ...OK, reason: "called 0701-23-45-67" }],
  ])("answers 400 for %s and closes nothing", async (_label, body) => {
    const res = await close(body);
    expect(res.status).toBe(400);
    expect(state.dbReached).toBe(false);
    expect(closeAccount).not.toHaveBeenCalled();
  });

  it.each([
    "ticket 4711, emailed 2026-11-16",
    "TKT-20261116-0042",
    "INV-2026000123",
    "requests 2026-11-01 to 2026-11-16",
    "requests 2026/11/01-2026/11/16",
  ])("accepts the reference %s", async (reason) => {
    state.rows = [{ id: ID, email: EMAIL, deletedAt: null }];
    const res = await close({ ...OK, reason });
    expect(res.status).toBe(200);
  });

  it("matches the address case-insensitively, as registration stores it", async () => {
    state.rows = [{ id: ID, email: EMAIL, deletedAt: null }];
    const res = await close({ ...OK, email: " Holder@Customer.TEST ", confirm_email: "holder@customer.test" });
    expect(res.status).toBe(200);
  });

  it("answers 404 for an unknown account", async () => {
    const res = await close(OK);
    expect(res.status).toBe(404);
    expect(closeAccount).not.toHaveBeenCalled();
  });

  it("answers 409 for an account that is already closed", async () => {
    state.rows = [{ id: ID, email: EMAIL, deletedAt: new Date("2026-11-01T00:00:00Z") }];
    const res = await close(OK);
    expect(res.status).toBe(409);
    expect(closeAccount).not.toHaveBeenCalled();
  });

  it("answers 409 when a concurrent closure wins inside the transaction", async () => {
    state.rows = [{ id: ID, email: EMAIL, deletedAt: null }];
    const { AccountAlreadyClosedError } = await import("../lib/close-account.js");
    closeAccount.mockRejectedValueOnce(new AccountAlreadyClosedError(ID));
    const res = await close(OK);
    expect(res.status).toBe(409);
  });

  it("refuses an internal account", async () => {
    state.rows = [{ id: ID, email: "system@strale.internal", deletedAt: null }];
    const res = await close({ ...OK, email: "system@strale.internal", confirm_email: "system@strale.internal" });
    expect(res.status).toBe(400);
    expect(closeAccount).not.toHaveBeenCalled();
  });

  it("runs the shared closure on the account's id, with the reason marked as the operator's", async () => {
    state.rows = [{ id: ID, email: EMAIL, deletedAt: null }];
    const res = await close(OK);
    expect(res.status).toBe(200);
    expect(closeAccount).toHaveBeenCalledTimes(1);
    expect(closeAccount.mock.calls[0]![1]).toEqual({ userId: ID, reason: "operator: request 2026-11-16" });
    expect(await res.json()).toMatchObject({ status: "redacted", user_id: ID });
  });
});

describe("one closure for both routes", () => {
  // If either route grows its own copy of the closure again, the two will
  // drift — the history in lib/account-closure.ts is four review rounds of
  // exactly that. Both must reach the shared function and neither may run
  // the steps itself.
  const read = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), "utf8");

  it.each(["./auth.ts", "./admin.ts"])("%s calls closeAccount and runs no closure step itself", (file) => {
    const src = read(file);
    expect(src).toMatch(/closeAccount\(/);
    expect(src).not.toMatch(/applyClosurePlan|forfeitOnClosure/);
  });
});
