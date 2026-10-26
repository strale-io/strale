/** Shared, keyless GLEIF transport. Callers interpret HTTP and JSON:API errors. */
export const GLEIF_API = "https://api.gleif.org/api/v1";

export function gleifFetch(path: string): Promise<Response> {
  return fetch(`${GLEIF_API}${path}`, {
    headers: {
      Accept: "application/vnd.api+json",
      "User-Agent": "Strale/1.0 (+https://strale.dev)",
    },
    signal: AbortSignal.timeout(10000),
  });
}
