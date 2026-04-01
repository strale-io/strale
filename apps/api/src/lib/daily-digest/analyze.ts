import Anthropic from "@anthropic-ai/sdk";
import type { DigestData } from "./types.js";

export interface DigestAnalysis {
  situationAssessment: string;
  shipLogSummary: string;
  recommendedActions: Array<{
    action: string;
    why: string;
    link: string | null;
    impact: "high" | "medium";
  }>;
  anomalies: string[];
  bottleneck: string | null;
}

const FALLBACK: DigestAnalysis = {
  situationAssessment: "AI analysis unavailable — review raw data below.",
  shipLogSummary: "",
  recommendedActions: [],
  anomalies: [],
  bottleneck: null,
};

function buildPrompt(data: DigestData): string {
  const pa = data.platformActivity;
  const ph = data.platformHealth;
  const sl = data.shipLog;
  const ba = data.beaconActivity;
  const eco = data.ecosystem;
  const sb = data.scoreboard;

  return `You are the daily operations advisor for Strale, a B2B capability marketplace for AI agents.

CONTEXT ABOUT STRALE:
- Solo founder (Petter), pre-revenue, in distribution-focused phase
- ${sb.totalCapabilities} active capabilities, ${sb.totalSolutions} solutions, ~1,500 test suites
- Key growth levers: LLM recommendation layer (framework PRs), Beacon (supply-side growth engine), direct outreach to Nordic fintech
- Revenue model: pay-per-call API. Current focus is user acquisition, not monetization.
- Website: strale.dev (on Lovable). Beacon: scan.strale.io (on Vercel). API: api.strale.io (on Railway).

PLATFORM ACTIVITY (last 24h):
- New signups: ${pa.signups.count} (delta: ${pa.signups.delta})${pa.signups.emails.length > 0 ? ` — ${pa.signups.emails.join(", ")}` : ""}
- API calls: ${pa.apiCalls.total} (delta: ${pa.apiCalls.delta})
- Unique active users: ${pa.uniqueUsers.count}
- Transactions: ${pa.transactions.count}
- Revenue: EUR ${(pa.revenue.cents / 100).toFixed(2)}
- Top capabilities used: ${JSON.stringify(pa.apiCalls.byCapability.slice(0, 5))}
${pa.zeroActivity ? "WARNING: ZERO ACTIVITY in the last 24 hours." : ""}

PLATFORM HEALTH:
- Circuit breakers open: ${ph.circuitBreakers.length > 0 ? JSON.stringify(ph.circuitBreakers) : "None (all healthy)"}
- Test pass rate (24h): ${ph.testPassRate.rate}% (${ph.testPassRate.passed}/${ph.testPassRate.total})
- SQS grade changes: ${ph.sqsChanges.length > 0 ? JSON.stringify(ph.sqsChanges) : "None"}

YESTERDAY'S WORK (from Notion Journal + GitHub commits):
- Journal entries: ${JSON.stringify(sl.journalEntries.map((e) => ({ title: e.title, type: e.type })))}
- GitHub commits: ${JSON.stringify(sl.githubCommits.map((c) => ({ repo: c.repo, message: c.message })))}
- Social posts: ${JSON.stringify(sl.socialPosts.map((p) => ({ title: p.title, platform: p.platform })))}

BEACON:
- Scans (24h): ${ba.scansLast24h}
- Domains scanned: ${JSON.stringify(ba.scanDomains)}
- New subscribers: ${ba.newSubscribers}
- Total scans all-time: ${ba.totalScans}

ECOSYSTEM:
- GitHub repos: ${JSON.stringify(eco.repos.map((r) => ({ name: r.name, stars: r.stars, delta: r.starsDelta, openPRs: r.openPRs })))}
- npm downloads/week: ${JSON.stringify(eco.npmDownloads)}
- PyPI downloads/week: ${JSON.stringify(eco.pypiDownloads)}

DISTRIBUTION SURFACES WITH PENDING PRs:
${JSON.stringify(data.distributionSurfaces.filter((s) => s.daysPending && s.daysPending > 3), null, 2)}

UNREVIEWED DECISIONS: ${data.priorities.unreviewedDecisions.length}
ACTION-REQUIRED ITEMS: ${data.priorities.actionRequired.length}

SCOREBOARD:
- Capabilities: ${sb.totalCapabilities}
- Solutions: ${sb.totalSolutions}
- Users: ${sb.totalUsers}
- Total API calls: ${sb.totalApiCalls}
- Total Beacon scans: ${sb.totalBeaconScans}

Based on all of the above, provide your analysis as JSON:

{
  "situation_assessment": "3-5 sentences. Lead with the most important signal. Be direct — if nothing happened, say so. Connect dots across data points. Mention specific numbers.",
  "ship_log_summary": "2-3 sentences summarizing what was built/shipped/posted yesterday. If nothing, say 'No recorded activity yesterday.' Be specific about what was done.",
  "recommended_actions": [
    {
      "action": "specific action to take today",
      "why": "why this matters right now, grounded in the data above",
      "link": "direct URL if applicable, or null",
      "impact": "high or medium"
    }
  ],
  "anomalies": ["anything unusual — spikes, drops, failures, unexpected patterns"],
  "bottleneck": "the single biggest thing limiting Strale's growth right now, or null if unclear"
}

Return 3 recommended actions maximum, ranked by impact. Be specific — 'ping PR #4866' not 'follow up on PRs'. Ground every recommendation in actual data from above. No generic advice.

Return ONLY valid JSON, no markdown fences.`;
}

export async function analyzeDigest(data: DigestData): Promise<DigestAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[digest-analyze] ANTHROPIC_API_KEY not set — skipping analysis");
    return FALLBACK;
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: buildPrompt(data) }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    return {
      situationAssessment: (parsed.situation_assessment as string) ?? FALLBACK.situationAssessment,
      shipLogSummary: (parsed.ship_log_summary as string) ?? "",
      recommendedActions: ((parsed.recommended_actions as any[]) ?? []).map((a) => ({
        action: a.action ?? "",
        why: a.why ?? "",
        link: a.link ?? null,
        impact: a.impact === "high" ? "high" : "medium",
      })),
      anomalies: (parsed.anomalies as string[]) ?? [],
      bottleneck: (parsed.bottleneck as string) ?? null,
    };
  } catch (err) {
    console.error("[digest-analyze] Failed:", err instanceof Error ? err.message : err);
    return FALLBACK;
  }
}
