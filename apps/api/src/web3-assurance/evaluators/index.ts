/**
 * Web3 Assurance — evaluator registry.
 *
 * Each evaluator is a self-contained module that returns one evidence section
 * of the final answer. The composer fans them out in parallel and reconciles.
 *
 * Evaluators come in two flavors:
 *   1. wrappers around existing Strale capabilities (wallet-risk-score,
 *      wallet-age-check, wallet-transactions-lookup, token-security-check,
 *      contract-verify-check, approval-security-check)
 *   2. new modules built specifically for Web3 Assurance (DefiLlama, Sourcify,
 *      mixer-graded classifier, Tenderly simulation, EAS, ERC-8004, sister-rug,
 *      ScamSniffer, Web3 Antivirus, REKT, audit-firm aggregation)
 *
 * Sanctions evaluation is delegated to the Counterparty Assurance sanctions substrate
 * via the existing sanctions-check capability — not duplicated here.
 */

import type { Evaluator } from "../types.js";

const evaluators: Evaluator[] = [];

export function registerEvaluator(evaluator: Evaluator): void {
  if (evaluators.find((e) => e.name === evaluator.name)) {
    throw new Error(`Evaluator '${evaluator.name}' already registered.`);
  }
  evaluators.push(evaluator);
}

export function getEvaluators(): readonly Evaluator[] {
  return evaluators;
}

export function getEvaluator(name: string): Evaluator | undefined {
  return evaluators.find((e) => e.name === name);
}
