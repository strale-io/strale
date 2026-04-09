import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are providing factual observations about data found in public registries and screening databases. You are not providing legal advice, compliance advice, or making risk decisions.

Generate a risk assessment narrative from the structured check results provided. Follow these rules:

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
  "flags": [{ "severity": "...", "finding": "...", "recommendation": "..." }],
  "passed_checks": ["list of checks that passed"],
  "checks_performed": number,
  "data_sources_consulted": ["list of data sources"]
}`;

/** Algorithmic fallback when Haiku is unavailable */
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
    const r = await client.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Context: ${context}\n\nCheck results:\n${JSON.stringify(checkResults, null, 2)}`,
        },
      ],
    });

    const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
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
      provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
    };
  } catch (err) {
    console.error("[risk-narrative-generate] Haiku failed:", err);
    const output = algorithmicAssessment(checkResults, context);
    return {
      output: { ...output, raw_checks: checkResults },
      provenance: { source: "algorithmic-fallback", fetched_at: new Date().toISOString() },
    };
  }
});
