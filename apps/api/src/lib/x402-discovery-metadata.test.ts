import { describe, expect, it } from "vitest";
import { discoverySchema, discoveryTags, exampleFailure, getDiscoveryMetadata, inputPrivacyFailure, metadataFromManifest } from "./x402-discovery-metadata.js";

const tool = { slug: "safe-tool", name: "Safe tool" };
describe("public input privacy screen", () => {
  it.each([
    [{ email: "reader@example.com" }, true],
    [{ text: "reader@internal" }, false],
    [{ text: "1980-2-3" }, false],
    [{ text: "03 Feb 1980" }, false],
    [{ text: "February 3, 1980" }, false],
    [{ corporate_number: "4111111111111111" }, false],
    [{ vat_number: "4111111111111111" }, false],
    [{ text: "reader@example.com reader@internal" }, false],
    [{ text: "221B baker street" }, false],
    [{ text: "sveavägen 44" }, false],
    [{ "full-name": "jane doe" }, false],
    [{ text: '{"name":"Alice","age":30}' }, false],
    [{ text: '{"name":"Alice",}' }, false],
    [{ url: "https://example.com/?email=reader%40private.invalid" }, false],
    [{ text: "reader@example.org and reader@example.net" }, true],
    [{ email: "reader@other.invalid" }, false],
    [{ nested: [{ text: "reader@sub.example.com" }] }, false],
    [{ phone: "123" }, false],
    [{ text: "+46 70 123 45 67" }, false],
    [{ text: "4111 1111 1111 1111" }, false],
    [{ text: "DE00 0000 0000 0000 0000 00" }, false],
    [{ full_name: "Example" }, false],
    [{ firstName: "Example" }, false],
    [{ director: { id: "example" } }, false],
    [{ text: "Jane Doe" }, false],
    [{ text: "12 Example Street" }, false],
    [{ street_address: "example" }, false],
    [{ date_of_birth: "example" }, false],
    [{ text: "1980-02-03" }, false],
    [{ url: "https://8.8.8.8/a" }, false],
    [{ ip: "2001:4860:4860::8888" }, false],
    [{ ip: "192.0.2.1" }, true],
    [{ ip: "198.51.100.25" }, true],
    [{ ip: "203.0.113.255" }, true],
    [{ ip: "2001:db8::1" }, true],
    [{ org_number: "556036-0793" }, true],
    [{ vat_number: "SE556036079301" }, true],
    [{ corporate_number: "1180301018771" }, true],
  ])("screens %j (allowed=%s)", (input, allowed) => {
    expect(inputPrivacyFailure(tool, input) === undefined).toBe(allowed);
  });
  it.each(["sanctions-check", "pep-check", "adverse-media-check", "officer-search", "person-lookup", "screening-tool"])("withholds %s", slug => {
    expect(inputPrivacyFailure({ slug, name: slug }, {})).toBeDefined();
  });
  it("withholds tools classified as processing personal data", () => {
    expect(inputPrivacyFailure({ ...tool, processes_personal_data: true }, {})).toBeDefined();
  });
});

