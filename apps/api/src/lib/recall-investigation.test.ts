import { expect, it, vi } from "vitest";
import { getExecutor } from "../capabilities/index.js";
import "../capabilities/us-product-recall-search.js";

it("recall search forwards filters and caps the mapped response after reading the upstream body", async () => {
  const upstream = Array.from({ length: 30 }, (_, i) => ({ RecallID: i + 1, Title: `Synthetic recall ${i + 1}`, Hazards: [{ Name: "Test hazard" }], Products: [{ Name: "Test product" }] }));
  const fetcher = vi.fn(async (_url: unknown) => new Response(JSON.stringify(upstream)));
  vi.stubGlobal("fetch", fetcher);
  try {
    const result = await getExecutor("us-product-recall-search")!({ query: "test", manufacturer: "Synthetic manufacturer", date_from: "2026-01-01", date_to: "2026-01-31" });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.origin).toBe("https://www.saferproducts.gov");
    expect(Object.fromEntries(url.searchParams)).toEqual({ format: "json", RecallTitle: "test", Manufacturer: "Synthetic manufacturer", RecallDateStart: "2026-01-01", RecallDateEnd: "2026-01-31" });
    expect(result.output.result_count).toBe(25);
    expect(result.output.recalls).toHaveLength(25);
    expect((result.output.recalls as any[])[24]).toMatchObject({ recall_id: 25, hazard: "Test hazard" });
  } finally { vi.unstubAllGlobals(); }
});

it("recall upstream timeouts and HTTP errors remain failures rather than empty successful searches", async () => {
  const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  const fetcher = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(new Response("Unavailable", { status: 503 })).mockResolvedValueOnce(new Response("[]"));
  vi.stubGlobal("fetch", fetcher);
  try {
    const execute = getExecutor("us-product-recall-search")!;
    await expect(execute({ query: "test" })).rejects.toBe(timeout);
    await expect(execute({ query: "test" })).rejects.toThrow("HTTP 503");
    const empty = await execute({ query: "no-matching-title" });
    expect(empty.output).toMatchObject({ result_count: 0, recalls: [] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(execute({})).rejects.toThrow("required");
    await expect(execute({ query: "test", date_from: "yesterday" })).rejects.toThrow("ISO date");
    expect(fetcher).toHaveBeenCalledTimes(3);
  } finally { vi.unstubAllGlobals(); }
});
