// Use-case pages, resolved against the catalogue: tools that are not visible
// are dropped with their cost, the run's price is summed from live prices, and
// the bundled check is the live one for the use case's country, if any.
import type { SiteData } from "./types.ts";
import { toolBySlug, type Tool } from "./site-data.ts";
import { bundlesByCountry, type BundleEntry } from "./company-data.ts";
import { USE_CASES, type UseCase } from "../content/use-cases.ts";

export interface ResolvedStep { tool: Tool; role: string; calls: number }

export interface ResolvedUseCase extends Omit<UseCase, "steps" | "bundle" | "sketch"> {
  steps: ResolvedStep[];
  /** Tools in the example run (calls > 0). */
  run: ResolvedStep[];
  /** With an API key. Free tools are not charged to the wallet (apps/api/src/routes/do.ts, executeFreeTierAuthenticated). */
  runCents: number;
  /** The same run paid over x402, when every paid tool in it is eligible. Free tools are sold over x402 too and are counted when listed there. */
  runUsd: number | null;
  /** Free tools in the run that are not on x402: called without a key, within the daily limit, and not in runUsd. */
  freeOffX402: ResolvedStep[];
  bundle: (BundleEntry & { note: string }) | null;
  /** Null when a tool the sketch calls is not visible in this build's catalogue. */
  sketch: string | null;
  /** A tool in the run produces a screening signal or a risk summary (manifest gdpr_art_22_classification). */
  decisionSupport: boolean;
}

const DECISION = new Set(["screening_signal", "risk_synthesis"]);

export function resolveUseCase(d: SiteData, uc: UseCase): ResolvedUseCase {
  const bySlug = toolBySlug(d);
  const steps = uc.steps.flatMap((s) => {
    const tool = bySlug.get(s.slug);
    return tool ? [{ tool, role: s.role, calls: s.calls }] : [];
  });
  if (!steps.some((s) => s.calls > 0)) throw new Error(`Use case ${uc.slug}: no tool in its example run is visible in the catalogue`);
  const run = steps.filter((s) => s.calls > 0);
  const runCents = run.reduce((n, s) => n + s.calls * chargedCents(s.tool), 0);
  // Over x402 every listed tool is paid, free-tier ones included (x402-gateway-v2.ts never serves an x402 caller free).
  // A free tool that is not listed can still be called without a key; a paid one that is not listed rules x402 out.
  const freeOffX402 = run.filter((s) => s.tool.free && !s.tool.x402);
  const runUsd = run.every((s) => s.tool.x402 || s.tool.free) ? run.reduce((n, s) => n + s.calls * (s.tool.x402?.price_usd ?? 0), 0) : null;
  const iso = uc.bundle ? (uc.bundle.country === "uk" ? "GB" : uc.bundle.country.toUpperCase()) : null;
  const entry = iso ? bundlesByCountry(d).get(iso)?.find((b) => b.kind === uc.bundle!.kind) ?? null : null;
  const decisionSupport = run.some((s) => DECISION.has(d.manifests.get(s.tool.slug)?.gdpr_art_22_classification ?? ""));
  if (decisionSupport && !uc.human) throw new Error(`Use case ${uc.slug} runs a screening or risk-summary tool and must say where a person stays in the loop`);
  const price = (slug: string) => Math.max(bySlug.get(slug)?.price_cents ?? 0, 1);
  const code = uc.sketch(price);
  const sketch = sketchSlugs(code).every((s) => bySlug.has(s)) ? code : null;
  const { steps: _s, bundle: _b, sketch: _k, ...rest } = uc;
  return { ...rest, steps, run, runCents, runUsd, bundle: entry && uc.bundle ? { ...entry, note: uc.bundle.note } : null, freeOffX402, sketch, decisionSupport };
}

export function useCases(d: SiteData): ResolvedUseCase[] {
  return USE_CASES.map((uc) => resolveUseCase(d, uc));
}

/** The tools a sketch calls. */
export function sketchSlugs(code: string): string[] {
  return [...code.matchAll(/capability_slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
}

/** What one API-key call is charged: nothing for a free tool, else the listed price. */
export function chargedCents(t: Tool): number {
  return t.free ? 0 : t.price_cents;
}
