"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/capabilities", label: "Capabilities" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
          strale
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "text-sm transition-colors",
                pathname.startsWith(href)
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              )}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-hover"
          >
            Get API Key
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-muted hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t border-border bg-background px-6 py-4 md:hidden">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "block py-2 text-sm transition-colors",
                pathname.startsWith(href)
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              )}
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/signup"
            className="mt-2 block rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-background"
            onClick={() => setMobileOpen(false)}
          >
            Get API Key
          </Link>
        </nav>
      )}
    </header>
  );
}
