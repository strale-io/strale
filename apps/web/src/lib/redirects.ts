// A small reader for the Cloudflare Pages _redirects file (public/_redirects), so a test can ask
// what the host will do with an old path. Supports the three forms the file uses: exact paths (a line with no code is a 302, as on Pages),
// :placeholders and a trailing /* splat (:splat in the target). First match wins, as on Pages.

export interface Rule { from: string; to: string; status: number }

export function parseRedirects(text: string): Rule[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [from, to, status = "302"] = l.split(/\s+/);
      return { from, to, status: Number(status) };
    });
}

function match(from: string, path: string): Record<string, string> | null {
  const a = from.split("/");
  const b = path.split("/");
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "*") {
      if (b[i] === undefined) return null; // "/x/*" does not match "/x" itself; the file lists the bare path where it matters
      params.splat = b.slice(i).join("/");
      return params;
    }
    if (b[i] === undefined) return null;
    if (a[i].startsWith(":")) params[a[i].slice(1)] = b[i];
    else if (a[i] !== b[i]) return null;
  }
  return a.length === b.length ? params : null;
}

/** The first matching rule and the target it produces, or null when no rule applies. */
export function resolveRedirect(rules: Rule[], path: string): { status: number; to: string } | null {
  for (const r of rules) {
    const params = match(r.from, path);
    if (!params) continue;
    return { status: r.status, to: r.to.replace(/:(\w+)/g, (_, k) => params[k] ?? "") };
  }
  return null;
}
