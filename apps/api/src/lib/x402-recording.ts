import { getDb } from "../db/index.js";
import { x402OrphanSettlements } from "../db/schema.js";
import { logError } from "./log.js";
import { inputForPersistence } from "./never-persist-inputs.js";

/** Preserve a paid result when its terminal record cannot be written. */
export async function captureX402RecordingFailure<T extends {
  settlementId?: string;
  capabilityId: string | null;
  solutionSlug: string | null;
  slug: string;
  payerAddress?: string | null;
  priceUsd: number;
  priceCents: number;
  inputs: Record<string, unknown>;
}>(db: ReturnType<typeof getDb>, args: T, err: unknown): Promise<void> {
  logError("x402-transaction-recording-failed", err);
  // CCO P0 #12: settlement preceded this INSERT and is irreversible.
  // Capture the orphan in a dedicated table so operations can reconcile
  // (recreate the transactions row OR refund the customer at payer_address).
  // Best-effort; if the orphan write also fails, we log and the only
  // remaining recovery is on-chain reconciliation against our wallet.
  if (args.settlementId) {
    try {
      await db.insert(x402OrphanSettlements).values({
        settlementId: args.settlementId,
        capabilitySlug: args.capabilityId ? args.slug : null,
        solutionSlug: args.solutionSlug,
        payerAddress: args.payerAddress ?? null,
        priceUsd: args.priceUsd.toFixed(4),
        priceCents: args.priceCents,
        // `args` carries the caller's inputs; a never-persisted field
        // (lib/never-persist-inputs.ts) is masked here like everywhere else.
        rawArgs: { ...args, inputs: inputForPersistence(args.slug, args.inputs) } as unknown as Record<string, unknown>,
        failureReason: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      });
      logError("x402-orphan-settlement-recorded", new Error(
        `Settlement ${args.settlementId} captured in x402_orphan_settlements for manual reconciliation`,
      ), { settlementId: args.settlementId });
    } catch (orphanErr) {
      // Both writes failed. This is a rare double-failure that
      // requires on-chain reconciliation. Log loudly with all the
      // context we have so an operator can manually recover.
      logError("x402-orphan-settlement-write-also-failed", orphanErr, {
        settlementId: args.settlementId,
        payerAddress: args.payerAddress,
        priceUsd: args.priceUsd,
        slug: args.slug,
        capabilityId: args.capabilityId,
        solutionSlug: args.solutionSlug,
      });
    }
  }
}
