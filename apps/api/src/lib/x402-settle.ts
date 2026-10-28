import { getDb } from "../db/index.js";
import { settleX402Payment, type X402VerifiedPayment } from "./x402-gateway.js";
import { openClaimedX402Intent } from "./x402-payment-claims.js";
import * as settlementIntent from "./x402-settlement-intent.js";

type IntentParams = Parameters<typeof settlementIntent.openIntent>[1];
type SettlementPolicy =
  | { kind: "v1_do"; db: ReturnType<typeof getDb> }
  | {
      kind: "gateway";
      claimId: string | null;
      // Update the caller's finally policy at the same points as before,
      // including when the facilitator or a bookkeeping call throws.
      setReleaseClaim: (release: boolean) => void;
    };

/**
 * Settle only after the caller has executed and checked billability (DEC-14).
 * Route-specific responses and post-settle recording stay with the caller.
 */
export async function settleX402Execution(options: {
  verified: X402VerifiedPayment;
  paymentHash: string | null | undefined;
  intent: Omit<IntentParams, "paymentHash">;
  policy: SettlementPolicy;
}) {
  const { verified, paymentHash, policy } = options;
  // WP5: durable intent BEFORE the facilitator is called. That ordering is
  // the whole point — the orphan capture below is a catch block in this
  // process, so it handles "the INSERT threw" and cannot handle "the process
  // died", when it never runs either. A settlement is irreversible, so the
  // window between it succeeding and the row landing is the one place on the
  // platform where a crash costs a customer money with no record at all.
  // H7b-FINDING: v1_do has no pre-execution claim/replay guard. Preserve its
  // direct intent write; only the gateway locks and checks claim ownership.
  const intent = paymentHash
    ? policy.kind === "gateway"
      ? await openClaimedX402Intent(policy.claimId!, { paymentHash, ...options.intent })
      : await settlementIntent.openIntent(policy.db, { paymentHash, ...options.intent })
    : null;

  // A thrown facilitator call is ambiguous: never reopen its authorization.
  if (policy.kind === "gateway") policy.setReleaseClaim(false);
  const settled = await settleX402Payment(verified);
  if (policy.kind === "gateway" && !settled.valid && !settled.settlementUnknown) {
    policy.setReleaseClaim(true);
  }
  if (intent) {
    if (settled.valid && settled.settlementId) {
      await settlementIntent.markSettled(policy.kind === "v1_do" ? policy.db : getDb(), {
        intentId: intent.id,
        settlementId: settled.settlementId,
      });
    } else if (policy.kind === "v1_do" || !settled.settlementUnknown) {
      // H7b-FINDING: v1_do marks ambiguous outcomes failed; the gateway leaves
      // them settling for reconciliation. Preserve both policies in this refactor.
      await settlementIntent.markFailed(policy.kind === "v1_do" ? policy.db : getDb(), {
        intentId: intent.id,
        reason: settled.error ?? "settlement returned invalid",
      });
    }
  }
  return settled;
}
