/**
 * H1 exit evidence: the x402 settlement-volume watch, end to end up to delivery.
 *
 * The real chain runs: checkX402SettlementVolume → classifyVolume → alertOnce
 * (cooldown read and ledger write) → sendAlert → Resend email and
 * deliverToBus. Only the edges are fakes: the database answers with recorded
 * per-payer counts, Resend records the email, and `fetch` is a fake GitHub
 * that records the bus comment. Nothing here reaches the network.
 *
 * Production's bus channel is dormant until BUS_GITHUB_TOKEN and BUS_REPO are
 * set (ask 6491949026), so both states are shown: unset sends the email and
 * touches no network; set posts the same text to the strale-planning channel
 * in the format `.claude/scripts/bus.mjs` reads.
 *
 * `scripts/production-watch/demonstrate-alerts.mjs` runs this file and folds
 * the result into the H1 receipt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn(async (_msg: { to: string[]; subject: string; text: string }) => ({ data: { id: "e1" }, error: null }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const BUS_FORMAT = /^From ([a-z0-9][a-z0-9-]{0,62}):\n\n([\s\S]*)$/;

type Row = { payer: string | null; last_24h: number; d1: number; d2: number; d3: number; d4: number; d5: number; d6: number; d7: number };

/** A payer settling `perDay` on each of the seven baseline days. */
const row = (payer: string, last24h: number, perDay: number): Row =>
  ({ payer, last_24h: last24h, d1: perDay, d2: perDay, d3: perDay, d4: perDay, d5: perDay, d6: perDay, d7: perDay });

/** A database that answers the watch query with `rows` and records every statement. */
function fakeDb(rows: Row[]) {
  const statements: string[] = [];
  const db = {
    execute: vi.fn(async (query: { queryChunks?: unknown[] }) => {
      const text = (query.queryChunks ?? [])
        .map((c) => (c && typeof c === "object" && "value" in c ? (c as { value: string[] }).value.join("") : ""))
        .join(" ");
      statements.push(text);
      if (text.includes("x402_payer_hash")) return rows;
      return []; // cooldown lookup finds nothing; the ledger insert returns nothing
    }),
  };
  return { db: db as unknown as import("../db/index.js").Database, statements };
}

function fakeGithub() {
  const comments: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/issues?")) {
      return new Response(JSON.stringify([{ number: 42, title: "channel: strale-planning" }]), { status: 200 });
    }
    if (u.endsWith("/issues/42/comments") && init?.method === "POST") {
      comments.push(JSON.parse(String(init.body)).body);
      return new Response("{}", { status: 201 });
    }
    return new Response("unexpected", { status: 500 });
  });
  return { fetchImpl, comments };
}

// Broad: every payer fell off. Concentrated: the one big buyer paused, the rest settle.
const BROAD: Row[] = [
  row("a".repeat(64), 5, 100),
  row("b".repeat(64), 1, 20),
  row("c".repeat(64), 0, 10),
];
const CONCENTRATED: Row[] = [
  row("a".repeat(64), 0, 100),
  row("b".repeat(64), 20, 20),
  row("c".repeat(64), 10, 10),
];

async function fresh() {
  vi.resetModules();
  const watch = await import("./x402-settlement-watch.js");
  const bus = await import("../lib/alert-bus.js");
  bus.resetBusCache();
  return { watch, bus };
}

beforeEach(() => {
  sendMock.mockClear();
  process.env.ALERT_ALLOW_IN_TEST = "true"; // opt this file into real delivery code
  process.env.RESEND_API_KEY = "re_fake";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["ALERT_ALLOW_IN_TEST", "RESEND_API_KEY", "BUS_GITHUB_TOKEN", "BUS_REPO"]) delete process.env[k];
});

describe("x402 volume watch, end to end to delivery", () => {
  it("dormant bus: a broad drop emails a CRITICAL and makes no network call", async () => {
    const { fetchImpl } = fakeGithub();
    vi.stubGlobal("fetch", fetchImpl);
    const { watch, bus } = await fresh();
    const { db, statements } = fakeDb(BROAD);
    const verdict = await watch.checkX402SettlementVolume({ db });
    await bus.settleBusDeliveries();

    expect(verdict.kind).toBe("broad");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].subject).toMatch(/^\[Strale CRITICAL\] x402 settlement volume dropped: 6 in 24h vs ~130\/day/);
    expect(fetchImpl).not.toHaveBeenCalled();
    // alertOnce read the cooldown ledger and recorded the page.
    expect(statements.some((s) => s.includes("FROM health_monitor_events"))).toBe(true);
    expect(statements.some((s) => s.includes("INSERT INTO health_monitor_events"))).toBe(true);
  });

  it("bus set: the same CRITICAL also lands on channel strale-planning in bus format", async () => {
    const { fetchImpl, comments } = fakeGithub();
    vi.stubGlobal("fetch", fetchImpl);
    process.env.BUS_GITHUB_TOKEN = "github_pat_fake";
    process.env.BUS_REPO = "example-owner/example-bus";
    const { watch, bus } = await fresh();
    await watch.checkX402SettlementVolume({ db: fakeDb(BROAD).db });
    await bus.settleBusDeliveries();

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(comments).toHaveLength(1);
    const [, sender, text] = BUS_FORMAT.exec(comments[0]) ?? [];
    expect(sender).toBe("strale-alerts");
    expect(text).toMatch(/^\[Strale CRITICAL\] x402 settlement volume dropped: 6 in 24h/);
    expect(text).toContain("X402_CHALLENGE_VERSION=1");
  });

  it("bus set: one buyer pausing is a WARNING on both channels, not a critical", async () => {
    const { fetchImpl, comments } = fakeGithub();
    vi.stubGlobal("fetch", fetchImpl);
    process.env.BUS_GITHUB_TOKEN = "github_pat_fake";
    process.env.BUS_REPO = "example-owner/example-bus";
    const { watch, bus } = await fresh();
    const verdict = await watch.checkX402SettlementVolume({ db: fakeDb(CONCENTRATED).db });
    await bus.settleBusDeliveries();

    expect(verdict.kind).toBe("concentrated");
    expect(sendMock.mock.calls[0][0].subject).toMatch(/^\[Strale WARNING\] x402 volume down to 30 in 24h .*top buyer \(77% of baseline\)/);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatch(/^From strale-alerts:\n\n\[Strale WARNING\]/);
  });

  it("healthy volume sends nothing on either channel", async () => {
    const { fetchImpl } = fakeGithub();
    vi.stubGlobal("fetch", fetchImpl);
    process.env.BUS_GITHUB_TOKEN = "github_pat_fake";
    process.env.BUS_REPO = "example-owner/example-bus";
    const { watch, bus } = await fresh();
    const healthy = BROAD.map((r) => ({ ...r, last_24h: r.d1 }));
    expect((await watch.checkX402SettlementVolume({ db: fakeDb(healthy).db })).kind).toBe("healthy");
    await bus.settleBusDeliveries();
    expect(sendMock).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
