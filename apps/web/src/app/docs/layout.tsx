"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const DOCS_NAV = [
  {
    section: "Getting Started",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/getting-started", label: "Quickstart" },
    ],
  },
  {
    section: "Integrations",
    items: [
      { href: "/docs/integrations/mcp", label: "MCP Server" },
      { href: "/docs/integrations/langchain", label: "LangChain" },
      { href: "/docs/integrations/crewai", label: "CrewAI" },
      { href: "/docs/integrations/semantic-kernel", label: "Semantic Kernel" },
      { href: "/docs/integrations/http-api", label: "Direct HTTP API" },
    ],
  },
  {
    section: "API Reference",
    items: [
      { href: "/docs/api-reference", label: "Overview" },
    ],
  },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 py-12">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 md:block">
        <nav className="sticky top-24 space-y-6">
          {DOCS_NAV.map((group) => (
            <div key={group.section}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {group.section}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "block rounded-md px-3 py-1.5 text-sm transition-colors",
                        pathname === item.href
                          ? "bg-surface-bright text-foreground"
                          : "text-muted hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <article className="prose prose-invert max-w-none [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:text-muted [&_p]:leading-relaxed [&_li]:text-muted [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline [&_code]:rounded [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-code [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-foreground [&_table]:w-full [&_th]:border-b [&_th]:border-border [&_th]:pb-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted [&_td]:border-b [&_td]:border-border/50 [&_td]:py-2 [&_td]:text-muted [&_hr]:border-border">
          {children}
        </article>
      </div>
    </div>
  );
}
