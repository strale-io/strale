import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "./shared.js";

/** A fake worker: answers each request through `respond`, records what it was sent. */
class FakeChild extends EventEmitter {
  connected = true;
  sent: WorkerRequest[] = [];
  constructor(private respond: (req: WorkerRequest, self: FakeChild) => WorkerResponse | null) { super(); }
  send(req: WorkerRequest) {
    this.sent.push(req);
    const reply = this.respond(req, this);
    if (reply) queueMicrotask(() => this.emit("message", reply));
    return true;
  }
  kill() { this.connected = false; queueMicrotask(() => this.emit("exit", null)); return true; }
}

const children: FakeChild[] = [];
let respond: (req: WorkerRequest, self: FakeChild) => WorkerResponse | null = () => null;
vi.mock("node:child_process", () => ({
  fork: () => { const c = new FakeChild(respond); children.push(c); return c; },
}));
vi.mock("./shared.js", async (orig) => ({
  ...(await orig<typeof import("./shared.js")>()),
  resolvePlacesRelease: async () => ({ release: "2026-10-21.0", files: ["s3://x"] }),
}));

const { queryPlaces, stopPlacesWorker } = await import("./client.js");
const q = { latitude: 59, longitude: 18, radius_m: 100, query: null, category: null, limit: 1 };
const ok = (req: WorkerRequest, retire = false): WorkerResponse =>
  ({ id: req.id, ok: true, result: { release: req.release.release, files_scanned: 1, rows: [] }, retire });

describe("places worker client", () => {
  afterEach(() => { stopPlacesWorker(); children.length = 0; });

  it("reuses one worker across calls and passes the resolved release", async () => {
    respond = (req) => ok(req);
    await queryPlaces(q);
    await queryPlaces(q);
    expect(children).toHaveLength(1);
    expect(children[0].sent[0].release.release).toBe("2026-10-21.0");
  });

  it("forks a fresh worker after one retires, instead of sending into its exit", async () => {
    // The retiring worker exits only after its reply is delivered; a call sent
    // to it in that window would be lost (the race seen in the live run).
    respond = (req, self) => (self === children[0] ? ok(req, true) : ok(req));
    await queryPlaces(q);
    await queryPlaces(q);
    expect(children).toHaveLength(2);
    expect(children[0].sent).toHaveLength(1);
    expect(children[1].sent).toHaveLength(1);
  });

  it("surfaces a worker error and a worker crash as errors", async () => {
    respond = (req) => ({ id: req.id, ok: false, error: "boom", retire: false });
    await expect(queryPlaces(q)).rejects.toThrow(/failed: boom/);
    respond = (_req, self) => { queueMicrotask(() => self.emit("exit", 1)); return null; };
    stopPlacesWorker();
    await expect(queryPlaces(q)).rejects.toThrow(/exited \(code 1\)/);
  });
});
