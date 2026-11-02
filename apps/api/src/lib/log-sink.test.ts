import { describe, expect, it, vi } from "vitest";
import { createBetterStackSink, resolveSinkConfig } from "./log-sink.js";

const line = (level: number, msg: string) => `${JSON.stringify({ level, time: 1_798_000_000_000, msg })}\n`;
const ok = () => Promise.resolve(new Response(null, { status: 202 }));

describe("resolveSinkConfig", () => {
  const prod = { NODE_ENV: "production" };
  it("is a no-op when both vars are unset", () => {
    expect(resolveSinkConfig(prod).state).toBe("disabled");
  });
  it("never ships from a test runner, even with both vars set", () => {
    const vars = { BETTERSTACK_SOURCE_TOKEN: "t", BETTERSTACK_INGEST_HOST: "s1.eu-nbg-2.betterstackdata.com" };
    expect(resolveSinkConfig({ ...vars, VITEST: "true" }).state).toBe("disabled");
    expect(resolveSinkConfig({ ...vars, NODE_ENV: "test" }).state).toBe("disabled");
  });
  it("reports one var without the other as misconfigured, not enabled", () => {
    expect(resolveSinkConfig({ ...prod, BETTERSTACK_SOURCE_TOKEN: "t" }).state).toBe("misconfigured");
    expect(resolveSinkConfig({ ...prod, BETTERSTACK_INGEST_HOST: "s1.eu-nbg-2.betterstackdata.com" }).state).toBe("misconfigured");
  });
  it("accepts a Better Stack host with or without a scheme and refuses any other host", () => {
    expect(resolveSinkConfig({ ...prod, BETTERSTACK_SOURCE_TOKEN: "t", BETTERSTACK_INGEST_HOST: "https://s1.eu-nbg-2.betterstackdata.com/" }))
      .toEqual({ state: "enabled", token: "t", host: "s1.eu-nbg-2.betterstackdata.com" });
    expect(resolveSinkConfig({ ...prod, BETTERSTACK_SOURCE_TOKEN: "t", BETTERSTACK_INGEST_HOST: "evil.example.com" }).state).toBe("misconfigured");
    expect(resolveSinkConfig({ ...prod, BETTERSTACK_SOURCE_TOKEN: "t", BETTERSTACK_INGEST_HOST: "betterstackdata.com.evil.io" }).state).toBe("misconfigured");
  });
});

describe("createBetterStackSink", () => {
  it("posts NDJSON with the bearer token, a dt timestamp and a level label", async () => {
    const fetchImpl = vi.fn(ok);
    const sink = createBetterStackSink({ token: "tok", host: "s1.eu-nbg-2.betterstackdata.com", fetchImpl, flushIntervalMs: 60_000 });
    sink.write(line(50, "boom")); sink.write(line(30, "fine"));
    await sink.close();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://s1.eu-nbg-2.betterstackdata.com");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const events = String(init.body).split("\n").map(e => JSON.parse(e));
    expect(events[0]).toEqual({ dt: "2026-12-23T04:26:40.000Z", msg: "boom", level: "error" });
    expect(events[1].level).toBe("info");
    expect(sink.stats()).toEqual({ buffered: 0, sent: 2, dropped: 0 });
  });

  it("write never touches the network and never throws, and the buffer is bounded", () => {
    const fetchImpl = vi.fn(ok);
    const sink = createBetterStackSink({ token: "t", host: "h.betterstackdata.com", fetchImpl, maxBufferLines: 3, maxBatchLines: 100, flushIntervalMs: 60_000 });
    for (let i = 0; i < 10; i++) expect(() => sink.write(line(30, `m${i}`))).not.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sink.stats()).toEqual({ buffered: 3, sent: 0, dropped: 7 });
    void sink.close();
  });

  it("drops a failed batch without retrying, pauses, and reports without the token", async () => {
    let t = 0;
    const reports: string[] = [];
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError("network down")));
    const sink = createBetterStackSink({ token: "secret-token", host: "h.betterstackdata.com", fetchImpl, flushIntervalMs: 60_000,
      pauseAfterFailureMs: 1_000, now: () => t, reportFailure: m => reports.push(m) });
    sink.write(line(50, "a"));
    await sink.flush();
    expect(sink.stats()).toEqual({ buffered: 0, sent: 0, dropped: 1 });
    sink.write(line(50, "b"));
    await sink.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1); // paused: no second attempt yet
    expect(sink.stats().buffered).toBe(1);
    t = 2_000;
    await sink.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(reports.join("")).toContain("log-sink.batch-dropped");
    expect(reports.join("")).not.toContain("secret-token");
    await sink.close();
  });

  it("caps a request by size as well as by line count", async () => {
    const fetchImpl = vi.fn(ok);
    const sink = createBetterStackSink({ token: "t", host: "h.betterstackdata.com", fetchImpl, flushIntervalMs: 60_000, maxBatchChars: 350 });
    for (let i = 0; i < 4; i++) sink.write(line(30, "x".repeat(100)));
    await sink.flush();
    expect(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body).split("\n")).toHaveLength(2);
    await sink.close();
    expect(sink.stats()).toEqual({ buffered: 0, sent: 4, dropped: 0 });
  });

  it("treats a non-2xx answer (quota, bad token) as a dropped batch", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response("Quota exceeded", { status: 402 })));
    const sink = createBetterStackSink({ token: "t", host: "h.betterstackdata.com", fetchImpl, flushIntervalMs: 60_000, reportFailure: () => {} });
    sink.write(line(30, "a"));
    await sink.close();
    expect(sink.stats()).toEqual({ buffered: 0, sent: 0, dropped: 1 });
  });
});
