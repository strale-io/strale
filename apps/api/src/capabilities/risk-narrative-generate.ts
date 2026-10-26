import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonObject } from "./lib/llm-json.js";
import { logError, logWarn } from "../lib/log.js";
import { MODELS, promptDigest } from "../lib/models.js";

// Cert-audit Y-10 — model pinning for replay determinism.
// `claude-sonnet-4-6` is a moving alias; the same check_results passed
// across an alias-version bump will produce different narratives. For
// compliance evidence we want "given inputs X, produce output Y" to be
// reproducible.
//
// Status as of 2026-04-30: Anthropic's GET /v1/models endpoint only
// publishes the alias for Sonnet 4.6 — no dated snapshot
// ("claude-sonnet-4-6-YYYYMMDD") is available yet. (Sonnet 4 and 4.5
// DO have dated snapshots; 4.6 doesn't.) Setting RISK_NARRATIVE_MODEL
// to a fabricated snapshot would 404 on every call and break the
// capability immediately. So PINNED_MODEL stays on the alias and we
// rely on provenance.model_resolved (captured below) to identify the
// snapshot Anthropic actually resolved to per call.
//
// When Anthropic publishes a dated snapshot for 4.6, set
// RISK_NARRATIVE_MODEL on Railway to that snapshot ID — the env
// override below is wired and will pin it. Run scripts/diag-risk-
// narrative-model.ts to find the resolved snapshot from recent prod
// calls before pinning.
const DEFAULT_MODEL = MODELS.capability_reasoning.id;
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

/** Only known lifecycle findings bypass synthesis. Raw registry words and
 * unknown/pending values keep the pre-existing narrative behaviour.
 * References below are executor mappings, not a universal status vocabulary. */
const NON_ACTIVE_REGISTRY_STATUSES: Readonly<Record<string, readonly string[]>> = {
  // norwegian-company-data.ts:120-124
  "norwegian-company-data": ["deleted", "bankrupt", "compulsory_dissolution", "dissolving"],
  // polish-company-data.ts:117-119
  "polish-company-data": ["deregistered"],
  // cz-company-data.ts:210-220
  "cz-company-data": ["dissolved", "insolvency", "liquidation"],
  // finnish-company-data.ts:214-219 (pending/unknown are not distress findings).
  "finnish-company-data": ["inactive", "bankrupt", "liquidation", "restructuring"],
  // greek-company-data.ts:160-165
  "greek-company-data": ["inactive", "bankrupt", "liquidation", "dissolved"],
  // danish-company-data.ts:111
  "danish-company-data": ["ceased"],
  // french-company-data.ts:64
  "french-company-data": ["closed"],
  // german-company-data.ts:304-308
  "german-company-data": ["terminated"],
  // swedish-company-data.ts:183-189
  "swedish-company-data": ["deregistered"],
  // uk-company-data.ts:149-160 (values after statusMap, not upstream keys).
  "uk-company-data": ["dissolved", "in_liquidation", "receivership", "closed", "voluntary_arrangement", "insolvency", "administration"],
  // estonian-company-data.ts:222-227
  "estonian-company-data": ["in_liquidation", "deleted", "in_bankruptcy"],
  // lithuanian-company-data.ts:231 (other classifier labels pass through).
  "lithuanian-company-data": ["Išregistruotas"],
  // irish-company-data.ts:187 passes CRO status through; Dissolved is recorded
  // in irish-company-data.test.ts:21-22, alongside the live Normal fixture.
  "irish-company-data": ["Dissolved"],
  // latvian-company-data.ts:227-230
  "latvian-company-data": ["Likvidēts", "Slēgts"],
  // croatian-company-data.ts:92-95
  "croatian-company-data": ["inactive"],
  // slovak-company-data.ts:147-152
  "slovak-company-data": ["inactive"],
  // austrian-company-data.ts:465
  "austrian-company-data": ["dissolved"],
  // spanish-company-data.ts:237-243
  "spanish-company-data": ["inactive"],
  // belgian-company-data.ts:120,178-180 (vendor status / canonical alias).
  "belgian-company-data": ["inactive"],
  // These executors delegate to lib/openapi-resolver.ts:304-315, which maps
  // inactive/dissolved/ceased/terminated upstream values to inactive.
  // bulgarian-company-data.ts:49
  "bulgarian-company-data": ["inactive"],
  // cypriot-company-data.ts:153
  "cypriot-company-data": ["inactive"],
  // dutch-company-data.ts:44
  "dutch-company-data": ["inactive"],
  // hungarian-company-data.ts:43
  "hungarian-company-data": ["inactive"],
  // italian-company-data.ts:70
  "italian-company-data": ["inactive"],
  // luxembourgish-company-data.ts:44
  "luxembourgish-company-data": ["inactive"],
  // maltese-company-data.ts:43
  "maltese-company-data": ["inactive"],
  // portuguese-company-data.ts:52
  "portuguese-company-data": ["inactive"],
  // romanian-company-data.ts:45
  "romanian-company-data": ["inactive"],
  // australian-company-data.ts:34 and japanese-company-data.ts:33 delegate to
  // lib/browserless-extract.ts:66's explicit extraction vocabulary.
  "australian-company-data": ["inactive", "dissolved"],
  "japanese-company-data": ["inactive", "dissolved"],
  // No known non-active vocabulary in singapore-company-data.ts:139,
  // au-company-data.ts:138, brazilian-company-data.ts:55,
  // canadian-company-data.ts:148 or providers/swiss-company-data.ts:83.
  // slovenian-company-data.ts:144-156 has no status output at all.
};

