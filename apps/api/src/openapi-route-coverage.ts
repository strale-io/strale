/** Hono records middleware as ALL routes too. These exact paths are middleware
 * registrations in app.ts or mounted routers, not transport handlers. /mcp is
 * deliberately absent: it has a real ALL handler and an explicit exclusion. */
export const middlewareRegistrations: Record<string, number> = {
  "/*": 4,
  "/x402/*": 4,
  "/v1/capabilities/*": 1,
  "/v1/capabilities": 1,
  "/v1/solutions/*": 1,
  "/v1/solutions": 1,
  "/v1/public/ops/*": 3,
  "/v1/internal/*": 3,
  "/v1/audit/*": 2,
  "/.well-known/*": 2,
  "/SKILL.md": 2,
  "/llms.txt": 2,
  "/llms-full.txt": 2,
  "/openapi.json": 1,
  "/robots.txt": 1,
  "/sitemap.xml": 1,
  "/api": 1,
  "/pricing": 1,
  "/status": 1,
  "/changelog": 1,
  "/terms": 1,
  "/terms-of-service": 1,
  "/privacy": 1,
  "/docs": 1,
  "/developers": 1,
  "/api-reference": 1,
  "/signup": 1,
  "/v1/*": 2,
  "/a2a": 2,
  "/webhooks/*": 1,
  "/v1/wallet/*": 2,
  "/v1/wallet/topup": 1,
  "/v1/api-keys/*": 3,
  "/v1/admin/*": 1,
  "/v1/verify/*": 1,
  "/mcp/*": 1,
  "/a2a/*": 1
};

const normalize = (path: string) => path.replace(/:([\w]+)/g, "{}").replace(/\{[^}]+\}/g, "{}");
export function registeredOperations(routes: Array<{ method: string; path: string }>) {
  const seen = new Map<string, number>();
  return new Set(routes.filter(r => {
    if (r.method !== "ALL") return true;
    const count = (seen.get(r.path) ?? 0) + 1;
    seen.set(r.path, count);
    // An additional ALL registration, even on an existing middleware path,
    // must be documented or explicitly excluded instead of disappearing.
    return count > (middlewareRegistrations[r.path] ?? 0);
  }).map(r => `${r.method} ${normalize(r.path)}`));
}
export function specOperations(spec: Record<string, unknown>) {
  return new Set(Object.entries(spec).flatMap(([path, value]) => Object.keys(value as object)
    .filter(method => ["get", "post", "put", "patch", "delete", "options", "head"].includes(method))
    .map(method => `${method.toUpperCase()} ${normalize(path)}`)));
}
export function routeCoverage(routes: Array<{ method: string; path: string }>, spec: Record<string, unknown>, exclusions: Array<{ route: string; reason: string }>) {
  const registered = registeredOperations(routes);
  const documented = specOperations(spec);
  const excluded = new Set(exclusions.map(({ route }) => {
    const [method, path] = route.split(" "); return `${method} ${normalize(path)}`;
  }));
  return {
    nonexistent: [...documented].filter(operation => !registered.has(operation)),
    undocumented: [...registered].filter(operation => !documented.has(operation) && !excluded.has(operation)),
    staleExclusions: [...excluded].filter(operation => !registered.has(operation)),
  };
}
