/**
 * Async jobs with file output, end to end against a real Postgres
 * (portfolio plan 2.11).
 *
 * The capabilities here exist only in this test process: they are registered
 * in-process and seeded into the throwaway lane database, so the "test
 * capability" is invisible to every catalogue by construction. Their declared
 * latency puts /v1/do on the async (DEC-22) path.
 *
 * What is real: the Hono app, auth, the reserve → execute → capture money path
 * (H4), the startup-migration tables, the poll endpoint, the signed download
 * route and the housekeeping tick. What is replaced: the network. safeFetch is
 * swapped for a recorder (the callback receiver), and URL validation's DNS
 * lookup for a stub, because the lane has no outbound network.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import {
  capabilities,
  jobCallbacks,
  jobFiles,
  transactions,
  users,
  walletReservations,
  wallets,
  walletTransactions,
} from "../db/schema.js";

const recorder = vi.hoisted(() => ({
  calls: [] as Array<{ url: string; headers: Record<string, string>; body: string }>,
  /** Status codes to answer with, in order; 204 once exhausted. */
  answers: [] as number[],
}));

vi.mock("../lib/safe-fetch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/safe-fetch.js")>();
  return {
    ...actual,
    safeFetch: async (url: string | URL, init: RequestInit = {}) => {
      recorder.calls.push({
        url: String(url),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        body: String(init.body),
      });
      return new Response(null, { status: recorder.answers.shift() ?? 204 });
    },
  };
});

vi.mock("../lib/url-validator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/url-validator.js")>();
  return {
    ...actual,
    // No DNS in the lane. Keep the scheme rule so a non-http URL still fails.
    validateUrl: async (u: string) => {
      if (!/^https?:/.test(u)) throw new actual.UrlValidationError("Invalid URL scheme.");
    },
  };
});

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const PRICE_CENTS = 30;
const START_BALANCE = 1_000;
const FILE_BYTES = Buffer.from("WEBVTT\n\n00:00.000 --> 00:01.000\nhello from a job\n", "utf8");

