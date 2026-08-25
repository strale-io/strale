import { registerJobSync } from "../lib/job-coordinator.js";
import { log, logWarn } from "../lib/log.js";
import { runVendorControlTower } from "../lib/vendor-control-tower.js";

const HOUR = 60 * 60 * 1000;

async function tick(): Promise<void> {
  try {
    await runVendorControlTower();
    log.info({ label: "vendor-control-tower-ok" }, "vendor-control-tower-ok");
  } catch (error) {
    // Coordinator failures are retried, but retain a local summary too: this
    // job exists specifically to prevent silent account exhaustion.
    logWarn("vendor-control-tower-failed", "vendor control tower tick failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function startVendorControlTower(): void {
  registerJobSync({
    name: "vendor-control-tower",
    intervalMs: HOUR,
    handler: tick,
  });
}
