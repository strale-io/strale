import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { logError, logWarn } from "../lib/log.js";

// Cert-audit Y-10 — model pinning for replay determinism.
// `claude-sonnet-4-6` is a moving alias; the same check_results passed
// across an alias-version bump will produce different narratives. For
// compliance evidence we want "given inputs X, produce output Y" to be
// reproducible.
//
// The default below is the alias for ergonomics; production should
// override with a dated snapshot via RISK_NARRATIVE_MODEL env var
// (e.g. "claude-sonnet-4-6-20260317"). Either way, the actual model
// version returned by the API is captured in provenance.model_resolved
// so audit replay can identify the exact snapshot that produced the
// stored output.
const DEFAULT_MODEL = "claude-sonnet-4-6";
const PINNED_MODEL = process.env.RISK_NARRATIVE_MODEL ?? DEFAULT_MODEL;

// Cert-audit Y-10 — wording-rule enforcement. The system prompt
// enumerates phrases the LLM must never use ("This company is clean",
// "you must reject this", etc.) but Anthropic doesn't enforce prompt
// rules — it interprets them. If the model violates a wording rule,
// the resulting narrative could create defamation or absolute-claim
// liability. This regex post-check fires the algorithmic fallback
// when the LLM output trips a prohibited phrase.
//
// Rules mirror the WORDING RULES block in SYSTEM_PROMPT — keep them
// in sync. Each entry is the prohibited shape; the wording rule
// itself shows the safe alternative the LLM should produce instead.
const PROHIBITED_PHRASES: RegExp[] = [
  /\b(?:this\s+(?:company|entity|invoice|payment)\s+is\s+)(?:clean|safe|trustworthy|legitimate|compliant|fraud|scam|fraudulent)\b/i,
  /\b(?:safe|risky|dangerous)\s+to\s+(?:pay|accept|approve|trust|proceed)\b/i,
  /\byou\s+(?:must|should|need\s+to)\s+(?:reject|decline|approve|trust|accept|block)\b/i,
  /\bthis\s+is\s+(?:a\s+)?(?:scam|fraud|fraudulent)\b/i,
  /\bPEP\s*=\s*(?:high|extreme|critical)\s+risk\b/i,
];

const SYSTEM_PROMPT = `You are providing factual observations about data found in public registries and screening databases. You are not providing legal advice, compliance advice, or making risk decisions.

Generate a risk assessment narrative from the structured check results provided. Follow these rules:

CITATION RULES (per DEC-20260428-B engineering bar — non-negotiable):
- Every flag must reference the specific check_results source that produced it (e.g., "from sanctions-check", "from domain-age-check"). Use the source_check field on each flag.
- Never assert a fact that is not present in the structured check_results input. If the data does not say it, you do not say it.
- Frame as "screening checks found" not "X did Y". You are summarising what the data shows, not making a finding about a person or entity.

LANGUAGE RULES:
- Never use technical terms without explanation ("MX records" → "email server configuration")
- Never use acronyms without spelling them out first
- Frame findings as observations, not accusations
- Always include context for why something matters
- Every flag must be written in plain language with an actionable recommendation

SEVERITY MAPPING:
- Critical (do not proceed): Company doesn't exist in registry, company is sanctioned, VAT belongs to different company
- High (investigate before proceeding): Domain < 30 days old, adverse media for fraud, IBAN country ≠ company country
- Medium (note for review): PEP connection, email on free provider, invoice math errors, no SSL
- Low (informational): Domain < 1 year old, no LEI found, minor formatting issues

WORDING RULES (NEVER violate these):
- Never say "This company is clean/safe" → say "No risk indicators found in the sources consulted"
- Never say "This invoice is safe to pay" → say "All automated checks passed"
- Never say "This is a scam/fraud" → say "Multiple risk indicators were detected"
- Never say "You must/should reject this" → say "Manual review is recommended before proceeding"
- Never say "This company is compliant" → say "No compliance issues identified in the sources checked"
- Never say "PEP = high risk" → say "Enhanced due diligence may be required under AML regulations"

CONTEXT-AWARE OUTPUT:
- If context is "kyb": explain compliance implications, focus on entity verification and regulatory exposure
- If context is "invoice_fraud": explain fraud risk signals, focus on payment safety and sender legitimacy

Always list passed checks too — this builds trust and provides full context.

Respond ONLY with valid JSON matching this schema:
{
  "risk_level": "none|low|medium|high|critical",
  "risk_score": 0-100,
  "summary": "2-3 sentence overview",
  "flags": [{ "severity": "...", "finding": "...", "recommendation": "...", "source_check": "name of the check_results key that produced this finding" }],
  "passed_checks": ["list of checks that passed"],
  "checks_performed": number,
  "data_sources_consulted": ["list of data sources"]
}`;

