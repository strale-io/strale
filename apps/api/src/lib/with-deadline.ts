/**
 * Bound how long we WAIT for a promise. WP10 (CR-08).
 *
 * This is not a scheduler and must not be confused with one — the distinction
 * matters enough that this file exists. `no-boot-relative-timers.test.ts` bans
 * timers outright in every migrated job module, because a timer there means the
 * job schedules itself and has escaped `job_schedule`. A per-operation deadline
 * uses the same primitive for the opposite purpose, so it lives here instead of
 * being carved out of the lint with an exemption a later author could copy for
 * a real scheduler.
 *
 * It does NOT cancel the underlying work. Nothing here can safely abort an
 * arbitrary in-flight promise; callers stop waiting and must decide for
 * themselves what the still-running operation is now entitled to.
 */

export class DeadlineExceeded extends Error {
  readonly label: string;
  readonly waitedMs: number;

  constructor(label: string, ms: number) {
    super(`${label} did not settle within ${Math.round(ms / 1000)}s`);
    this.name = "DeadlineExceeded";
    this.label = label;
    this.waitedMs = ms;
  }
}

export function withDeadline<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineExceeded(label, ms)), ms);
    // Never let the deadline itself hold the event loop open.
    timer.unref?.();
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