describeMaybe("async jobs with file output", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];
  let fileSlug: string;
  let tooBigSlug: string;
  const seeded: { userId: string; walletId: string }[] = [];
  const seededCaps: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 10 });
    db = drizzle(client);
    const { registerCapability } = await import("../capabilities/index.js");
    const { MAX_FILE_BYTES } = await import("../lib/jobs/files.js");
    fileSlug = `async-file-${randomUUID().slice(0, 8)}`;
    tooBigSlug = `async-toobig-${randomUUID().slice(0, 8)}`;
    registerCapability(fileSlug, async (input: any) => ({
      output: { segments: 1, language: input?.language ?? "en" },
      provenance: { source: "async-jobs-test", fetched_at: new Date().toISOString() },
      files: [{ name: "../transcript.vtt", content_type: "text/vtt", data: FILE_BYTES }],
    }));
    registerCapability(tooBigSlug, async () => ({
      output: { pages: 1 },
      provenance: { source: "async-jobs-test", fetched_at: new Date().toISOString() },
      files: [{ name: "huge.pdf", content_type: "application/pdf", data: Buffer.alloc(MAX_FILE_BYTES + 1) }],
    }));
    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    recorder.calls.length = 0;
    recorder.answers.length = 0;
    for (const { userId, walletId } of seeded) {
      await db.delete(jobFiles).where(eq(jobFiles.userId, userId));
      await db.delete(jobCallbacks).where(eq(jobCallbacks.userId, userId));
      await db.delete(walletReservations).where(eq(walletReservations.userId, userId));
      await db.delete(transactions).where(eq(transactions.userId, userId));
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
      await db.delete(users).where(eq(users.id, userId));
    }
    seeded.length = 0;
    for (const id of seededCaps) await db.delete(capabilities).where(eq(capabilities.id, id));
    seededCaps.length = 0;
  });

  async function seedCapability(slug: string) {
    const id = randomUUID();
    seededCaps.push(id);
    await db.insert(capabilities).values({
      id,
      slug,
      name: `Async job probe ${slug}`,
      description: "Seeded by the async-jobs integration test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { language: { type: "string" } } },
      outputSchema: { type: "object", properties: {} },
      priceCents: PRICE_CENTS,
      isActive: true,
      isFreeTier: false,
      avgLatencyMs: 20_000, // above ASYNC_THRESHOLD_MS: the async path
      lifecycleState: "active",
      visible: true,
    });
  }

  async function seedUser(): Promise<{ apiKey: string; userId: string; walletId: string }> {
    const userId = randomUUID();
    const walletId = randomUUID();
    const apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;
    seeded.push({ userId, walletId });
    await db.insert(users).values({
      id: userId,
      email: `async-jobs-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents: START_BALANCE });
    return { apiKey, userId, walletId };
  }

  function callDo(apiKey: string, body: Record<string, unknown>) {
    return app.request("http://localhost/v1/do", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  }

  function get(path: string, apiKey?: string) {
    return app.request(`http://localhost${path}`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
  }

  async function waitForTerminal(transactionId: string): Promise<string> {
    for (let i = 0; i < 200; i++) {
      const [row] = await db.select({ status: transactions.status }).from(transactions).where(eq(transactions.id, transactionId));
      if (row && (row.status === "completed" || row.status === "failed")) {
        // The callback attempt runs right after the terminal commit; wait for
        // it to record an outcome so assertions see a settled row.
        for (let j = 0; j < 200; j++) {
          const [cb] = await db.select({ state: jobCallbacks.state, code: jobCallbacks.lastStatusCode, err: jobCallbacks.lastError })
            .from(jobCallbacks).where(eq(jobCallbacks.transactionId, transactionId));
          if (!cb || cb.state !== "pending" || cb.code !== null || cb.err !== null) break;
          await new Promise((r) => setTimeout(r, 25));
        }
        return row.status;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("job did not reach a terminal state");
  }

  async function balanceOf(walletId: string) {
    const [w] = await db.select({ b: wallets.balanceCents }).from(wallets).where(eq(wallets.id, walletId));
    return w!.b;
  }

  function verifySignature(secret: string, header: string, body: string): boolean {
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
    if (!m) return false;
    const expected = createHmac("sha256", secret).update(`${m[1]}.${body}`).digest("hex");
    return expected === m[2];
  }

  it("completes, charges once, stores the file, calls back signed, and serves the file by signed URL", async () => {
    await seedCapability(fileSlug);
    const { apiKey, userId, walletId } = await seedUser();

    const res = await callDo(apiKey, {
      capability_slug: fileSlug,
      inputs: { language: "sv" },
      max_price_cents: 100,
      callback_url: "https://hooks.customer.example/strale",
    });
    expect(res.status).toBe(202);
    const accepted: any = await res.json();
    const txId: string = accepted.result.transaction_id;
    expect(accepted.result.status).toBe("executing");
    expect(accepted.result.poll_url).toBe(`/v1/transactions/${txId}`);
    expect(accepted.meta.callback.registered).toBe(true);

    expect(await waitForTerminal(txId)).toBe("completed");

    // Money: reserved at accept, captured on success, exactly once.
    expect(await balanceOf(walletId)).toBe(START_BALANCE - PRICE_CENTS);
    const [reservation] = await db.select().from(walletReservations).where(eq(walletReservations.transactionId, txId));
    expect(reservation!.state).toBe("captured");

    // File: stored with its hash, recorded in the hashed provenance.
    const stored = await db.select().from(jobFiles).where(eq(jobFiles.transactionId, txId));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.name).toBe("transcript.vtt"); // path stripped
    expect(stored[0]!.contentType).toBe("text/vtt");
    expect(Buffer.compare(stored[0]!.data, FILE_BYTES)).toBe(0);
    const sha = createHash("sha256").update(FILE_BYTES).digest("hex");

    // Callback: one POST, signed with the caller's secret, no output in it.
    expect(recorder.calls).toHaveLength(1);
    const call = recorder.calls[0]!;
    expect(call.url).toBe("https://hooks.customer.example/strale");
    const secretRes = await get("/v1/jobs/webhook-secret", apiKey);
    expect(secretRes.status).toBe(200);
    const { secret } = (await secretRes.json()) as { secret: string };
    expect(verifySignature(secret, call.headers["strale-signature"]!, call.body)).toBe(true);
    expect(verifySignature(`${secret}x`, call.headers["strale-signature"]!, call.body)).toBe(false);
    expect(call.headers["strale-event-id"]).toBe(txId);
    const payload = JSON.parse(call.body);
    expect(payload).toMatchObject({ event: "job.completed", transaction_id: txId, status: "completed", capability_slug: fileSlug });
    expect(payload.output).toBeUndefined();
    const [cb] = await db.select().from(jobCallbacks).where(eq(jobCallbacks.transactionId, txId));
    expect(cb!.state).toBe("delivered");
    expect(cb!.attempts).toBe(1);

    // Poll: output, the file with a fresh signed URL, and the callback state.
    const poll = await get(`/v1/transactions/${txId}`, apiKey);
    expect(poll.status).toBe(200);
    const detail: any = await poll.json();
    expect(detail.status).toBe("completed");
    expect(detail.output).toEqual({ segments: 1, language: "sv" });
    expect(detail.provenance.output_files).toEqual([
      expect.objectContaining({ name: "transcript.vtt", size_bytes: FILE_BYTES.length, sha256: sha }),
    ]);
    expect(detail.callback.state).toBe("delivered");
    expect(detail.files).toHaveLength(1);
    const link = new URL(detail.files[0].url);
    expect(detail.files[0].sha256).toBe(sha);

    // Download: no API key needed; the signature is the credential.
    const dl = await get(`${link.pathname}${link.search}`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("text/vtt");
    expect(dl.headers.get("content-disposition")).toBe('attachment; filename="transcript.vtt"');
    expect(Buffer.compare(Buffer.from(await dl.arrayBuffer()), FILE_BYTES)).toBe(0);

    // Tampered and expired links are refused.
    const tampered = link.search.replace(/sig=([0-9a-f])/, (_m, ch) => `sig=${ch === "0" ? "1" : "0"}`);
    expect((await get(`${link.pathname}${tampered}`)).status).toBe(403);
    const { signFileUrl } = await import("../lib/jobs/files.js");
    const stale = signFileUrl(stored[0]!.id, Date.now() - 2 * 3_600_000);
    expect((await get(stale.url)).status).toBe(410);

    // Another account cannot see the job.
    const other = await seedUser();
    expect((await get(`/v1/transactions/${txId}`, other.apiKey)).status).toBe(404);

    // Redaction (the 90-day sweep, a DELETE, account closure) stops the
    // download at once, and the next tick deletes the bytes.
    await db.update(transactions).set({ redactedAt: new Date() }).where(eq(transactions.id, txId));
    expect((await get(`${link.pathname}${link.search}`)).status).toBe(404);
    const { runAsyncJobsTickOnce } = await import("../jobs/async-jobs.js");
    const tick = await runAsyncJobsTickOnce();
    expect(tick.errors).toBe(0);
    expect(tick.filesDeleted).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(jobFiles).where(eq(jobFiles.transactionId, txId))).toHaveLength(0);
    // The delivered callback row of a redacted job goes too.
    expect(await db.select().from(jobCallbacks).where(eq(jobCallbacks.transactionId, txId))).toHaveLength(0);
  }, 60_000);

  it("refuses an oversized file result: the job fails, nothing is charged, nothing is stored", async () => {
    await seedCapability(tooBigSlug);
    const { apiKey, walletId } = await seedUser();

    const res = await callDo(apiKey, {
      capability_slug: tooBigSlug,
      inputs: {},
      max_price_cents: 100,
      callback_url: "https://hooks.customer.example/strale",
    });
    expect(res.status).toBe(202);
    const txId: string = ((await res.json()) as any).result.transaction_id;
    expect(await waitForTerminal(txId)).toBe("failed");

    expect(await balanceOf(walletId)).toBe(START_BALANCE);
    const [reservation] = await db.select().from(walletReservations).where(eq(walletReservations.transactionId, txId));
    expect(reservation!.state).toBe("released");
    expect(await db.select().from(jobFiles).where(eq(jobFiles.transactionId, txId))).toHaveLength(0);
    expect(recorder.calls).toHaveLength(1);
    expect(JSON.parse(recorder.calls[0]!.body)).toMatchObject({ event: "job.failed", status: "failed" });
  }, 60_000);

  it("retries a refused callback on the tick, with backoff, until delivered", async () => {
    await seedCapability(fileSlug);
    const { apiKey } = await seedUser();
    recorder.answers.push(500);

    const res = await callDo(apiKey, {
      capability_slug: fileSlug,
      inputs: {},
      max_price_cents: 100,
      callback_url: "https://hooks.customer.example/flaky",
    });
    const txId: string = ((await res.json()) as any).result.transaction_id;
    expect(await waitForTerminal(txId)).toBe("completed");

    let [cb] = await db.select().from(jobCallbacks).where(eq(jobCallbacks.transactionId, txId));
    expect(cb!.state).toBe("pending");
    expect(cb!.attempts).toBe(1);
    expect(cb!.lastStatusCode).toBe(500);
    // First backoff step is 30s.
    expect(cb!.nextAttemptAt!.getTime() - Date.now()).toBeGreaterThan(20_000);

    const { runAsyncJobsTickOnce } = await import("../jobs/async-jobs.js");
    // Not due yet: the tick leaves it alone.
    expect((await runAsyncJobsTickOnce()).callbacksAttempted).toBe(0);

    await db.update(jobCallbacks).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(jobCallbacks.transactionId, txId));
    const tick = await runAsyncJobsTickOnce();
    expect(tick.callbacksDelivered).toBe(1);
    [cb] = await db.select().from(jobCallbacks).where(eq(jobCallbacks.transactionId, txId));
    expect(cb!.state).toBe("delivered");
    expect(cb!.attempts).toBe(2);
    expect(recorder.calls).toHaveLength(2);
    // Stable event id across retries, for receiver-side dedup.
    expect(recorder.calls[0]!.headers["strale-event-id"]).toBe(recorder.calls[1]!.headers["strale-event-id"]);
  }, 60_000);

  it("gives up after the last attempt", async () => {
    await seedCapability(fileSlug);
    const { apiKey } = await seedUser();
    const { MAX_ATTEMPTS } = await import("../lib/jobs/callbacks.js");
    recorder.answers.push(...Array(MAX_ATTEMPTS).fill(503));

    const res = await callDo(apiKey, {
      capability_slug: fileSlug, inputs: {}, max_price_cents: 100,
      callback_url: "https://hooks.customer.example/down",
    });
    const txId: string = ((await res.json()) as any).result.transaction_id;
    await waitForTerminal(txId);

    const { runAsyncJobsTickOnce } = await import("../jobs/async-jobs.js");
    for (let i = 1; i < MAX_ATTEMPTS + 2; i++) {
      await db.update(jobCallbacks).set({ nextAttemptAt: new Date(Date.now() - 1000) })
        .where(sql`${jobCallbacks.transactionId} = ${txId} AND ${jobCallbacks.state} = 'pending'`);
      await runAsyncJobsTickOnce();
    }
    const [cb] = await db.select().from(jobCallbacks).where(eq(jobCallbacks.transactionId, txId));
    expect(cb!.state).toBe("failed");
    expect(cb!.attempts).toBe(MAX_ATTEMPTS);
    expect(recorder.calls).toHaveLength(MAX_ATTEMPTS);
  }, 60_000);

  it("rejects a non-https or private callback_url before any money moves", async () => {
    await seedCapability(fileSlug);
    const { apiKey, walletId } = await seedUser();
    const res = await callDo(apiKey, {
      capability_slug: fileSlug, inputs: {}, max_price_cents: 100,
      callback_url: "http://hooks.customer.example/plain",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error_code).toBe("invalid_request");
    expect(await balanceOf(walletId)).toBe(START_BALANCE);
  });

  it("purges by age and stays bounded per tick (DEC-20260504-B)", async () => {
    await seedCapability(fileSlug);
    const { apiKey, userId } = await seedUser();
    const res = await callDo(apiKey, { capability_slug: fileSlug, inputs: {}, max_price_cents: 100 });
    const txId: string = ((await res.json()) as any).result.transaction_id;
    await waitForTerminal(txId);

    const { FILE_PURGE_BATCH, MAX_BATCHES_PER_TICK, runAsyncJobsTickOnce } = await import("../jobs/async-jobs.js");
    const cap = FILE_PURGE_BATCH * MAX_BATCHES_PER_TICK;
    // A backlog one larger than a tick may delete, all past the window.
    await db.execute(sql`
      INSERT INTO job_files (transaction_id, user_id, name, content_type, size_bytes, sha256, data, created_at)
      SELECT ${txId}::uuid, ${userId}::uuid, 'old.bin', 'application/octet-stream', 1, 'x', '\\x00'::bytea,
             now() - interval '91 days'
      FROM generate_series(1, ${cap})
    `);
    // The job's own file is past the window too (created_at is now()), so
    // age it: total backlog = cap + 1.
    await db.execute(sql`UPDATE job_files SET created_at = now() - interval '91 days' WHERE transaction_id = ${txId}::uuid`);

    const first = await runAsyncJobsTickOnce();
    expect(first.filesDeleted).toBe(cap);
    expect(first.purgeHitCap).toBe(true);
    const second = await runAsyncJobsTickOnce();
    expect(second.filesDeleted).toBe(1);
    expect(await db.select().from(jobFiles).where(eq(jobFiles.transactionId, txId))).toHaveLength(0);
  }, 60_000);

  it("keeps an old file under legal hold", async () => {
    await seedCapability(fileSlug);
    const { apiKey } = await seedUser();
    const res = await callDo(apiKey, { capability_slug: fileSlug, inputs: {}, max_price_cents: 100 });
    const txId: string = ((await res.json()) as any).result.transaction_id;
    await waitForTerminal(txId);
    await db.update(transactions).set({ legalHold: true }).where(eq(transactions.id, txId));
    await db.execute(sql`UPDATE job_files SET created_at = now() - interval '91 days' WHERE transaction_id = ${txId}::uuid`);
    const { runAsyncJobsTickOnce } = await import("../jobs/async-jobs.js");
    await runAsyncJobsTickOnce();
    expect(await db.select().from(jobFiles).where(eq(jobFiles.transactionId, txId))).toHaveLength(1);
    await db.update(transactions).set({ legalHold: false }).where(eq(transactions.id, txId));
  }, 60_000);
});
