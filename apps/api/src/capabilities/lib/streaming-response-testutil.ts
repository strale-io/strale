/**
 * Test-only factory for a `Response` that streams an exact number of bytes.
 *
 * Hoisted (#426) from input-byte-limits.test.ts, whose copy had already
 * diverged from image-resize.limits.test.ts's original in two load-bearing
 * ways a third copy would have had to rediscover:
 *
 *   - `highWaterMark: 0` — the default (1) makes the stream pull one chunk
 *     eagerly at construction, before any reader attaches, which falsifies
 *     "refused without pulling the body" pull-counter assertions.
 *   - the last chunk is sliced, so `totalBytes` is exact and ±1-byte boundary
 *     tests actually test the boundary.
 *
 * `pulls()` reports how many chunks were pulled by a consumer; `cancelled()`
 * reports whether the body was cancelled (reader.cancel() or body.cancel()),
 * which the early content-length refusal is required to do so the keep-alive
 * connection is not pinned until GC.
 *
 * Not part of the production build surface in any meaningful sense: it is
 * dependency-free, side-effect-free, and only test files import it. It lives
 * beside the code under test (not in a .test.ts) so the tsconfig gate
 * type-checks it — test files themselves are excluded from tsc.
 */

const CHUNK = 64 * 1024;

export interface StreamingResponseHandle {
  response: Response;
  pulls: () => number;
  cancelled: () => boolean;
}

export function streamingResponse(
  totalBytes: number,
  opts: { declare?: number; contentType?: string } = {},
): StreamingResponseHandle {
  let sent = 0;
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(ctrl) {
        if (sent >= totalBytes) {
          ctrl.close();
          return;
        }
        pulls++;
        const size = Math.min(CHUNK, totalBytes - sent);
        ctrl.enqueue(new Uint8Array(size));
        sent += size;
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const headers = new Headers();
  if (opts.declare !== undefined) headers.set("content-length", String(opts.declare));
  if (opts.contentType) headers.set("content-type", opts.contentType);
  return {
    response: new Response(body, { status: 200, headers }),
    pulls: () => pulls,
    cancelled: () => cancelled,
  };
}
