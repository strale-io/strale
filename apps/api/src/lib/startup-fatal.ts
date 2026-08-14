/**
 * StartupFatalError — a fatal boot-time failure that must abort startup
 * AND reach the operator alert in index.ts's main().catch handler.
 *
 * Review finding on the 2026-07-02 incident fix: several startup guards
 * (executor health gate, schema validation, cost-class STRICT invariant)
 * called process.exit(1) directly, which bypassed the fatal-startup email
 * alert entirely — preserving the exact "service died silently" failure
 * mode the alert was built to close. Startup code must never exit
 * directly: throw this (or any error) and let main().catch own the
 * alert-then-exit sequence.
 *
 * `operatorGuidance` is a short, plain-language instruction block that
 * lands verbatim in the alert email. Write it for a non-technical
 * operator reading a phone at 2am: what happened, whether it will
 * self-heal, and the exact next action.
 */
export class StartupFatalError extends Error {
  readonly operatorGuidance: string;

  constructor(message: string, operatorGuidance: string) {
    super(message);
    this.name = "StartupFatalError";
    this.operatorGuidance = operatorGuidance;
  }
}
