import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MODELS } from "../models.js";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  client: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  db: vi.fn(),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mocks.create };
    constructor(options: unknown) {
      mocks.client(options);
    }
  },
}));
vi.mock("../log.js", () => ({
  logWarn: mocks.warn,
  logError: vi.fn(),
  log: { info: mocks.info },
}));
vi.mock("../../db/index.js", () => ({ getDb: mocks.db }));
import {
  buildCatalogPrompt,
  buildSearchRequest,
  createSearchRanker,
} from "./smart.js";
import type { CatalogItem } from "../suggest.js";
const cap: CatalogItem = {
  type: "capability",
  slug: "email-validate",
  name: "Email Validation",
  description: "Validate an email address.",
  category: "validation",
  geography: "global",
  search_tags: ["email"],
  priceCents: 2,
  isFreeTier: true,
  trustSummary: {
    badge: "tested",
    badge_label: "Tested",
    avg_response_time_ms: 10,
    tests_passing: 2,
    tests_total: 2,
    last_tested_at: "2026-10-26T00:00:00.000Z",
    data_source: "internal_testing",
  },
};
const sol: CatalogItem = {
  ...cap,
  type: "solution",
  slug: "email-workflow",
  name: "Email Workflow",
  priceCents: 10,
  stepCount: 1,
  steps: [{ name: cap.name, capabilitySlug: cap.slug, parallelGroup: null }],
  isFreeTier: false,
};
const other: CatalogItem = {
  ...cap,
  slug: "sanctions-check",
  name: "Sanctions Check",
};
const body = (
  results = [
    { slug: cap.slug, reason: "Validates the email you asked to check." },
  ],
  none_relevant = false
) => ({ understood_as: "Check email", none_relevant, results });
const reply = (value: unknown) => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(value) }],
});
const args = () => ({
  prompt: buildCatalogPrompt([cap, sol]),
  query: "validate an email",
  limit: 3,
  ip: "test-ip",
  slugs: new Set([cap.slug, sol.slug, other.slug]),
  confidentKeyword: true,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("SEARCH_LLM_DAILY_CAP", "5000");
  mocks.create.mockResolvedValue(reply(body()));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("smart search request and guarded ranking", () => {
  it("builds the same cached prompt across loads/order changes and sorts by slug", () => {
    const a = buildCatalogPrompt([sol, cap]);
    const b = buildCatalogPrompt(JSON.parse(JSON.stringify([cap, sol])));
    expect(a).toBe(b);
    expect(a.indexOf("email-validate | capability")).toBeLessThan(
      a.indexOf("email-workflow | solution")
    );
    expect(a).toContain("email-workflow: email-validate");
    expect(
      buildCatalogPrompt([{ ...cap, description: "Changed catalogue text" }])
    ).not.toBe(buildCatalogPrompt([cap]));
  });
  it("uses the registry model, structured output, low effort, cache control, timeout and no sampling", async () => {
    const rank = createSearchRanker();
    await rank(args());
    const [request, options] = mocks.create.mock.calls[0];
    expect(request.model).toBe(MODELS.search_rank.id);
    expect(request.output_config.effort).toBe("low");
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(request.messages[0].content).toContain("at most 4 results");
    for (const key of ["temperature", "top_p", "top_k"])
      expect(request).not.toHaveProperty(key);
    expect(mocks.client).toHaveBeenCalledWith({
      apiKey: "test-key",
      timeout: 6000,
      maxRetries: 0,
    });
    expect(options.timeout).toBe(6000);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("drops unknown and duplicate slugs without losing a valid answer", async () => {
    mocks.create.mockResolvedValue(
      reply(
        body([
          { slug: "made-up", reason: "bad" },
          { slug: cap.slug, reason: "good" },
          { slug: cap.slug, reason: "duplicate" },
        ])
      )
    );
    const result = await createSearchRanker()(args());
    expect(result?.results).toEqual([{ slug: cap.slug, reason: "good" }]);
  });
  it("honours none_relevant even with a confident keyword candidate", async () => {
    mocks.create.mockResolvedValue(reply(body(undefined, true)));
    expect((await createSearchRanker()(args()))?.results).toEqual([]);
    expect(mocks.warn).not.toHaveBeenCalled();
  });
  it.each([
    [
      "invalid_json",
      { stop_reason: "end_turn", content: [{ type: "text", text: "{broken" }] },
    ],
    [
      "invalid_json",
      reply({
        understood_as: "email",
        none_relevant: false,
        results: [{ slug: cap.slug, reason: 42 }],
      }),
    ],
    ["refusal", { stop_reason: "refusal", content: [] }],
    [
      "zero_valid_slugs",
      reply(body([{ slug: "not-in-catalogue", reason: "unknown" }])),
    ],
  ])("falls back and logs %s", async (reason, response) => {
    mocks.create.mockResolvedValue(response);
    expect(await createSearchRanker()(args())).toBeNull();
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.warn.mock.calls[0][2]).toMatchObject({ reason });
  });
  it.each([
    ["timeout", "APIConnectionTimeoutError"],
    ["api_error", "Error"],
  ])("logs %s on SDK failure", async (reason, name) => {
    const error = new Error("Do not log this body");
    error.name = name;
    mocks.create.mockRejectedValue(error);
    expect(await createSearchRanker()(args())).toBeNull();
    expect(mocks.warn.mock.calls[0][2]).toMatchObject({ reason });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("Do not log");
  });
  it("returns no recommendation for zero valid slugs when keywords lack confidence", async () => {
    mocks.create.mockResolvedValue(reply(body([])));
    expect(
      (await createSearchRanker()({ ...args(), confidentKeyword: false }))
        ?.results
    ).toEqual([]);
  });
  it("uses keywords without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await createSearchRanker()(args())).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.warn.mock.calls[0][2]).toMatchObject({
      reason: "missing_key",
      daily_count: 0,
    });
  });
  it("reserves the daily cap before concurrent SDK calls and resets next day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    vi.stubEnv("SEARCH_LLM_DAILY_CAP", "1");
    const rank = createSearchRanker();
    const results = await Promise.all([
      rank(args()),
      rank({ ...args(), ip: "another" }),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.warn.mock.calls[0][2]).toMatchObject({
      reason: "daily_cap",
      daily_count: 1,
    });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    await rank(args());
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("limits model-reaching requests per IP and releases the minute window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const rank = createSearchRanker();
    for (let i = 0; i < 10; i++) await rank(args());
    expect(await rank(args())).toBeNull();
    expect(mocks.create).toHaveBeenCalledTimes(10);
    expect(mocks.warn.mock.calls[0][2]).toMatchObject({
      reason: "ip_limit",
      ip_count: 10,
      daily_count: 10,
    });
    await rank({ ...args(), ip: "different" });
    expect(mocks.create).toHaveBeenCalledTimes(11);
    vi.advanceTimersByTime(60_001);
    await rank(args());
    expect(mocks.create).toHaveBeenCalledTimes(12);
  });
  it("zero cap disables model requests", async () => {
    vi.stubEnv("SEARCH_LLM_DAILY_CAP", "0");
    expect(await createSearchRanker()(args())).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
function mockCatalogueDb() {
  mocks.db.mockReturnValue({
    select: (fields: Record<string, unknown>) => {
      const rows =
        "id" in fields
          ? [{ id: "solution-id", ...sol, searchTags: sol.search_tags }]
          : "solutionId" in fields
          ? [
              {
                solutionId: "solution-id",
                capabilitySlug: cap.slug,
                capabilityName: cap.name,
                parallelGroup: null,
              },
            ]
          : "successRate" in fields
          ? []
          : [cap, other].map((i) => ({ ...i, searchTags: i.search_tags }));
      const chain: Record<string, unknown> = {
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      for (const method of ["from", "where", "orderBy", "innerJoin"])
        chain[method] = () => chain;
      return chain;
    },
    execute: () => Promise.resolve([]),
  });
}
describe("suggest wire mapping and engine fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCatalogueDb();
  });
  it.each(["", " ", "a"])(
    "never loads the catalogue or calls the model for invalid short input %j",
    async (query) => {
      const { suggest } = await import("../suggest.js");
      expect(await suggest({ query })).toMatchObject({
        recommendation: null,
        total_matches: 0,
      });
      expect(mocks.db).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );
  it("restores a parent solution alternative even below the keyword relevance cutoff", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { suggest, typeahead } = await import("../suggest.js");
    const dropdown = await typeahead("email-validate", 10);
    expect(dropdown.results.map((r) => r.slug)).not.toContain(sol.slug);
    const response = await suggest({ query: "email-validate" });
    expect(response.recommendation?.slug).toBe(cap.slug);
    expect(response.alternatives.map((r) => r.slug)).toContain(sol.slug);
  });
  it("uses the new family ranking in the actual typeahead and keyword fallback paths", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { suggest, typeahead } = await import("../suggest.js");
    const dropdown = await typeahead("email-workflow", 10);
    const response = await suggest({ query: "email-workflow" });
    expect(dropdown.results[0].slug).toBe(sol.slug);
    expect(response.recommendation?.slug).toBe(sol.slug);
  });
  it("maps valid recommendations through the existing response contract", async () => {
    const { suggest } = await import("../suggest.js");
    const response = await suggest({
      query: "validate an email",
      clientIp: "203.0.113.1",
    });
    expect(response.recommendation).toMatchObject({
      type: "capability",
      slug: cap.slug,
      price_cents: 2,
      category: "validation",
      match_reason: body().results[0].reason,
      trust: { data_source: "internal_testing" },
      part_of_solution: { slug: sol.slug, price_cents: 10 },
    });
    expect(response).toMatchObject({
      total_matches: 1,
      query_understood_as: "Check email",
    });
  });
  it("keeps solution steps, excludes own steps from alternatives and preserves unrelated alternatives", async () => {
    mocks.create.mockResolvedValue(
      reply(
        body([
          { slug: sol.slug, reason: "Workflow" },
          { slug: cap.slug, reason: "Step" },
          { slug: other.slug, reason: "Other" },
        ])
      )
    );
    const { suggest } = await import("../suggest.js");
    const response = await suggest({ query: "email workflow" });
    expect(response.recommendation).toMatchObject({
      slug: sol.slug,
      steps: [
        { name: cap.name, capability_slug: cap.slug, parallel_group: null },
      ],
      step_count: 1,
      badge: "strale_tested",
    });
    expect(response.alternatives.map((r) => r.slug)).toEqual([other.slug]);
  });
  it("maps none_relevant to a null recommendation", async () => {
    mocks.create.mockResolvedValue(reply(body([], true)));
    const { suggest } = await import("../suggest.js");
    expect(await suggest({ query: "send a letter" })).toMatchObject({
      recommendation: null,
      alternatives: [],
      total_matches: 0,
    });
  });
  it.each([
    "timeout",
    "api_error",
    "invalid_json",
    "zero_valid_slugs",
    "missing_key",
    "daily_cap",
  ])("returns the keyword match for %s", async (reason) => {
    if (reason === "missing_key") vi.stubEnv("ANTHROPIC_API_KEY", "");
    else if (reason === "daily_cap") vi.stubEnv("SEARCH_LLM_DAILY_CAP", "0");
    else if (reason === "invalid_json")
      mocks.create.mockResolvedValue({
        content: [{ type: "text", text: "not json" }],
      });
    else if (reason === "zero_valid_slugs")
      mocks.create.mockResolvedValue(
        reply(body([{ slug: "unknown", reason: "bad" }]))
      );
    else {
      const e = new Error("failed");
      e.name = reason === "timeout" ? "APIConnectionTimeoutError" : "Error";
      mocks.create.mockRejectedValue(e);
    }
    const { suggest } = await import("../suggest.js");
    const result = await suggest({ query: "email validate" });
    expect(result.recommendation?.slug).toBe(cap.slug);
    expect(
      mocks.warn.mock.calls.filter((c) => c[0] === "suggest-keyword-fallback")
    ).toHaveLength(1);
    expect(mocks.warn).toHaveBeenCalledWith(
      "suggest-keyword-fallback",
      expect.any(String),
      expect.objectContaining({ reason })
    );
  });
  it("caches normalized queries for ten minutes, includes limit, invalidates when catalogue reloads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const { suggest } = await import("../suggest.js");
    await suggest({ query: "please email validate" });
    await suggest({ query: "Email validate!" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await suggest({ query: "email validate", limit: 1 });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(600_001);
    await suggest({ query: "email validate" });
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });
  it("typeahead preserves field types, grouping, total, geo and type fallback", async () => {
    const { typeaheadFromCatalog } = await import("../suggest.js");
    const { createKeywordIndex } = await import("./keyword.js");
    const variants = [
      {
        ...sol,
        slug: "email-workflow-se",
        name: "Email Workflow — Sweden",
        geography: "nordic",
      },
      {
        ...sol,
        slug: "email-workflow-no",
        name: "Email Workflow — Norway",
        geography: "nordic",
      },
    ];
    const items = [cap, other, ...variants];
    const index = createKeywordIndex(items);
    const response = typeaheadFromCatalog(
      items,
      index,
      "email workflow",
      10,
      "SE",
      "solution"
    );
    expect(response.results[0]).toMatchObject({
      type: "solution",
      slug: "email-workflow-se",
      price_cents: 10,
      step_count: 1,
    });
    expect(response.results[0].also_available_for).toContain("Norway");
    const grouped = typeaheadFromCatalog(
      items,
      index,
      "email workflow",
      10,
      undefined,
      "solution"
    );
    expect(grouped.results[0].also_available_for).toHaveLength(1);
    expect(grouped.total).toBe(1);
    const fallback = typeaheadFromCatalog(
      items,
      index,
      "sanctions-check",
      10,
      undefined,
      "solution"
    );
    expect(fallback.results[0].slug).toBe(other.slug);
    const capResponse = typeaheadFromCatalog(
      items,
      index,
      "email-validate",
      10
    );
    expect(capResponse.results[0]).toMatchObject({
      type: "capability",
      slug: cap.slug,
      price_cents: null,
      is_free_tier: true,
    });
  });
});