/** Algorithmic fallback when Sonnet is unavailable */
function algorithmicAssessment(
  checkResults: Record<string, any>,
  context: string,
): Record<string, unknown> {
  const checks = Object.entries(checkResults);
  const passed: string[] = [];
  const failed: string[] = [];
  const flags: Array<{ severity: string; finding: string; recommendation: string }> = [];

  for (const [checkName, result] of checks) {
    // Determine pass/fail from the step result shape:
    // - Explicit error or skipped → failed
    // - is_sanctioned: true → failed (sanctions hit)
    // - is_pep: true → flagged (PEP match)
    // - valid: false → failed (validation failure)
    // - risk_level: "high" or "critical" → flagged
    // - Has real data (company_name, etc.) → passed
    // - Empty/null result → failed
    const isError = result?.error || result?.skipped;
    const isSanctioned = result?.is_sanctioned === true;
    const isPep = result?.is_pep === true;
    const isInvalid = result?.valid === false;
    const isHighRisk = result?.risk_level === "high" || result?.risk_level === "critical";
    const hasData = result && typeof result === "object" && !isError && Object.keys(result).length > 0;

    if (isError) {
      failed.push(checkName.replace(/-/g, " "));
      flags.push({
        severity: "medium",
        finding: `${checkName.replace(/-/g, " ")} could not be completed`,
        recommendation: result?.skipped
          ? "This check was skipped because required inputs were not available. Provide additional data to enable this check."
          : "Review the error and retry. Manual verification may be needed.",
      });
    } else if (isSanctioned) {
      failed.push(checkName.replace(/-/g, " "));
      flags.push({
        severity: "critical",
        finding: `Sanctions screening returned a positive match`,
        recommendation: "Do not proceed without compliance review. Verify the match against official sanctions lists.",
      });
    } else if (isPep) {
      // PEP is a flag, not necessarily a failure
      passed.push(checkName.replace(/-/g, " "));
      flags.push({
        severity: "medium",
        finding: `Politically Exposed Person (PEP) match detected`,
        recommendation: "Enhanced due diligence may be required under AML regulations.",
      });
    } else if (isInvalid) {
      failed.push(checkName.replace(/-/g, " "));
      flags.push({
        severity: "high",
        finding: `${checkName.replace(/-/g, " ")} validation failed`,
        recommendation: "Verify the input data is correct and retry.",
      });
    } else if (isHighRisk) {
      passed.push(checkName.replace(/-/g, " "));
      flags.push({
        severity: result?.risk_level === "critical" ? "high" : "medium",
        finding: `${checkName.replace(/-/g, " ")} flagged elevated risk`,
        recommendation: "Review the detailed findings before proceeding.",
      });
    } else if (hasData) {
      passed.push(checkName.replace(/-/g, " "));
    } else {
      failed.push(checkName.replace(/-/g, " "));
      flags.push({
        severity: "low",
        finding: `${checkName.replace(/-/g, " ")} returned no data`,
        recommendation: "This may indicate a data gap. Consider manual verification.",
      });
    }
  }

  let riskLevel: string;
  let riskScore: number;
  if (failed.length === 0) {
    riskLevel = "none";
    riskScore = 0;
  } else if (failed.length <= 1) {
    riskLevel = "low";
    riskScore = 25;
  } else if (failed.length <= 2) {
    riskLevel = "medium";
    riskScore = 50;
  } else if (failed.length <= 3) {
    riskLevel = "high";
    riskScore = 75;
  } else {
    riskLevel = "critical";
    riskScore = 90;
  }

  const contextLabel = context === "kyb" ? "entity verification" : "invoice fraud detection";
  const summary =
    failed.length === 0
      ? `All ${checks.length} automated checks passed for ${contextLabel}. No risk indicators found in the sources consulted.`
      : `${failed.length} of ${checks.length} checks flagged issues during ${contextLabel}. Manual review is recommended before proceeding.`;

  return {
    risk_level: riskLevel,
    risk_score: riskScore,
    summary,
    flags,
    passed_checks: passed,
    checks_performed: checks.length,
    data_sources_consulted: ["algorithmic assessment"],
    note: "AI narrative was unavailable — algorithmic fallback used",
  };
}

