import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const lines: Array<Record<string, unknown>> = [];
vi.mock("../lib/log.js", () => ({ log: { info: (o: Record<string, unknown>) => lines.push(o) } }));

const { resetDistinctForTests, DISTINCT_CAP, xffShapeRoute, shapeOfRequest, classifyIp, buildShape, xffShapeLogger, XFF_SHAPE_MAX_LINES } = await import("./xff-shape.js");

const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const IPV6 = /(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}/i;

describe("classifyIp", () => {
  it.each([
    ["34.75.37.254", "public_v4"],
    ["8.8.8.8:443", "public_v4"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["172.32.0.1", "public_v4"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "cgnat"],
    ["100.127.255.255", "cgnat"],
    ["100.128.0.1", "public_v4"],
    ["127.0.0.1", "loopback"],
    ["::1", "loopback"],
    ["169.254.1.1", "link_local"],
    ["fe80::1", "link_local"],
    ["fd00::1", "private"],
    ["2a00:1450:4001::1", "public_v6"],
    ["[2a00:1450:4001::1]:443", "public_v6"],
    ["::ffff:10.0.0.1", "private"],
    ["::ffff:8.8.8.8", "public_v4"],
    ["garbage", "unparseable"],
    ["999.1.1.1", "unparseable"],
    ["", "unparseable"],
    [undefined, "unparseable"],
  ])("%s -> %s", (input, expected) => {
    expect(classifyIp(input as string | undefined)).toBe(expected);
  });
});

const none = { realIp: false, cf: false, forwarded: false, proto: true, host: false };

describe("buildShape", () => {
  it("records classes, counts and the peer match, never addresses", () => {
    const s = buildShape("203.0.113.9, 34.75.37.254, 10.0.0.2", "10.0.0.2", none);
    expect(s.entry_count).toBe(3);
    expect(s.entry_classes).toEqual(["private", "public_v4", "private"]);
    expect(s.left_most_is_peer).toBe(false);
    expect(buildShape("8.8.8.8, 1.1.1.1", "::ffff:8.8.8.8", none).left_most_is_peer).toBe(true);
  });

  it("handles missing header and caps positions", () => {
    expect(buildShape(undefined, "8.8.8.8", none).entry_count).toBe(0);
    const many = Array.from({ length: 40 }, () => "8.8.8.8").join(", ");
    const s = buildShape(many, "8.8.8.8", none);
    expect(s.entry_count).toBe(40);
    expect(s.entry_classes).toHaveLength(16);
    expect(s.entries_truncated).toBe(true);
  });

  it("never contains an IP-looking substring for a range of inputs", () => {
    const inputs = [
      "34.75.37.254, 66.33.22.4", "2a00:1450:4001::1, 8.8.8.8", "[2001:db8::1]:443", "garbage, 1.2.3.4:80",
      "::ffff:1.2.3.4", "10.0.0.1,100.64.1.1,127.0.0.1,fe80::1%eth0", ",,,", "999.999.999.999",
    ];
    for (const xff of inputs) {
      for (const peer of ["1.2.3.4", "::1", "2a00::1", undefined, "junk"]) {
        const json = JSON.stringify(buildShape(xff, peer, none));
        expect(json).not.toMatch(IPV4);
        expect(json).not.toMatch(IPV6);
      }
    }
  });
});

describe("xffShapeLogger", () => {
  beforeEach(() => {
    lines.length = 0;
    delete process.env.XFF_SHAPE_LOG;
  });
  const mk = (max?: number) => {
    const app = new Hono();
    app.use("*", xffShapeLogger({ maxLines: max }));
    app.get("/x", (c) => c.text("ok"));
    app.get("/health", (c) => c.text("ok"));
    return app;
  };
  const hit = (app: Hono, path = "/x") =>
    app.request(path, { headers: { "x-forwarded-for": "203.0.113.9, 34.75.37.254", "x-real-ip": "1.2.3.4" } });

  it("logs a shape line, default on, with no addresses", async () => {
    await hit(mk());
    expect(lines).toHaveLength(1);
    expect(lines[0].entry_classes).toEqual(["private", "public_v4"]);
    expect(lines[0].x_real_ip_present).toBe(true);
    expect(JSON.stringify(lines[0])).not.toMatch(IPV4);
  });

  it("stops after the cap and the default cap is 200", async () => {
    expect(XFF_SHAPE_MAX_LINES).toBe(200);
    const app = mk(3);
    for (let i = 0; i < 10; i++) await hit(app);
    expect(lines).toHaveLength(3);
  });

  it("is off with XFF_SHAPE_LOG=0 and skips /health", async () => {
    await hit(mk(), "/health");
    expect(lines).toHaveLength(0);
    process.env.XFF_SHAPE_LOG = "0";
    await hit(mk());
    expect(lines).toHaveLength(0);
  });
});

describe("GET /v1/debug/xff-shape (temporary)", () => {
  const headers = { "x-forwarded-for": "203.0.113.9, 34.75.37.254", "x-forwarded-proto": "https", "x-real-ip": "1.2.3.4" };
  it("returns the same shape as the logger, with no IP-looking substring", async () => {
    delete process.env.XFF_SHAPE_LOG;
    lines.length = 0;
    const app = new Hono();
    app.use("*", xffShapeLogger());
    app.route("/v1/debug/xff-shape", xffShapeRoute);
    const res = await app.request("/v1/debug/xff-shape", { headers });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toMatch(IPV4);
    expect(text).not.toMatch(IPV6);
    expect(JSON.parse(text)).toEqual(lines[0]);
    expect(JSON.parse(text).entry_classes).toEqual(["private", "public_v4"]);
  });
  it("is rate limited", async () => {
    const app = new Hono();
    app.route("/v1/debug/xff-shape", xffShapeRoute);
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) codes.push((await app.request("/v1/debug/xff-shape", { headers: { "x-forwarded-for": "198.51.100.77" } })).status);
    expect(codes).toContain(429);
  });
  it("shapeOfRequest is exported", () => expect(typeof shapeOfRequest).toBe("function"));
});