describe("manifest example selection", () => {
  const schema = { type: "object", required: ["domain"], properties: { domain: { type: "string" } } };
  it("uses only valid health inputs and validates output", () => {
    const manifest = { ...tool, description: "Example tool", input_schema: schema, output_schema: { type: "integer", example: "bad" }, test_fixtures: { health_check_input: { domain: "example.com" }, known_answer: { input: { domain: "private.invalid" } } } };
    const metadata = metadataFromManifest(manifest);
    expect(metadata.inputExample).toEqual({ domain: "example.com" });
    expect(metadata.outputExample).toBeUndefined();
    expect(metadata.outputOmission).toContain("integer");
    expect(metadataFromManifest({ ...manifest, test_fixtures: {} }).inputExample).toBeUndefined();
    expect(metadataFromManifest({ ...manifest, test_fixtures: { health_check_input: {} } }).inputExample).toBeUndefined();
  });
  it.each([
    [{ type: "string", format: "email" }, "bad"],
    [{ type: "string", format: "uri" }, "not a URI"],
    [{ type: "string", format: "date" }, "2026-99-99"],
    [{ type: "string", format: "unknown-format" }, "anything"],
  ])("rejects invalid or unknown formats %j", (schema, value) => {
    expect(exampleFailure(schema, value)).toBeDefined();
  });
  it("does not treat example data as a schema keyword", () => {
    expect(exampleFailure({ type: "object", properties: { example: { type: "string", format: "unknown-format" } } }, { example: "anything" })).toBeDefined();
    expect(exampleFailure({ type: "object", properties: { format: { type: "string" } }, example: { format: "png" } }, { format: "png" })).toBeUndefined();
  });
  it("accepts legitimate empty input and false/zero output", () => {
    expect(exampleFailure({ type: "object" }, {})).toBeUndefined();
    expect(exampleFailure({ type: "boolean" }, false)).toBeUndefined();
    expect(exampleFailure({ type: "number" }, 0)).toBeUndefined();
  });
  it("does not reuse capability metadata for a colliding solution slug", () => {
    expect(getDiscoveryMetadata("capability", "whois-lookup")?.name).toBeDefined();
    expect(getDiscoveryMetadata("solution", "whois-lookup")).toBeUndefined();
  });
  it("strips schema annotations without deleting fields named example or default", () => {
    expect(discoverySchema({ type: "object", example: { name: "hidden" }, properties: { example: { type: "string", default: "hidden" }, default: { type: "number" } } })).toEqual({ type: "object", properties: { example: { type: "string" }, default: { type: "number" } } });
  });
  it("bounds controlled tags and avoids promoting Serper-backed search", () => {
    expect(discoveryTags("image-to-text", "document-extraction")).toEqual(["document-extraction", "OCR", "image to text"]);
    expect(discoveryTags("google-search", "web-intelligence")).toEqual(["web-intelligence"]);
    expect(discoveryTags("keyword-suggest", "web-intelligence")).toEqual(["web-intelligence"]);
  });
});


describe("round 3 example publication", () => {
  it.each(["pep-check", "sanctions-check", "adverse-media-check", "uk-companies-house-officers", "eu-court-case-search"])("withholds both examples for %s", slug => {
    const metadata = getDiscoveryMetadata("capability", slug)!;
    expect(metadata).toBeDefined();
    expect(metadata.inputExample).toBeUndefined();
    expect(metadata.outputExample).toBeUndefined();
  });
  it.each(["compliance", "screening"])("withholds both examples by category %s", category => {
    const metadata = metadataFromManifest({ ...tool, category, description: "tool", input_schema: {}, output_schema: { example: 0 }, test_fixtures: { health_check_input: {} } });
    expect(metadata.inputExample).toBeUndefined();
    expect(metadata.outputExample).toBeUndefined();
  });
  it("screens planted output personal data", () => {
    const metadata = metadataFromManifest({ ...tool, description: "tool", output_schema: { type: "object", example: { full_name: "Synthetic Person", date_of_birth: "1980-01-01" } } });
    expect(metadata.outputExample).toBeUndefined();
    expect(metadata.outputOmission).toBe("personal data field");
  });
  it.each(["test", "TeSt", "string", "example", "foo", "xxx"])("withholds nested placeholder %s in either example", value => {
    const metadata = metadataFromManifest({ ...tool, description: "tool", input_schema: {}, output_schema: { example: { nested: [value] } }, test_fixtures: { health_check_input: { nested: [value] } } });
    expect(metadata.inputOmission).toBe("placeholder example");
    expect(metadata.outputOmission).toBe("placeholder example");
  });
  it("drops whole examples over 1024 UTF-8 JSON bytes", () => {
    const value = { text: "é".repeat(512) };
    const metadata = metadataFromManifest({ ...tool, description: "tool", input_schema: {}, output_schema: { example: value }, test_fixtures: { health_check_input: value } });
    expect(metadata.inputOmission).toBe("example exceeds 1024 bytes");
    expect(metadata.outputOmission).toBe("example exceeds 1024 bytes");
  });
});
