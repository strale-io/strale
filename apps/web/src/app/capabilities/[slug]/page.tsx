import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCapabilities, formatPrice } from "@/lib/api";
import { CodeBlock } from "@/components/code-block";

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

function renderSchema(schema: Record<string, unknown>) {
  const properties = (schema.properties ?? {}) as Record<
    string,
    { type?: string; description?: string; enum?: string[] }
  >;
  const required = (schema.required ?? []) as string[];
  const entries = Object.entries(properties);
  if (entries.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-2 pr-4 font-medium text-muted">Parameter</th>
            <th className="pb-2 pr-4 font-medium text-muted">Type</th>
            <th className="pb-2 pr-4 font-medium text-muted">Required</th>
            <th className="pb-2 font-medium text-muted">Description</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, prop]) => (
            <tr key={name} className="border-b border-border/50">
              <td className="py-2.5 pr-4 font-mono text-accent">{name}</td>
              <td className="py-2.5 pr-4 font-mono text-xs text-muted">
                {prop.type ?? "string"}
                {prop.enum && ` (${prop.enum.join(" | ")})`}
              </td>
              <td className="py-2.5 pr-4">
                {required.includes(name) ? (
                  <span className="text-accent">yes</span>
                ) : (
                  <span className="text-muted">no</span>
                )}
              </td>
              <td className="py-2.5 text-muted">{prop.description ?? "\u2014"}</td>
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

  const related = capabilities
    .filter((c) => c.category === cap.category && c.slug !== cap.slug)
    .slice(0, 4);

  // Build example input from schema
  const inputExample: Record<string, string> = {};
  const props = (cap.input_schema?.properties ?? {}) as Record<
    string,
    { type?: string; description?: string }
  >;
  for (const [key, val] of Object.entries(props)) {
    inputExample[key] = val.type === "number" ? "123" : `"your_${key}"`;
  }
  const inputJson = JSON.stringify(inputExample, null, 2).replace(/"/g, "").replace(/\\/g, '"');

  const curlExample = `curl -X POST https://strale-production.up.railway.app/v1/do \\
  -H "Authorization: Bearer sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "${cap.name.toLowerCase()}",
    "capability_slug": "${cap.slug}",
    "inputs": ${JSON.stringify(inputExample).replace(/"your_/g, '"')}
  }'`;

  const tsExample = `import Strale from "straleio";

const strale = new Strale({ apiKey: "sk_live_YOUR_KEY" });

const result = await strale.do("${cap.slug}", ${JSON.stringify(inputExample, null, 2)});
console.log(result.data);`;

  const pyExample = `from langchain_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tool = toolkit.get_tool("${cap.slug}")
result = tool.run(${JSON.stringify(inputExample).replace(/"/g, '"')})`;

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
          </div>
          <div className="text-right">
            <span className="font-mono text-2xl font-bold text-accent">
              {formatPrice(cap.price_cents)}
            </span>
            <p className="text-sm text-muted">per call</p>
          </div>
        </div>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          {cap.description}
        </p>
        {cap.avg_latency_ms && (
          <p className="mt-2 text-sm text-muted">
            Average latency: {cap.avg_latency_ms}ms
          </p>
        )}
      </div>

      {/* Input schema */}
      {cap.input_schema && Object.keys(cap.input_schema.properties ?? {}).length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold">Input Parameters</h2>
          <div className="rounded-xl border border-border bg-surface p-5">
            {renderSchema(cap.input_schema)}
          </div>
        </section>
      )}

      {/* Example requests */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">Example Requests</h2>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted">cURL</h3>
            <CodeBlock code={curlExample} language="bash" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted">TypeScript (SDK)</h3>
            <CodeBlock code={tsExample} language="typescript" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted">Python (LangChain)</h3>
            <CodeBlock code={pyExample} language="python" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mb-10 rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-lg font-semibold">Try it with a free API key</p>
        <p className="mt-1 text-sm text-muted">
          Get &euro;2.00 in free credits. No credit card required.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-background transition-colors hover:bg-accent-hover"
        >
          Get API Key (free)
        </Link>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Related Capabilities</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/capabilities/${r.slug}`}
                className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-bright hover:bg-surface-bright"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold group-hover:text-accent">
                    {r.name}
                  </h3>
                  <span className="shrink-0 font-mono text-sm text-accent">
                    {formatPrice(r.price_cents)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">
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