describe("distinct counters", () => {
  const xff = (v: string) => buildShape(v, undefined, none);
  beforeEach(() => resetDistinctForTests());

  it("same value twice counts once; distinct values grow left and right independently", () => {
    xff("8.8.8.8, 1.1.1.1");
    let s = xff("8.8.8.8, 1.1.1.1");
    expect([s.distinct_left_most_seen, s.distinct_right_most_seen]).toEqual([1, 1]);
    s = xff("8.8.4.4, 1.1.1.1");
    expect([s.distinct_left_most_seen, s.distinct_right_most_seen]).toEqual([2, 1]);
    s = xff("9.9.9.9, 1.0.0.1");
    expect([s.distinct_left_most_seen, s.distinct_right_most_seen]).toEqual([3, 2]);
  });

  it("left_most_equals_right_most", () => {
    expect(xff("8.8.8.8").left_most_equals_right_most).toBe(true);
    expect(xff("8.8.8.8, 8.8.8.8:80").left_most_equals_right_most).toBe(true);
    expect(xff("8.8.8.8, 1.1.1.1").left_most_equals_right_most).toBe(false);
    expect(xff("").left_most_equals_right_most).toBe(false);
  });

  it("saturates at the cap", () => {
    let s = xff("8.8.8.8");
    for (let i = 0; i < DISTINCT_CAP + 50; i++) s = xff(`10.${i >> 8}.${i & 255}.1, 1.1.1.1`);
    expect(s.distinct_left_most_seen).toBe(DISTINCT_CAP);
    expect(s.distinct_right_most_seen).toBe(2);
  });

  it("outputs only numbers and booleans for the new fields, no hex digests or IPs", () => {
    const s = xff("34.75.37.254, 66.33.22.4");
    expect(typeof s.distinct_left_most_seen).toBe("number");
    expect(typeof s.left_most_equals_right_most).toBe("boolean");
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/[0-9a-f]{32,}/i);
    expect(json).not.toMatch(IPV4);
    expect(json).not.toMatch(IPV6);
  });
});
