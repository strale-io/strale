/**
 * Browserless v2 ignores the `LAUNCH_ARGS` env var — it's listed in the
 * `deprecatedConfig` enum and silently dropped at process start with a
 * deprecation warning. Chrome flags MUST be passed per-request via the
 * `?launch=<base64 JSON>` query parameter on every Browserless API call.
 *
 * See https://github.com/browserless/browserless/blob/main/src/config.ts
 * (search `deprecatedConfig`) — confirmed during 2026-05-04 chromium-
 * service repair when the Railway-hosted instance was discovered to be
 * crash-looping on every Chrome launch.
 *
 * Without `--no-sandbox` + `--disable-dev-shm-usage`, Chrome on Railway
 * containers crashes during startup reading
 * `/sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq` and then
 * triggers `pthread_create: Resource temporarily unavailable` (EAGAIN)
 * on every request. Both failure modes were documented in
 * `apps/api/railway-config.md` against Browserless v1's env-var
 * pass-through; v2 dropped that mechanism but the docs were never
 * updated.
 *
 * The hosted service (`production-sfo.browserless.io`) tolerates these
 * defaults because its container runtime exposes the cpufreq files;
 * the failure is specific to Railway's containerd runtime, which
 * doesn't.
 */

const BROWSERLESS_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-setuid-sandbox",
] as const;

const LAUNCH_QUERY_PARAM =
  "launch=" +
  Buffer.from(JSON.stringify({ args: BROWSERLESS_LAUNCH_ARGS })).toString("base64");

export { BROWSERLESS_LAUNCH_ARGS, LAUNCH_QUERY_PARAM };

/**
 * Build a Browserless v2 request URL with token auth + launch args.
 * `path` includes the leading slash (e.g. `/content`).
 */
export function buildBrowserlessRequestUrl(
  baseUrl: string,
  path: string,
  token: string,
): string {
  return `${baseUrl}${path}?token=${encodeURIComponent(token)}&${LAUNCH_QUERY_PARAM}`;
}

/**
 * Redact the `token=` query value from a Browserless URL. Used by the
 * chromium-health probe to log the wire-shape (host, path, launch payload)
 * without leaking the API key into log sinks. Case-insensitive so future
 * callers passing URLs from libraries / redirects that capitalise the
 * param don't silently fail to redact.
 */
export function stripToken(url: string): string {
  return url.replace(/([?&])(token)=[^&]*/gi, "$1$2=<redacted>");
}
