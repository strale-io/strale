/** Exactly two free official API requests; no Strale executor/dispatcher or DB.
 * Run after Petter configures NTA_HOUJIN_APP_ID. Never print URLs or exceptions.
 */
import { fetchNtaCorporations, mapNtaCorporation } from "../src/lib/nta-corporate.js";

async function main(): Promise<void> {
  if (!process.env.NTA_HOUJIN_APP_ID?.trim()) {
    console.error(JSON.stringify({ error_code: "capability_unavailable", message: "Set NTA_HOUJIN_APP_ID before running the smoke check." }));
    process.exitCode = 1;
    return;
  }
  for (const [operation, query, byNumber] of [
    ["number_lookup", "1180301018771", true],
    ["name_search", "トヨタ自動車", false],
  ] as const) {
    try {
      const result = await fetchNtaCorporations(query, byNumber);
      console.log(JSON.stringify({
        operation,
        count: result.count,
        observed_field_names: [...new Set(result.records.flatMap(r => Object.keys(r)))].sort(),
        status_mapping: result.records.slice(0, 10).map(r => ({
          corporate_number: r.corporateNumber, process: r.process,
          close_cause: r.closeCause, close_date: r.closeDate, status: mapNtaCorporation(r).status,
        })),
      }, null, 2));
    } catch (err) {
      // Explicit allowlist: never stringify err, its URL, cause or body.
      const code = err instanceof Error && "error_code" in err ? err.error_code : "execution_failed";
      console.error(JSON.stringify({ operation, error_code: code, message: "NTA smoke request failed; check configuration or retry later." }));
      process.exitCode = 1;
    }
  }
}
await main();
