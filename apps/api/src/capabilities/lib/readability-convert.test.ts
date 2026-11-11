/**
 * R1: the HTML conversion runs off the event loop under a wall-clock limit.
 *
 * The #964 review found pages that pass every markup limit and still take
 * 10-80 s to convert (10k flat <div>: 9.4 s in Readability). Run on the main
 * thread, that time blocks every other request. These tests hold that the
 * API stays responsive while such a page is converted, that the page is
 * refused at the limit, and that the converter recovers afterwards.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ResourceLimitError } from "../../lib/resource-limits.js";
import { runAsCaller } from "../../lib/caller-scope.js";
import { HtmlTooComplexError } from "./html-parse-bound.js";
import {
  convertHtmlToMarkdownSync,
  postProcessMarkdown,
} from "./readability-convert-sync.js";
import {
  __callerCooldownCountForTests,
  assertConverterAvailableForCaller,
  __coolDownCallerForTests,
  __setWorkerFactoryForTests,
  boundInput,
  CONVERSION_LIMITS,
  ConversionBusyError,
  ConversionCallerCooldownError,
  htmlToCleanMarkdown,
  stopConversionWorkers,
} from "./readability-convert.js";

const DEFAULTS = { ...CONVERSION_LIMITS };
const URL_ = "https://example.test/a";

/** Within every markup limit, but Readability needs seconds for it. */
const SLOW_PAGE = `<html><body>${"<div>a short line of text</div>".repeat(
  10_000
)}</body></html>`;
const ARTICLE = `<html><head><title>T</title></head><body><article><h1>Heading</h1>${"<p>Readable words that a person would want in the Markdown output, long enough to count.</p>".repeat(
  40
)}</article></body></html>`;

/** Longest gap between ticks of a 10 ms interval while `work` runs. */
async function maxEventLoopGap<T>(
  work: () => Promise<T>
): Promise<{ gap: number; value: T | undefined; error: unknown }> {
  let last = performance.now();
  let gap = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    gap = Math.max(gap, now - last);
    last = now;
  }, 10);
  // Let the interval tick once more after `work` settles: a synchronous block
  // that ends with the settle is only seen by the tick after it (F5 of the
  // second R1 review).
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 30));
    clearInterval(timer);
  };
  try {
    const value = await work();
    await settle();
    return { gap, value, error: null };
  } catch (error) {
    await settle();
    return { gap, value: undefined, error };
  }
}

beforeAll(async () => {
  await htmlToCleanMarkdown("<p>warm up</p>", URL_); // start the worker once
}, 30_000);
afterEach(async () => {
  __setWorkerFactoryForTests(null);
  Object.assign(CONVERSION_LIMITS, DEFAULTS);
  await stopConversionWorkers();
});
afterAll(stopConversionWorkers);

