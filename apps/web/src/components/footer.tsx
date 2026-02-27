import Link from "next/link";

const LINKS = [
  { href: "/capabilities", label: "Capabilities" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "https://github.com/petterlindstrom79/strale", label: "GitHub", external: true },
  { href: "https://strale-production.up.railway.app/health", label: "API Status", external: true },
];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-tight text-foreground">strale</span>
          <span className="text-sm text-muted">&copy; {new Date().getFullYear()}</span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-6">
          {LINKS.map(({ href, label, external }) =>
            external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted transition-colors hover:text-foreground"
              >
                {label}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                className="text-sm text-muted transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            )
          )}
        </nav>

        <p className="text-sm text-muted">
          Built in Sweden. Hosted in the EU.
        </p>
      </div>
    </footer>
  );
}
