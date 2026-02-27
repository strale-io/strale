"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { Capability, CategoryInfo } from "@/lib/api";

function formatPrice(cents: number) {
  return `\u20AC${(cents / 100).toFixed(2)}`;
}

export function CapabilityCatalog({
  capabilities,
  categories,
}: {
  capabilities: Capability[];
  categories: CategoryInfo[];
}) {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") ?? "";
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);

  const filtered = useMemo(() => {
    let result = capabilities;
    if (selectedCategory) {
      result = result.filter((c) => c.category === selectedCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [capabilities, search, selectedCategory]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Capabilities
        </h1>
        <p className="mt-3 text-lg text-muted">
          {capabilities.length} capabilities available
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="text"
          placeholder="Search capabilities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {/* Category pill filters */}
      <div className="mb-8 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory("")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            !selectedCategory
              ? "bg-accent text-background"
              : "border border-border text-muted hover:border-border-bright hover:text-foreground"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.slug}
            onClick={() =>
              setSelectedCategory(cat.slug === selectedCategory ? "" : cat.slug)
            }
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === cat.slug
                ? "bg-accent text-background"
                : "border border-border text-muted hover:border-border-bright hover:text-foreground"
            }`}
          >
            {cat.label}
            <span className="ml-1.5 text-xs opacity-60">{cat.count}</span>
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="mb-4 text-sm text-muted">
        {filtered.length} {filtered.length === 1 ? "capability" : "capabilities"}
        {selectedCategory &&
          ` in ${categories.find((c) => c.slug === selectedCategory)?.label ?? selectedCategory}`}
        {search && ` matching \u201C${search}\u201D`}
      </p>

      {/* Card grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((cap) => (
          <Link
            key={cap.slug}
            href={`/capabilities/${cap.slug}`}
            className="group rounded-xl border border-border bg-surface p-5 transition-all hover:border-accent/40 hover:border-l-accent hover:bg-surface-bright"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold leading-snug text-foreground">
                  {cap.name}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {cap.slug}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-medium text-accent">
                {formatPrice(cap.price_cents)}
              </span>
            </div>
            <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted">
              {cap.description}
            </p>
            <div className="mt-3">
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                {categories.find((c) => c.slug === cap.category)?.label ??
                  cap.category}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-muted">
            No capabilities found matching your search.
          </p>
        </div>
      )}
    </div>
  );
}