registerCapability("risk-narrative-generate", async (input: CapabilityInput) => {
  const checkResults = input.check_results as Record<string, any> | undefined;
  if (!checkResults || typeof checkResults !== "object" || Object.keys(checkResults).length === 0) {
    throw new Error("'check_results' is required and must be a non-empty object.");
  }

  const context = ((input.context as string) ?? "").trim();
  if (!context || (context !== "kyb" && context !== "invoice_fraud")) {
    throw new Error("'context' is required and must be 'kyb' or 'invoice_fraud'.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback to algorithmic assessment
    const output = algorithmicAssessment(checkResults, context);
    return {
      output: { ...output, raw_checks: checkResults },
      provenance: { source: "algorithmic-fallback", fetched_at: new Date().toISOString() },
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    // Sonnet 4.6 for risk-narrative synthesis: judgment-heavy, false-positive cost
    // is high, defamation risk if synthesis is sloppy. Per chat 2026-04-28 + DEC-20260428-B.
    // Effective cost goes from ~EUR 0.05–0.08 to ~EUR 0.15–0.25 per call (3x), still well
    // within the leg's price envelope. Haiku stays for simple extraction tasks elsewhere.
    const r = await client.messages.create({
      model: PINNED_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Context: ${context}\n\nCheck results:\n${JSON.stringify(checkResults, null, 2)}`,
        },
      ],
    });

    const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";

    // Cert-audit Y-10: regex-check the raw LLM output for prohibited
    // wording before parsing. If the model violated a wording rule
    // from the system prompt (these create defamation / absolute-claim
    // liability), abandon the LLM output and fall back to the
    // algorithmic assessment. This is the "automated enforcement" the
    // manifest's known-limitation block flagged as missing.
    for (const pattern of PROHIBITED_PHRASES) {
      if (pattern.test(responseText)) {
        logWarn(
          "risk-narrative-prohibited-phrase",
          "LLM output tripped a prohibited-phrase rule; falling back to algorithmic assessment",
          { pattern: pattern.source, model: r.model },
        );
        const output = algorithmicAssessment(checkResults, context);
        return {
          output: { ...output, raw_checks: checkResults },
          provenance: {
            source: "algorithmic-fallback",
            fallback_reason: "llm_wording_rule_violation",
            fetched_at: new Date().toISOString(),
          },
        };
      }
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      const output = algorithmicAssessment(checkResults, context);
      return {
        output: { ...output, raw_checks: checkResults },
        provenance: { source: "algorithmic-fallback", fetched_at: new Date().toISOString() },
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate risk_level
    const validLevels = ["none", "low", "medium", "high", "critical"];
    if (!validLevels.includes(parsed.risk_level)) {
      parsed.risk_level = "medium";
    }

    // Clamp risk_score
    if (typeof parsed.risk_score !== "number" || parsed.risk_score < 0 || parsed.risk_score > 100) {
      parsed.risk_score = 50;
    }

    return {
      output: {
        risk_level: parsed.risk_level,
        risk_score: parsed.risk_score,
        summary: parsed.summary ?? "Assessment generated.",
        flags: parsed.flags ?? [],
        passed_checks: parsed.passed_checks ?? [],
        checks_performed: parsed.checks_performed ?? Object.keys(checkResults).length,
        data_sources_consulted: parsed.data_sources_consulted ?? [],
        raw_checks: checkResults,
      },
      // Cert-audit Y-10: include the actual model version returned by
      // Anthropic so audit replay can identify the snapshot that
      // produced this narrative. PINNED_MODEL is what we asked for;
      // r.model is what we got (Anthropic's resolution of the alias
      // or, if RISK_NARRATIVE_MODEL is set, the literal pinned id).
      provenance: {
        source: "claude-sonnet",
        model_requested: PINNED_MODEL,
        model_resolved: r.model,
        fetched_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    logError("risk-narrative-generate-sonnet-failed", err);
    const output = algorithmicAssessment(checkResults, context);
    return {
      output: { ...output, raw_checks: checkResults },
      provenance: { source: "algorithmic-fallback", fetched_at: new Date().toISOString() },
    };
  }
});
