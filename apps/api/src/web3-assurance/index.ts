/**
 * Web3 Assurance — public module surface.
 *
 * Importing this module auto-registers all evaluators. The route handler
 * and tests both import from here so registration is a side effect of
 * loading any consumer.
 */

import "./evaluators/existing-cap.js";
import "./evaluators/defillama-protocol.js";
import "./evaluators/sourcify.js";
import "./evaluators/mixer-graded.js";
import "./evaluators/scamsniffer.js";
import "./evaluators/eas-attestations.js";
import "./evaluators/erc-8004-reputation.js";
import "./evaluators/sister-rug.js";
import "./evaluators/web3-antivirus.js";
import "./evaluators/tenderly-simulation.js";
import "./evaluators/defillama-bridges.js";
import "./evaluators/rekt-database.js";
import "./evaluators/audit-firms.js";
import "./evaluators/bridge-config-risk.js";
import "./evaluators/cross-protocol-exposure.js";
import "./evaluators/wallet-velocity.js";
import "./evaluators/stablecoin-issuer.js";
import "./evaluators/bytecode-similarity.js";

export { compose, inferTargetType, inferChain } from "./composer.js";
export { computeVerdict } from "./verdict.js";
export { getEvaluators, getEvaluator } from "./evaluators/index.js";
export type {
  Web3AssuranceRequest,
  Web3AssuranceResponse,
  EvaluatorContext,
  EvaluatorResult,
  Evaluator,
  EvaluatorPriority,
  TargetType,
  Action,
  Verdict,
  Mode,
  SlaSpec,
} from "./types.js";
export type { VerdictResult } from "./verdict.js";
