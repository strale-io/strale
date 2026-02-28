import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck } from "lucide-react";
import { getCapabilities, getCategories, formatPrice } from "@/lib/api";
import { CodeTabs } from "@/components/code-tabs";

export const revalidate = 3600;

export async function generateStaticParams() {
  const capabilities = await getCapabilities();
  return capabilities.map((cap) => ({ slug: cap.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const capabilities = await getCapabilities();
  const cap = capabilities.find((c) => c.slug === slug);
  if (!cap) return { title: "Not Found" };
  return {
    title: cap.name,
    description: cap.description,
  };
}

function ParameterTable({ schema }: { schema: Record<string, unknown> }) {
  const properties = (schema.properties ?? {}) as Record<
    string,
    { type?: string; description?: string; enum?: string[] }
  >;
  const required = (schema.required ?? []) as string[];
  const entries = Object.entries(properties);
  if (entries.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="px-4 py-2.5 text-left font-medium text-muted">Parameter</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted">Type</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted">Required</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted">Description</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, prop]) => (
            <tr key={name} className="border-b border-border/30">
              <td className="px-4 py-3 font-mono text-sm text-accent">{name}</td>
              <td className="px-4 py-3">
                <span className="rounded bg-surface-bright px-1.5 py-0.5 font-mono text-xs text-muted">
                  {prop.type ?? "string"}
                </span>
                {prop.enum && (
                  <span className="ml-1 text-xs text-muted">
                    {prop.enum.join(" | ")}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                {required.includes(name) ? (
                  <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-400">
                    REQ
                  </span>
                ) : (
                  <span className="rounded bg-surface-bright px-1.5 py-0.5 text-xs font-medium text-muted">
                    OPT
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-muted">{prop.description ?? "\u2014"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CapabilityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const capabilities = await getCapabilities();
  const cap = capabilities.find((c) => c.slug === slug);

  if (!cap) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">Capability not found</h1>
        <Link href="/capabilities" className="mt-4 inline-block text-accent">
          Back to capabilities
        </Link>
      </div>
    );
  }

  const allCategories = getCategories(capabilities);
  const categoryLabel =
    allCategories.find((c) => c.slug === cap.category)?.label ?? cap.category;

  const related = capabilities
    .filter((c) => c.category === cap.category && c.slug !== cap.slug)
    .slice(0, 3);

  // Build example input from schema
  const inputExample: Record<string, string> = {};
  const props = (cap.input_schema?.properties ?? {}) as Record<
    string,
    { type?: string; description?: string }
  >;
  for (const [key, val] of Object.entries(props)) {
    inputExample[key] = val.type === "number" ? "123" : `your_${key}`;
  }

  const curlExample = `curl -X POST https://api.strale.io/v1/do \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "${cap.name.toLowerCase()}",
    "capability_slug": "${cap.slug}",
    "inputs": ${JSON.stringify(inputExample, null, 4).replace(/"your_/g, '"')}
  }'`;

  const tsExample = `import Strale from "straleio";

const strale = new Strale({ apiKey: "YOUR_API_KEY" });

const result = await strale.do("${cap.slug}", ${JSON.stringify(inputExample, null, 2)});
console.log(result.data);`;

  const pyExample = `import requests

response = requests.post(
    "https://api.strale.io/v1/do",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "task": "${cap.name.toLowerCase()}",
        "capability_slug": "${cap.slug}",
        "inputs": ${JSON.stringify(inputExample, null, 8).replace(/"your_/g, '"')},
    },
)
print(response.json()["data"])`;

  const tabs = [
    { label: "cURL", language: "bash", code: curlExample },
    { label: "TypeScript", language: "typescript", code: tsExample },
    { label: "Python", language: "python", code: pyExample },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/capabilities"
        className="mb-8 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to capabilities
      </Link>

      {/* Header */}
      <div className="mb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{cap.name}</h1>
            <p className="mt-1 font-mono text-sm text-muted">{cap.slug}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
                {categoryLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 px-2.5 py-0.5 text-xs text-accent">
                <BadgeCheck size={12} /> Verified
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono text-3xl font-bold text-accent">
              {formatPrice(cap.price_cents)}
            </span>
            <p className="text-sm text-muted">per call</p>
          </div>
        </div>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          {cap.description}
        </p>
        {cap.avg_latency_ms != null && (
          <p className="mt-2 text-sm text-muted">
            Average latency: {cap.avg_latency_ms}ms
          </p>
        )}
      </div>

      {/* Input parameters */}
      {cap.input_schema &&
        Object.keys(cap.input_schema.properties ?? {}).length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold">Input Parameters</h2>
            <ParameterTable schema={cap.input_schema} />
          </section>
        )}

      {/* Usage examples in tabs */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">Usage Examples</h2>
        <CodeTabs tabs={tabs} />
      </section>

      {/* CTA */}
      <section className="mb-10 rounded-xl border border-accent/20 bg-accent/5 p-6 text-center">
        <p className="text-lg font-semibold">Try it with a free API key</p>
        <p className="mt-1 text-sm text-muted">
          Get &euro;2.00 in free credits. No credit card required.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-background transition-colors hover:bg-accent-hover"
        >
          Try it &mdash; get a free API key <ArrowRight size={14} />
        </Link>
      </section>

      {/* Related capabilities */}
      {related.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Related Capabilities</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/capabilities/${r.slug}`}
                className="group rounded-xl border border-border bg-surface p-4 transition-all hover:border-accent/40 hover:bg-surface-bright"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground group-hover:text-accent">
                    {r.name}
                  </h3>
                  <span className="shrink-0 font-mono text-sm text-accent">
                    {formatPrice(r.price_cents)}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted">{r.slug}</p>
                <p className="mt-2 line-clamp-2 text-sm text-muted">
                  {r.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