function registryNeedsReview(checkName: string, result: any): boolean {
  if (checkName === "no-bankruptcy-check") return result?.has_any_distress_signal === true || result?.is_deleted === true;
  return Object.hasOwn(NON_ACTIVE_REGISTRY_STATUSES, checkName) && typeof result?.status === "string" &&
    (NON_ACTIVE_REGISTRY_STATUSES[checkName]?.includes(result.status) ?? false);
}

/** Algorithmic fallback when Sonnet is unavailable */
function algorithmicAssessment(
  checkResults: Record<string, any>,
  context: string,
): Record<string, unknown> {
  const checks = Object.entries(checkResults);
  const passed: string[] = [];
  const failed: string[] = [];
  const flags: Array<{ severity: string; finding: string; recommendation: string; source_check?: string }> = [];

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
        source_check: checkName,
        severity: "medium",
        finding: `${checkName.replace(/-/g, " ")} could not be completed`,
        recommendation: result?.skipped
          ? "This check was skipped because required inputs were not available. Provide additional data to enable this check."
          : "Review the error and retry. Manual verification may be needed.",
      });
    } else if (registryNeedsReview(checkName, result)) {
      failed.push(checkName.replace(/-/g, " "));
      flags.push({
        source_check: checkName,
        severity: "high",
        finding: `${checkName} reports registry status ${result.status ?? (result.is_deleted ? "deleted" : "distress signal")}`,
        recommendation: "Review the official registry record before proceeding; this result does not establish an active company.",
      });
    } else if (isSanctioned) {
      failed.push(checkName.replace(/-/g, " "));
      flags.push({
        source_check: checkName,
        severity: "critical",
        finding: `Sanctions screening returned a positive match`,
        recommendation: "Do not proceed without compliance review. Verify the match against official sanctions lists.",
      });
    } else if (isPep) {
      // PEP is a flag, not necessarily a failure
      passed.push(checkName.replace(/-/g, " "));
      flags.push({
        source_check: checkName,
        severity: "medium",
        finding: `Politically Exposed Person (PEP) match detected`,
        recommendation: "Enhanced due diligence may be required under AML regulations.",
      });
    } else if (isInvalid) {
      failed.push(checkName.replace(/-/g, " "));
      flags.push({
        source_check: checkName,
        severity: "high",
        finding: `${checkName.replace(/-/g, " ")} validation failed`,
        recommendation: "Verify the input data is correct and retry.",
      });
    } else if (isHighRisk) {
      passed.push(checkName.replace(/-/g, " "));
      flags.push({
        source_check: checkName,
        severity: result?.risk_level === "critical" ? "high" : "medium",
        finding: `${checkName.replace(/-/g, " ")} flagged elevated risk`,
        recommendation: "Review the detailed findings before proceeding.",
      });
    } else if (hasData) {
      passed.push(checkName.replace(/-/g, " "));
    } else {
      failed.push(checkName.replace(/-/g, " "));
      flags.push({
        source_check: checkName,
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

  if (checks.some(([name, result]) => registryNeedsReview(name, result))) {
    // A populated dead-company record is an answer, not a passed KYB check.
    if (riskScore < 75) { riskLevel = "high"; riskScore = 75; }
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
    data_sources_consulted: checks.map(([name]) => name),
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
  const preserveRegistryStatus = Object.entries(checkResults).some(([name, result]) => registryNeedsReview(name, result));
  if (!apiKey || preserveRegistryStatus) {
    // Preserve registry lifecycle findings deterministically, including when
    // AI synthesis is available; do not let a model turn them into a pass.
    const output = algorithmicAssessment(checkResults, context);
    return {
      output: {
        ...output,
        ...(preserveRegistryStatus ? { note: "Registry lifecycle findings preserved by deterministic assessment" } : {}),
        raw_checks: checkResults,
      },
      provenance: {
        source: "algorithmic-fallback",
        fallback_reason: preserveRegistryStatus ? "registry_status_preservation" : "missing_ai_credential",
        fetched_at: new Date().toISOString(),
      },
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

    const responseText = r.content[0]?.type === "text" ? r.content[0].text.trim() : "";

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

    // Real brace-matching, not the greedy object-capture regex: on this
    // capability (DEC-20260428-B citation bar) an over-capture that happens
    // to parse would produce a semantically wrong narrative rather than a
    // crash, which is worse. extractJsonObject returns null on anything
    // unbalanced, which drops us into the algorithmic fallback below.
    const parsed = extractJsonObject(responseText) as Record<string, any> | null;

    if (!parsed) {
      const output = algorithmicAssessment(checkResults, context);
      return {
        output: { ...output, raw_checks: checkResults },
        provenance: { source: "algorithmic-fallback", fetched_at: new Date().toISOString() },
      };
    }

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
        prompt_sha256: promptDigest(SYSTEM_PROMPT),
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