describe("htmlToCleanMarkdown in a worker", () => {
  it("serves five pages from one caller exactly as the global queue did", async () => {
    await stopConversionWorkers();
    const { EventEmitter } = await import("node:events");
    class HeldWorker extends EventEmitter {
      messages: Array<{ id: number }> = [];
      unref() {}
      postMessage(message: { id: number }) {
        this.messages.push(message);
      }
      terminate() {
        this.emit("exit", 0);
        return Promise.resolve(0);
      }
    }
    const worker = new HeldWorker();
    __setWorkerFactoryForTests((() => worker) as never);
    try {
      const pages = Array.from({ length: 5 }, (_, i) =>
        runAsCaller("ip:solo", () => htmlToCleanMarkdown(`<p>${i}</p>`, URL_))
      );
      for (let i = 0; i < pages.length; i++) {
        const message = worker.messages[i]!;
        expect(message).toBeDefined();
        worker.emit("message", {
          id: message.id,
          ok: true,
          result: { markdown: String(i), title: "", usedReadability: false },
        });
        await expect(pages[i]).resolves.toMatchObject({ markdown: String(i) });
        await new Promise((resolve) => setImmediate(resolve));
      }
    } finally {
      __setWorkerFactoryForTests(null);
      await stopConversionWorkers();
    }
  });

  it("evicts A's newest queued page and dispatches B next when A filled the queue", async () => {
    await stopConversionWorkers();
    const { EventEmitter } = await import("node:events");
    class HeldWorker extends EventEmitter {
      messages: Array<{ id: number }> = [];
      unref() {}
      postMessage(message: { id: number }) {
        this.messages.push(message);
      }
      terminate() {
        this.emit("exit", 0);
        return Promise.resolve(0);
      }
    }
    const worker = new HeldWorker();
    __setWorkerFactoryForTests((() => worker) as never);
    const outcomes: Array<Promise<unknown>> = [];
    try {
      const pagesA = Array.from({ length: 5 }, (_, i) =>
        runAsCaller("ip:a", () => htmlToCleanMarkdown(`<p>a${i}</p>`, URL_))
      );
      outcomes.push(
        ...pagesA.map((promise) => promise.catch((error) => error))
      );
      const pageB = runAsCaller("ip:b", () =>
        htmlToCleanMarkdown("<p>b</p>", URL_)
      );
      outcomes.push(pageB.catch((error) => error));
      await expect(outcomes[4]).resolves.toBeInstanceOf(ConversionBusyError);

      worker.emit("message", {
        id: worker.messages[0]!.id,
        ok: true,
        result: { markdown: "a0", title: "", usedReadability: false },
      });
      await expect(pagesA[0]).resolves.toMatchObject({ markdown: "a0" });
      await new Promise((resolve) => setImmediate(resolve));
      expect(worker.messages[1]).toBeDefined();
      worker.emit("message", {
        id: worker.messages[1]!.id,
        ok: true,
        result: { markdown: "b", title: "", usedReadability: false },
      });
      await expect(pageB).resolves.toMatchObject({ markdown: "b" });
    } finally {
      await stopConversionWorkers();
      await Promise.all(outcomes);
      __setWorkerFactoryForTests(null);
    }
  });

  it("dispatches queued caller buckets A, B, C, A in round-robin order", async () => {
    await stopConversionWorkers();
    const { EventEmitter } = await import("node:events");
    class HeldWorker extends EventEmitter {
      messages: Array<{ id: number }> = [];
      unref() {}
      postMessage(message: { id: number }) {
        this.messages.push(message);
      }
      terminate() {
        this.emit("exit", 0);
        return Promise.resolve(0);
      }
    }
    const worker = new HeldWorker();
    __setWorkerFactoryForTests((() => worker) as never);
    const prime = htmlToCleanMarkdown("<p>prime</p>", URL_);
    const jobs = ["a", "b", "c", "a"].map((key, i) =>
      runAsCaller(`ip:rr-${key}`, () =>
        htmlToCleanMarkdown(`<p>${key}${i}</p>`, URL_)
      )
    );
    try {
      worker.emit("message", {
        id: worker.messages[0]!.id,
        ok: true,
        result: { markdown: "prime", title: "", usedReadability: false },
      });
      await prime;
      for (const expected of ["a", "b", "c", "a"]) {
        await new Promise((resolve) => setImmediate(resolve));
        const message = worker.messages.at(-1)!;
        worker.emit("message", {
          id: message.id,
          ok: true,
          result: { markdown: expected, title: "", usedReadability: false },
        });
      }
      await expect(Promise.all(jobs)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ markdown: "a" }),
          expect.objectContaining({ markdown: "b" }),
          expect.objectContaining({ markdown: "c" }),
        ])
      );
      expect(
        (await Promise.all(jobs)).map((result) => result.markdown)
      ).toEqual(["a", "b", "c", "a"]);
    } finally {
      await stopConversionWorkers();
      __setWorkerFactoryForTests(null);
    }
  });

  it("unkeyed pages neither evict nor are evicted", async () => {
    await stopConversionWorkers();
    const { EventEmitter } = await import("node:events");
    class HeldWorker extends EventEmitter {
      unref() {}
      postMessage() {}
      terminate() {
        this.emit("exit", 0);
        return Promise.resolve(0);
      }
    }
    __setWorkerFactoryForTests((() => new HeldWorker()) as never);
    CONVERSION_LIMITS.maxQueued = 2;
    const all: Array<Promise<unknown>> = [];
    try {
      all.push(
        htmlToCleanMarkdown("<p>running</p>", URL_).catch((error) => error)
      );
      all.push(htmlToCleanMarkdown("<p>u1</p>", URL_).catch((error) => error));
      all.push(htmlToCleanMarkdown("<p>u2</p>", URL_).catch((error) => error));
      await expect(
        runAsCaller("ip:new", () => htmlToCleanMarkdown("<p>keyed</p>", URL_))
      ).rejects.toBeInstanceOf(ConversionBusyError);
      await stopConversionWorkers();

      all.length = 0;
      all.push(
        runAsCaller("ip:running", () =>
          htmlToCleanMarkdown("<p>running</p>", URL_)
        ).catch((error) => error)
      );
      all.push(
        runAsCaller("ip:a", () => htmlToCleanMarkdown("<p>a1</p>", URL_)).catch(
          (error) => error
        )
      );
      all.push(
        runAsCaller("ip:a", () => htmlToCleanMarkdown("<p>a2</p>", URL_)).catch(
          (error) => error
        )
      );
      await expect(
        htmlToCleanMarkdown("<p>unkeyed</p>", URL_)
      ).rejects.toBeInstanceOf(ConversionBusyError);
    } finally {
      await stopConversionWorkers();
      await Promise.all(all);
      __setWorkerFactoryForTests(null);
    }
  });

  it("clears an evicted page's queue timer so it rejects only once", async () => {
    await stopConversionWorkers();
    vi.useFakeTimers();
    const { EventEmitter } = await import("node:events");
    class HeldWorker extends EventEmitter {
      unref() {}
      postMessage() {}
      terminate() {
        this.emit("exit", 0);
        return Promise.resolve(0);
      }
    }
    __setWorkerFactoryForTests((() => new HeldWorker()) as never);
    CONVERSION_LIMITS.timeoutMs = 100_000;
    let rejections = 0;
    const pages = Array.from({ length: 5 }, (_, i) =>
      runAsCaller("ip:timer-a", () =>
        htmlToCleanMarkdown(`<p>${i}</p>`, URL_)
      ).catch((error) => {
        rejections++;
        return error;
      })
    );
    const admitted = runAsCaller("ip:timer-b", () =>
      htmlToCleanMarkdown("<p>b</p>", URL_)
    ).catch((error) => error);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(rejections).toBe(1);
      await vi.advanceTimersByTimeAsync(CONVERSION_LIMITS.maxQueueWaitMs + 1);
      expect(rejections).toBe(4); // three remaining A pages expire; evicted A does not reject again
    } finally {
      await stopConversionWorkers();
      await Promise.all([...pages, admitted]);
      __setWorkerFactoryForTests(null);
      vi.useRealTimers();
    }
  });

  it("cools down only after the production-duration timer expires", async () => {
    await stopConversionWorkers();
    vi.useFakeTimers();
    const { EventEmitter } = await import("node:events");
    class NeverWorker extends EventEmitter {
      unref() {}
      postMessage() {}
      terminate() {
        this.emit("exit", 1);
        return Promise.resolve(1);
      }
    }
    __setWorkerFactoryForTests((() => new NeverWorker()) as never);
    try {
      const timedOut = runAsCaller("ip:cool", () =>
        htmlToCleanMarkdown("<p>a</p>", URL_)
      );
      const handled = timedOut.catch((error) => error);
      await vi.advanceTimersByTimeAsync(CONVERSION_LIMITS.timeoutMs);
      await expect(handled).resolves.toBeInstanceOf(HtmlTooComplexError);
      await expect(
        runAsCaller("ip:cool", () => htmlToCleanMarkdown("<p>a</p>", URL_))
      ).rejects.toBeInstanceOf(ConversionCallerCooldownError);
      const other = runAsCaller("ip:not-cool", () =>
        htmlToCleanMarkdown("<p>b</p>", URL_)
      );
      const otherHandled = other.catch((error) => error);
      await vi.advanceTimersByTimeAsync(CONVERSION_LIMITS.timeoutMs);
      await expect(otherHandled).resolves.toBeInstanceOf(HtmlTooComplexError);
      await vi.advanceTimersByTimeAsync(
        CONVERSION_LIMITS.callerCooldownMs - CONVERSION_LIMITS.timeoutMs
      );
      expect(() =>
        runAsCaller("ip:cool", async () => {
          assertConverterAvailableForCaller();
        })
      ).not.toThrow();
    } finally {
      await stopConversionWorkers();
      __setWorkerFactoryForTests(null);
      vi.useRealTimers();
    }
  });

  it("a quick tooComplex worker reply does not cool down its caller", async () => {
    await stopConversionWorkers();
    const { EventEmitter } = await import("node:events");
    class RefusingWorker extends EventEmitter {
      unref() {}
      postMessage(message: { id: number }) {
        queueMicrotask(() =>
          this.emit("message", {
            id: message.id,
            ok: false,
            tooComplex: true,
            message: "too many tags",
          })
        );
      }
      terminate() {
        this.emit("exit", 0);
        return Promise.resolve(0);
      }
    }
    __setWorkerFactoryForTests((() => new RefusingWorker()) as never);
    try {
      await expect(
        runAsCaller("ip:quick", () => htmlToCleanMarkdown("<p>a</p>", URL_))
      ).rejects.toBeInstanceOf(HtmlTooComplexError);
      await expect(
        runAsCaller("ip:quick", () => htmlToCleanMarkdown("<p>b</p>", URL_))
      ).rejects.toBeInstanceOf(HtmlTooComplexError);
    } finally {
      __setWorkerFactoryForTests(null);
      await stopConversionWorkers();
    }
  });

  it("bounds caller cooldown bookkeeping at 10,000 entries", () => {
    for (let i = 0; i < 10_001; i++) __coolDownCallerForTests(`bounded:${i}`);
    expect(__callerCooldownCountForTests()).toBe(10_000);
  });
  it("returns exactly what the in-process conversion returns", async () => {
    expect(await htmlToCleanMarkdown(ARTICLE, URL_)).toEqual(
      convertHtmlToMarkdownSync(ARTICLE, URL_)
    );
  });

  it("keeps the event loop responsive on a slow page and refuses it at the time limit", async () => {
    CONVERSION_LIMITS.timeoutMs = 1_500;
    const started = performance.now();
    const { gap, error } = await maxEventLoopGap(() =>
      htmlToCleanMarkdown(SLOW_PAGE, URL_)
    );
    const ms = performance.now() - started;
    expect(error).toBeInstanceOf(HtmlTooComplexError);
    expect((error as ResourceLimitError).isCapabilityRefusal).toBe(true);
    expect((error as Error).message).toMatch(/did not finish within 1.5 s/);
    expect(ms).toBeLessThan(3_000);
    // In-process, the whole conversion is one gap of several seconds.
    expect(gap).toBeLessThan(250);
  }, 20_000);

  it("recovers after terminating a worker: the next page converts", async () => {
    CONVERSION_LIMITS.timeoutMs = 1_000;
    await expect(htmlToCleanMarkdown(SLOW_PAGE, URL_)).rejects.toBeInstanceOf(
      HtmlTooComplexError
    );
    CONVERSION_LIMITS.timeoutMs = DEFAULTS.timeoutMs;
    const result = await htmlToCleanMarkdown(ARTICLE, URL_);
    expect(result.markdown).toContain("# Heading");
  }, 30_000);

  it("refuses at once when the queue is full, and never bills it", async () => {
    await stopConversionWorkers();
    CONVERSION_LIMITS.workers = 1;
    CONVERSION_LIMITS.maxQueued = 1;
    CONVERSION_LIMITS.timeoutMs = 1_000;
    const running = htmlToCleanMarkdown(SLOW_PAGE, URL_); // takes the only worker
    const queued = htmlToCleanMarkdown(ARTICLE, URL_); // waits
    await expect(htmlToCleanMarkdown(ARTICLE, URL_)).rejects.toBeInstanceOf(
      ConversionBusyError
    );
    const busy = new ConversionBusyError();
    expect(busy).toBeInstanceOf(ResourceLimitError);
    expect(busy.isCapabilityRefusal).toBe(true);
    await expect(running).rejects.toBeInstanceOf(HtmlTooComplexError);
    CONVERSION_LIMITS.timeoutMs = DEFAULTS.timeoutMs;
    expect((await queued).markdown).toContain("# Heading");
    await stopConversionWorkers();
  }, 30_000);

  it("the gap helper sees a block that ends as the work settles", async () => {
    // Guards the helper itself: an in-process conversion is exactly this shape.
    const { gap } = await maxEventLoopGap(async () => {
      await new Promise((r) => setTimeout(r, 15));
      const end = performance.now() + 400;
      while (performance.now() < end) {
        /* block */
      }
    });
    expect(gap).toBeGreaterThan(300);
  });

  it("strips links and images in the worker, with the same result as in-process", async () => {
    const page = ARTICLE.replace(
      "</article>",
      '<p>See <a href="https://example.test/x">the docs</a> and <img src="https://example.test/i.png" alt="pic"></p></article>'
    );
    const expected = convertHtmlToMarkdownSync(page, URL_);
    const options = { includeLinks: false, includeImages: false };
    const got = await htmlToCleanMarkdown(page, URL_, options);
    expect(got.markdown).toBe(postProcessMarkdown(expected.markdown, options));
    expect(got.markdown).toContain("See the docs");
    expect(got.markdown).not.toContain("](");
  });

  it("keeps the event loop free while stripping links from a flood of '['", async () => {
    // 60,000 "[" in a <pre> reach the Markdown unescaped; the link regex then
    // rescans from every "[": about 1 s on the main thread before the move.
    const page = `<html><body><p>${"Readable words for the intro. ".repeat(
      10
    )}</p><pre>${"[".repeat(60_000)}</pre></body></html>`;
    const { gap, error } = await maxEventLoopGap(() =>
      htmlToCleanMarkdown(page, URL_, { includeLinks: false })
    );
    expect(error).toBeNull();
    expect(gap).toBeLessThan(250);
  }, 20_000);

  it("cuts input past maxInputChars at a tag boundary", () => {
    CONVERSION_LIMITS.maxInputChars = 20;
    expect(boundInput("<p>short</p>")).toBe("<p>short</p>");
    expect(boundInput("<p>aaaa</p><p>bbbbbbbbbbbbbb</p>")).toBe("<p>aaaa</p>");
  });

  it("cuts a long run of text at the limit rather than at a much earlier tag", () => {
    // Third R1 review, M1: "<p>" and 15 MB of words kept only "<html><body>".
    CONVERSION_LIMITS.maxInputChars = 200_000;
    const html = `<html><body><p>${"word ".repeat(100_000)}</p></body></html>`;
    const cut = boundInput(html);
    expect(cut.length).toBe(200_000);
    expect(cut.startsWith("<html><body><p>word word")).toBe(true);
  });

  it("never splits a surrogate pair at the cut", () => {
    CONVERSION_LIMITS.maxInputChars = 101;
    const html = `<p>${"x".repeat(97)}😀😀😀</p>`; // the emoji starts at index 100
    const cut = boundInput(html);
    expect(cut.length).toBe(100);
    expect(cut.endsWith("x")).toBe(true);
  });

  it("a worker that cannot start fails its job with a plain message, and the next job works", async () => {
    await stopConversionWorkers();
    __setWorkerFactoryForTests(() => {
      throw new Error(
        "readability worker missing at /app/dist/capabilities/lib/readability-worker.js"
      );
    });
    const error = await htmlToCleanMarkdown(ARTICLE, URL_).catch((e) => e);
    expect((error as Error).message).toBe(
      "The page converter could not start. Please retry later."
    );
    expect((error as Error).message).not.toContain("/app/");
    __setWorkerFactoryForTests(null);
    const ok = await htmlToCleanMarkdown(ARTICLE, URL_);
    expect(ok.markdown).toContain("# Heading");
  }, 30_000);

  it("the memory budget: one conversion at a time, heap sized for a 1 GB box", () => {
    // Fifth R1 review: memory per conversion follows the markup, not the size,
    // so two small hostile pages at once reached +605 MB.
    expect(CONVERSION_LIMITS.workers).toBe(1);
    expect(
      CONVERSION_LIMITS.maxOldGenerationSizeMb +
        CONVERSION_LIMITS.maxYoungGenerationSizeMb
    ).toBeLessThanOrEqual(512);
    expect(CONVERSION_LIMITS.maxInputChars).toBeLessThanOrEqual(
      2 * 1024 * 1024
    );
  });

  it("starts the next page only after a timed-out worker has exited", async () => {
    // Fifth R1 review, finding 4: the replacement started while the old worker
    // was still releasing its heap.
    await stopConversionWorkers();
    const { EventEmitter } = await import("node:events");
    const spawnedAt: number[] = [];
    let exitedAt = 0;
    class SlowExitWorker extends EventEmitter {
      unref() {}
      postMessage() {} // never answers
      terminate() {
        return new Promise<number>((resolve) =>
          setTimeout(() => {
            exitedAt = performance.now();
            this.emit("exit", 1);
            resolve(1);
          }, 300)
        );
      }
    }
    __setWorkerFactoryForTests((() => {
      spawnedAt.push(performance.now());
      return new SlowExitWorker();
    }) as never);
    CONVERSION_LIMITS.timeoutMs = 200;
    const first = htmlToCleanMarkdown("<p>a</p>", URL_);
    const second = htmlToCleanMarkdown("<p>b</p>", URL_);
    await expect(first).rejects.toBeInstanceOf(HtmlTooComplexError);
    await expect(second).rejects.toBeInstanceOf(HtmlTooComplexError);
    expect(spawnedAt.length).toBe(2);
    expect(exitedAt).toBeGreaterThan(0);
    expect(spawnedAt[1]).toBeGreaterThanOrEqual(exitedAt);
    __setWorkerFactoryForTests(null);
    await stopConversionWorkers();
  }, 30_000);

  it("frees the slot if a stopped worker never reports its exit", async () => {
    // Sixth R1 review, finding 3: with one worker, a lost "exit" would refuse
    // every page until a restart.
    await stopConversionWorkers();
    const { EventEmitter } = await import("node:events");
    let spawned = 0;
    class SilentWorker extends EventEmitter {
      unref() {}
      postMessage(msg: { id: number }) {
        if (spawned > 1)
          setImmediate(() =>
            this.emit("message", {
              id: msg.id,
              ok: true,
              result: { markdown: "ok", title: "", usedReadability: false },
            })
          );
      }
      terminate() {
        return new Promise<number>(() => {});
      } // never exits
    }
    __setWorkerFactoryForTests((() => {
      spawned++;
      return new SilentWorker();
    }) as never);
    CONVERSION_LIMITS.timeoutMs = 100;
    CONVERSION_LIMITS.exitWatchdogMs = 300;
    await expect(htmlToCleanMarkdown("<p>a</p>", URL_)).rejects.toBeInstanceOf(
      HtmlTooComplexError
    );
    const next = await htmlToCleanMarkdown("<p>b</p>", URL_);
    expect(next.markdown).toBe("ok");
    expect(spawned).toBe(2);
    __setWorkerFactoryForTests(null);
  }, 30_000);

  it("gives the caller a plain message when the worker fails, and keeps the detail in the log", async () => {
    // Sixth R1 review, finding 5.
    await stopConversionWorkers();
    const { EventEmitter } = await import("node:events");
    class FailingWorker extends EventEmitter {
      unref() {}
      postMessage() {
        setImmediate(() => {
          this.emit(
            "error",
            new Error("Cannot find module '/app/dist/secret/path.js'")
          );
          this.emit("exit", 1);
        });
      }
      terminate() {
        return Promise.resolve(1);
      }
    }
    __setWorkerFactoryForTests((() => new FailingWorker()) as never);
    const error = await htmlToCleanMarkdown("<p>a</p>", URL_).catch((e) => e);
    expect((error as Error).message).toBe(
      "The page converter failed. Please retry."
    );
    __setWorkerFactoryForTests(null);
    await stopConversionWorkers();
  }, 30_000);

  it("refuses a page that waits in the queue past maxQueueWaitMs", async () => {
    await stopConversionWorkers();
    CONVERSION_LIMITS.workers = 1;
    CONVERSION_LIMITS.timeoutMs = 3_000;
    CONVERSION_LIMITS.maxQueueWaitMs = 500;
    const running = htmlToCleanMarkdown(SLOW_PAGE, URL_);
    const started = performance.now();
    await expect(htmlToCleanMarkdown(ARTICLE, URL_)).rejects.toBeInstanceOf(
      ConversionBusyError
    );
    expect(performance.now() - started).toBeLessThan(2_000);
    await expect(running).rejects.toBeInstanceOf(HtmlTooComplexError);
    await stopConversionWorkers();
  }, 30_000);

  it("passes a markup refusal from the worker back as HtmlTooComplexError", async () => {
    const error = await htmlToCleanMarkdown(
      "<p>x".repeat(1_000_000),
      URL_
    ).catch((e) => e);
    expect(error).toBeInstanceOf(HtmlTooComplexError);
    expect((error as Error).message).toMatch(/too complex to convert safely/);
  }, 20_000);
});
