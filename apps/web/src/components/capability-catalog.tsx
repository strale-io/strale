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
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Capabilities
        </h1>
        <p className="mt-3 text-muted">
          {capabilities.length} capabilities, all with transparent per-call pricing and structured JSON responses.
        </p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar filters — desktop */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
            Categories
          </h3>
          <button
            onClick={() => setSelectedCategory("")}
            className={`block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
              !selectedCategory
                ? "bg-surface-bright text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            All ({capabilities.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setSelectedCategory(cat.slug === selectedCategory ? "" : cat.slug)}
              className={`block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                selectedCategory === cat.slug
                  ? "bg-surface-bright text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Search + mobile category filter */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
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
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground lg:hidden"
            >
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {cat.label} ({cat.count})
                </option>
              ))}
            </select>
          </div>

          {/* Results count */}
          <p className="mb-4 text-sm text-muted">
            {filtered.length} {filtered.length === 1 ? "capability" : "capabilities"}
            {selectedCategory && ` in ${categories.find(c => c.slug === selectedCategory)?.label ?? selectedCategory}`}
            {search && ` matching "${search}"`}
          </p>

          {/* Grid */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((cap) => (
              <Link
                key={cap.slug}
                href={`/capabilities/${cap.slug}`}
                className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-bright hover:bg-surface-bright"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug group-hover:text-accent">
                    {cap.name}
                  </h3>
                  <span className="shrink-0 font-mono text-sm font-medium text-accent">
                    {formatPrice(cap.price_cents)}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-muted">{cap.slug}</p>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                  {cap.description}
                </p>
                <div className="mt-3">
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                    {categories.find(c => c.slug === cap.category)?.label ?? cap.category}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-muted">No capabilities found matching your search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
