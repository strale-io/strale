/**
 * Slim version of lifecycle-transition.ts that doesn't import src/app.js,
 * avoiding FRONTEND_URL/audit-token boot-time requirements when running
 * locally without the full server env.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { transitionCapability, type LifecycleState } from "../src/lib/lifecycle.js";

const VALID_STATES: LifecycleState[] = ["draft","validating","probation","active","degraded","suspended","deactivated"];

async function main() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  const toIdx = args.indexOf("--to");
  const reasonIdx = args.indexOf("--reason");
  if (slugIdx === -1 || toIdx === -1) {
    console.error("Usage: --slug <slug> --to <state> [--reason <text>]");
    process.exit(1);
  }
  const slug = args[slugIdx + 1];
  const toState = args[toIdx + 1] as LifecycleState;
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : "manual admin transition";
  if (!VALID_STATES.includes(toState)) { console.error("Invalid state"); process.exit(1); }
  await transitionCapability(slug, toState, reason, "admin");
  console.log("✅ " + slug + " → " + toState + " (reason: " + reason + ")");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
