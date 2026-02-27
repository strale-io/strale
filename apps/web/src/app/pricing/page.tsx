import type { Metadata } from "next";
import Link from "next/link";
import { getCapabilities, formatPrice } from "@/lib/api";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Transparent per-call pricing. No subscriptions, no monthly minimums. Pay only for what your agent uses.",
};

export const revalidate = 3600;

const SHOWCASE_SLUGS = [
  "vat-validate",
  "iban-validate",
  "web-extract",
  "swedish-company-data",
  "invoice-extract",
  "annual-report-extract",
];

export default async function PricingPage() {
  const capabilities = await getCapabilities();
  const showcase = SHOWCASE_SLUGS.map((slug) =>
    capabilities.find((c) => c.slug === slug)
  ).filter(Boolean);

  const prices = capabilities.map((c) => c.price_cents);
  const minPrice = formatPrice(Math.min(...prices));
  const maxPrice = formatPrice(Math.max(...prices));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      {/* Hero */}
      <div className="mb-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Every capability has a price.
          <br />
          You see it before you call it.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          {minPrice}&ndash;{maxPrice} per call. No subscriptions. No monthly minimums.
          No hidden fees. Your agent pays only for what it uses.
        </p>
      </div>

      {/* How the wallet works */}
      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">
          How it works
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-6">
            <span className="font-mono text-sm text-accent">01</span>
            <h3 className="mt-2 font-semibold">Get free credits</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Sign up and get &euro;2.00 in trial credits immediately. No credit card required.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6">
            <span className="font-mono text-sm text-accent">02</span>
            <h3 className="mt-2 font-semibold">Top up your wallet</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Add funds any time via Stripe Checkout. Top up any amount. Funds never expire.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6">
            <span className="font-mono text-sm text-accent">03</span>
            <h3 className="mt-2 font-semibold">Pay per call</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Each capability has a fixed price. Deducted from your wallet on success only.
            </p>
          </div>
        </div>
      </section>

      {/* Price examples */}
      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">
          Example prices
        </h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-5 py-3 text-left font-medium text-muted">
                  Capability
                </th>
                <th className="px-5 py-3 text-right font-medium text-muted">
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {showcase.map((cap) =>
                cap ? (
                  <tr key={cap.slug} className="border-b border-border/50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/capabilities/${cap.slug}`}
                        className="font-medium hover:text-accent"
                      >
                        {cap.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {cap.description.slice(0, 80)}
                        {cap.description.length > 80 ? "..." : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-accent">
                      {formatPrice(cap.price_cents)}
                    </td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-sm text-muted">
          <Link href="/capabilities" className="text-accent hover:underline">
            Browse all {capabilities.length} capabilities
          </Link>{" "}
          to see every price.
        </p>
      </section>

      {/* Comparison */}
      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">
          How Strale compares
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-semibold">
              vs. Enterprise data providers
            </h3>
            <p className="mt-1 text-xs text-muted">Bureau van Dijk, D&amp;B</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Same company data across 27 countries. Pay &euro;0.02&ndash;&euro;1.00 per call
              instead of &euro;10K+/year subscriptions. No sales calls, no contracts.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-semibold">vs. Building it yourself</h3>
            <p className="mt-1 text-xs text-muted">Custom integrations</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Country-specific integrations across 27 markets, maintained and
              monitored for you. Skip months of API research and edge-case handling.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-semibold">vs. Consultants</h3>
            <p className="mt-1 text-xs text-muted">Manual research</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Instant, structured, repeatable. &euro;0.80 for Swedish company data
              vs. &euro;500/hour for a consultant to look it up manually.
            </p>
          </div>
        </div>
      </section>

      {/* Coming soon */}
      <section className="mb-16 rounded-xl border border-border bg-surface p-8">
        <h2 className="text-xl font-bold tracking-tight">
          Coming soon: Strale Regulated
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          A compliance tier with audit trails, data residency guarantees, and
          EU AI Act classification metadata on every call. Same capabilities,
          enterprise-grade transparency.
        </p>
      </section>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/signup"
          className="inline-block rounded-lg bg-accent px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-accent-hover"
        >
          Get API Key (free) &mdash; &euro;2.00 trial credits
        </Link>
      </div>
    </div>
  );
}
