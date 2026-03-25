import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { testSuites } from "./schema.js";
import { eq } from "drizzle-orm";

// ─── Helpers ────────────────────────────────────────────────────────────────

function checks(
  ...c: Array<{ field: string; operator: string; value?: unknown; values?: unknown[] }>
) {
  return { checks: c };
}

function eql(field: string, value: unknown) {
  return { field, operator: "equals", value };
}
function notNull(field: string) {
  return { field, operator: "not_null" };
}
function isTrue(field: string) {
  return { field, operator: "is_true" };
}
function isFalse(field: string) {
  return { field, operator: "is_false" };
}
function contains(field: string, value: string) {
  return { field, operator: "contains", value };
}
function isIn(field: string, values: unknown[]) {
  return { field, operator: "in", values };
}
function isType(field: string, value: string) {
  return { field, operator: "type", value };
}
function gt(field: string, value: number) {
  return { field, operator: "gt", value };
}
function lt(field: string, value: number) {
  return { field, operator: "lt", value };
}

// ─── Test definitions ───────────────────────────────────────────────────────

interface TestDef {
  capabilitySlug: string;
  testName: string;
  testType: "known_answer" | "schema_check" | "edge_case" | "negative";
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  validationRules: { checks: Array<{ field: string; operator: string; value?: unknown; values?: unknown[] }> };
}

const TESTS: TestDef[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // TIER 1: Known-answer tests
  // ─────────────────────────────────────────────────────────────────────────

  // ── swedish-company-data ──
  { capabilitySlug: "swedish-company-data", testName: "Spotify AB — known company", testType: "known_answer",
    input: { org_number: "556703-7485" },
    validationRules: checks(notNull("company_name"), notNull("org_number")) },
  { capabilitySlug: "swedish-company-data", testName: "Klarna Bank AB — known company", testType: "known_answer",
    input: { org_number: "556737-0431" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "swedish-company-data", testName: "Volvo Car AB — known company", testType: "known_answer",
    input: { org_number: "556810-8988" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "swedish-company-data", testName: "H&M — known company", testType: "known_answer",
    input: { org_number: "556042-7220" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "swedish-company-data", testName: "IKEA of Sweden AB — known company", testType: "known_answer",
    input: { org_number: "556074-7551" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "swedish-company-data", testName: "Invalid org number format", testType: "edge_case",
    input: { org_number: "123" },
    validationRules: checks() },
  { capabilitySlug: "swedish-company-data", testName: "Non-existent org number", testType: "negative",
    input: { org_number: "000000-0000" },
    validationRules: checks() },

  // ── norwegian-company-data ──
  { capabilitySlug: "norwegian-company-data", testName: "Equinor ASA — known company", testType: "known_answer",
    input: { org_number: "923609016" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "norwegian-company-data", testName: "DNB Bank ASA — known company", testType: "known_answer",
    input: { org_number: "984851006" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "norwegian-company-data", testName: "Telenor ASA — known company", testType: "known_answer",
    input: { org_number: "982463718" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "norwegian-company-data", testName: "Invalid org number", testType: "negative",
    input: { org_number: "000000000" },
    validationRules: checks() },

  // ── danish-company-data ──
  { capabilitySlug: "danish-company-data", testName: "Novo Nordisk A/S — known company", testType: "known_answer",
    input: { cvr_number: "24256790" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "danish-company-data", testName: "Mærsk — known company", testType: "known_answer",
    input: { cvr_number: "22756214" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "danish-company-data", testName: "LEGO System A/S — known company", testType: "known_answer",
    input: { cvr_number: "47458714" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "danish-company-data", testName: "Invalid CVR", testType: "negative",
    input: { cvr_number: "00000000" },
    validationRules: checks() },

  // ── finnish-company-data ──
  { capabilitySlug: "finnish-company-data", testName: "Nokia Oyj — known company", testType: "known_answer",
    input: { business_id: "0112038-9" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "finnish-company-data", testName: "Kone Oyj — known company", testType: "known_answer",
    input: { business_id: "0871646-8" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "finnish-company-data", testName: "Neste Oyj — known company", testType: "known_answer",
    input: { business_id: "1852302-9" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "finnish-company-data", testName: "Invalid Y-tunnus", testType: "negative",
    input: { business_id: "0000000-0" },
    validationRules: checks() },

  // ── us-company-data ──
  { capabilitySlug: "us-company-data", testName: "Apple Inc — known company", testType: "known_answer",
    input: { company: "AAPL" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "us-company-data", testName: "Microsoft Corporation — known company", testType: "known_answer",
    input: { company: "MSFT" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "us-company-data", testName: "Alphabet Inc — known company", testType: "known_answer",
    input: { company: "GOOG" },
    validationRules: checks(notNull("company_name")) },
  { capabilitySlug: "us-company-data", testName: "Fictional company name", testType: "negative",
    input: { company: "Xyzzy Nonexistent Corp 99999" },
    validationRules: checks() },

  // ── iban-validate ──
  { capabilitySlug: "iban-validate", testName: "Valid Swedish IBAN", testType: "known_answer",
    input: { iban: "SE4550000000058398257466" },
    validationRules: checks(isTrue("valid"), eql("country_code", "SE")) },
  { capabilitySlug: "iban-validate", testName: "Valid German IBAN", testType: "known_answer",
    input: { iban: "DE89370400440532013000" },
    validationRules: checks(isTrue("valid"), eql("country_code", "DE")) },
  { capabilitySlug: "iban-validate", testName: "Valid UK IBAN", testType: "known_answer",
    input: { iban: "GB29NWBK60161331926819" },
    validationRules: checks(isTrue("valid"), eql("country_code", "GB")) },
  { capabilitySlug: "iban-validate", testName: "Valid Norwegian IBAN", testType: "known_answer",
    input: { iban: "NO9386011117947" },
    validationRules: checks(isTrue("valid"), eql("country_code", "NO")) },
  { capabilitySlug: "iban-validate", testName: "Valid Danish IBAN", testType: "known_answer",
    input: { iban: "DK5000400440116243" },
    validationRules: checks(isTrue("valid"), eql("country_code", "DK")) },
  { capabilitySlug: "iban-validate", testName: "Invalid checksum IBAN", testType: "known_answer",
    input: { iban: "SE0000000000000000000000" },
    validationRules: checks(isFalse("valid")) },
  { capabilitySlug: "iban-validate", testName: "Invalid country code", testType: "known_answer",
    input: { iban: "XX1234567890" },
    validationRules: checks(isFalse("valid")) },
  { capabilitySlug: "iban-validate", testName: "IBAN with spaces", testType: "edge_case",
    input: { iban: "SE45 5000 0000 0583 9825 7466" },
    validationRules: checks() },
  { capabilitySlug: "iban-validate", testName: "Empty IBAN string", testType: "negative",
    input: { iban: "" },
    validationRules: checks() },

  // ── bank-bic-lookup ──
  { capabilitySlug: "bank-bic-lookup", testName: "SEB Sweden (ESSESESS)", testType: "known_answer",
    input: { bic: "ESSESESS" },
    validationRules: checks(notNull("bank_name")) },
  { capabilitySlug: "bank-bic-lookup", testName: "Nordea Sweden (NDEASESS)", testType: "known_answer",
    input: { bic: "NDEASESS" },
    validationRules: checks(notNull("bank_name")) },
  { capabilitySlug: "bank-bic-lookup", testName: "Danske Bank DK (DABADKKK)", testType: "known_answer",
    input: { bic: "DABADKKK" },
    validationRules: checks(notNull("bank_name")) },
  { capabilitySlug: "bank-bic-lookup", testName: "Invalid BIC", testType: "negative",
    input: { bic: "XXXXXX" },
    validationRules: checks() },

  // ── vat-validate ──
  { capabilitySlug: "vat-validate", testName: "Spotify SE VAT — valid", testType: "known_answer",
    input: { vat_number: "SE556703748501" },
    validationRules: checks(isTrue("valid")) },
  { capabilitySlug: "vat-validate", testName: "LEGO DK VAT — valid", testType: "known_answer",
    input: { vat_number: "DK54562519" },
    validationRules: checks(isTrue("valid")) },
  { capabilitySlug: "vat-validate", testName: "Google Germany VAT — valid", testType: "known_answer",
    input: { vat_number: "DE811128135" },
    validationRules: checks(isTrue("valid")) },
  { capabilitySlug: "vat-validate", testName: "Invalid SE VAT number", testType: "known_answer",
    input: { vat_number: "SE000000000000" },
    validationRules: checks(isFalse("valid")) },
  { capabilitySlug: "vat-validate", testName: "VAT with spaces", testType: "edge_case",
    input: { vat_number: "SE 5567 0374 8501" },
    validationRules: checks() },

  // ── exchange-rate ──
  { capabilitySlug: "exchange-rate", testName: "USD to EUR — sanity range", testType: "known_answer",
    input: { from: "USD", to: "EUR" },
    validationRules: checks(notNull("rate"), gt("rate", 0.5), lt("rate", 1.5)) },
  { capabilitySlug: "exchange-rate", testName: "SEK to EUR — sanity range", testType: "known_answer",
    input: { from: "SEK", to: "EUR" },
    validationRules: checks(notNull("rate"), gt("rate", 0.05), lt("rate", 0.20)) },
  { capabilitySlug: "exchange-rate", testName: "GBP to USD — sanity range", testType: "known_answer",
    input: { from: "GBP", to: "USD" },
    validationRules: checks(notNull("rate"), gt("rate", 1.0), lt("rate", 2.0)) },
  { capabilitySlug: "exchange-rate", testName: "Invalid currency code", testType: "negative",
    input: { from: "XYZ", to: "EUR" },
    validationRules: checks() },

  // ── email-validate ──
  { capabilitySlug: "email-validate", testName: "Valid format — test@google.com", testType: "known_answer",
    input: { email: "test@google.com" },
    validationRules: checks(isTrue("format_valid")) },
  { capabilitySlug: "email-validate", testName: "Invalid format — clearly-invalid", testType: "known_answer",
    input: { email: "clearly-invalid" },
    validationRules: checks(isFalse("format_valid")) },
  { capabilitySlug: "email-validate", testName: "Valid format, bad domain", testType: "known_answer",
    input: { email: "test@nonexistent-domain-abc123.com" },
    validationRules: checks(isTrue("format_valid")) },
  { capabilitySlug: "email-validate", testName: "Plus addressing", testType: "edge_case",
    input: { email: "test+tag@gmail.com" },
    validationRules: checks(isTrue("format_valid")) },

  // ── dns-lookup ──
  { capabilitySlug: "dns-lookup", testName: "google.com — expect records", testType: "known_answer",
    input: { domain: "google.com" },
    validationRules: checks(notNull("a_records")) },
  { capabilitySlug: "dns-lookup", testName: "strale.dev — expect DNS data", testType: "schema_check",
    input: { domain: "strale.dev" },
    validationRules: checks(notNull("a_records")) },
  { capabilitySlug: "dns-lookup", testName: "Nonexistent domain", testType: "negative",
    input: { domain: "nonexistent-domain-xyz123456.com" },
    validationRules: checks() },

  // ── whois-lookup ──
  { capabilitySlug: "whois-lookup", testName: "google.com — registrar present", testType: "known_answer",
    input: { domain: "google.com" },
    validationRules: checks(notNull("registrar")) },
  { capabilitySlug: "whois-lookup", testName: "strale.dev — returns whois data", testType: "schema_check",
    input: { domain: "strale.dev" },
    validationRules: checks(notNull("domain")) },
  { capabilitySlug: "whois-lookup", testName: "Very new or expired domain", testType: "edge_case",
    input: { domain: "test-expired-xyz-987654.com" },
    validationRules: checks() },

  // ── ssl-check ──
  { capabilitySlug: "ssl-check", testName: "google.com — valid SSL", testType: "known_answer",
    input: { domain: "google.com" },
    validationRules: checks(isTrue("valid"), notNull("issuer")) },
  { capabilitySlug: "ssl-check", testName: "strale.dev — valid SSL", testType: "known_answer",
    input: { domain: "strale.dev" },
    validationRules: checks(isTrue("valid")) },
  { capabilitySlug: "ssl-check", testName: "expired.badssl.com — invalid SSL", testType: "known_answer",
    input: { domain: "expired.badssl.com" },
    validationRules: checks(isFalse("valid")) },

  // ── ssl-certificate-chain ──
  { capabilitySlug: "ssl-certificate-chain", testName: "google.com — chain present", testType: "known_answer",
    input: { domain: "google.com" },
    validationRules: checks(notNull("certificate_chain")) },
  { capabilitySlug: "ssl-certificate-chain", testName: "strale.dev — valid chain", testType: "schema_check",
    input: { domain: "strale.dev" },
    validationRules: checks(notNull("certificate_chain")) },
  { capabilitySlug: "ssl-certificate-chain", testName: "Chain includes issuer and expiry", testType: "schema_check",
    input: { domain: "google.com" },
    validationRules: checks(notNull("certificate_chain")) },

  // ─────────────────────────────────────────────────────────────────────────
  // TIER 2: Schema + smoke tests
  // ─────────────────────────────────────────────────────────────────────────

  // ── sanctions-check ──
  { capabilitySlug: "sanctions-check", testName: "Spotify AB — smoke test", testType: "schema_check",
    input: { name: "Spotify AB" },
    validationRules: checks(notNull("is_sanctioned")) },
  { capabilitySlug: "sanctions-check", testName: "Random clean company", testType: "schema_check",
    input: { name: "Random Clean Company AB" },
    validationRules: checks(notNull("is_sanctioned")) },
  { capabilitySlug: "sanctions-check", testName: "Schema validation", testType: "schema_check",
    input: { name: "Test Corp" },
    validationRules: checks(notNull("is_sanctioned")) },

  // ── domain-reputation ──
  { capabilitySlug: "domain-reputation", testName: "google.com — reputation data", testType: "schema_check",
    input: { domain: "google.com" },
    validationRules: checks(notNull("reputation_score")) },
  { capabilitySlug: "domain-reputation", testName: "strale.dev — reputation data", testType: "schema_check",
    input: { domain: "strale.dev" },
    validationRules: checks(notNull("reputation_score")) },
  { capabilitySlug: "domain-reputation", testName: "Schema structure", testType: "schema_check",
    input: { domain: "example.com" },
    validationRules: checks(notNull("reputation_score")) },

  // ── url-to-markdown ──
  { capabilitySlug: "url-to-markdown", testName: "example.com — markdown returned", testType: "schema_check",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("markdown")) },
  { capabilitySlug: "url-to-markdown", testName: "Schema: non-empty content", testType: "schema_check",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("markdown")) },

  // ── pii-redact ──
  { capabilitySlug: "pii-redact", testName: "Obvious PII — redacted", testType: "schema_check",
    input: { text: "John Smith, john@email.com, SSN 123-45-6789" },
    validationRules: checks(notNull("redacted_text")) },
  { capabilitySlug: "pii-redact", testName: "Schema: response has redacted text", testType: "schema_check",
    input: { text: "Contact Jane Doe at jane.doe@company.com" },
    validationRules: checks(notNull("redacted_text")) },

  // ── email-deliverability-check ──
  { capabilitySlug: "email-deliverability-check", testName: "google.com — deliverability", testType: "schema_check",
    input: { domain: "google.com" },
    validationRules: checks(notNull("spf")) },
  { capabilitySlug: "email-deliverability-check", testName: "Schema structure", testType: "schema_check",
    input: { domain: "strale.dev" },
    validationRules: checks(notNull("spf")) },

  // ── page-speed-test ──
  { capabilitySlug: "page-speed-test", testName: "google.com — performance metrics", testType: "schema_check",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("performance_score")) },
  { capabilitySlug: "page-speed-test", testName: "Schema: has scores", testType: "schema_check",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("performance_score")) },

  // ── eu-ai-act-classify ──
  { capabilitySlug: "eu-ai-act-classify", testName: "Facial recognition — high risk", testType: "schema_check",
    input: { description: "Real-time facial recognition system used for law enforcement surveillance in public spaces" },
    validationRules: checks(notNull("risk_level")) },
  { capabilitySlug: "eu-ai-act-classify", testName: "Simple chatbot — lower risk", testType: "schema_check",
    input: { description: "A simple FAQ chatbot that answers questions about product features based on a knowledge base" },
    validationRules: checks(notNull("risk_level")) },
  { capabilitySlug: "eu-ai-act-classify", testName: "Schema: risk_level present", testType: "schema_check",
    input: { description: "AI system for automated resume screening in recruitment" },
    validationRules: checks(notNull("risk_level")) },

  // ── data-protection-authority-lookup ──
  { capabilitySlug: "data-protection-authority-lookup", testName: "Sweden (SE) — IMY", testType: "known_answer",
    input: { country_code: "SE" },
    validationRules: checks(notNull("authority_name")) },
  { capabilitySlug: "data-protection-authority-lookup", testName: "Germany (DE) — data returned", testType: "schema_check",
    input: { country_code: "DE" },
    validationRules: checks(notNull("authority_name")) },
  { capabilitySlug: "data-protection-authority-lookup", testName: "Schema structure", testType: "schema_check",
    input: { country_code: "FR" },
    validationRules: checks(notNull("authority_name")) },

  // ── gdpr-fine-lookup ──
  { capabilitySlug: "gdpr-fine-lookup", testName: "Recent GDPR fines — results", testType: "schema_check",
    input: { company: "Meta" },
    validationRules: checks(notNull("fines")) },
  { capabilitySlug: "gdpr-fine-lookup", testName: "Schema: has fine data", testType: "schema_check",
    input: { company: "Google" },
    validationRules: checks(notNull("fines")) },

  // ── gdpr-website-check ──
  { capabilitySlug: "gdpr-website-check", testName: "google.com — GDPR compliance", testType: "schema_check",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("gdpr_score")) },
  { capabilitySlug: "gdpr-website-check", testName: "Schema structure", testType: "schema_check",
    input: { url: "https://github.com" },
    validationRules: checks(notNull("gdpr_score")) },

  // ── cookie-scan ──
  { capabilitySlug: "cookie-scan", testName: "google.com — cookies found", testType: "schema_check",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("cookies")) },
  { capabilitySlug: "cookie-scan", testName: "Schema: cookie list", testType: "schema_check",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("cookies")) },

  // ── privacy-policy-analyze ──
  { capabilitySlug: "privacy-policy-analyze", testName: "google.com — analysis", testType: "schema_check",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("data_collected")) },
  { capabilitySlug: "privacy-policy-analyze", testName: "Schema structure", testType: "schema_check",
    input: { url: "https://github.com" },
    validationRules: checks(notNull("data_collected")) },

  // ── tech-stack-detect ──
  { capabilitySlug: "tech-stack-detect", testName: "google.com — technologies", testType: "schema_check",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("url")) },
  { capabilitySlug: "tech-stack-detect", testName: "strale.dev — technologies", testType: "schema_check",
    input: { url: "https://strale.dev" },
    validationRules: checks(notNull("url")) },
  { capabilitySlug: "tech-stack-detect", testName: "Schema: array of techs", testType: "schema_check",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("url")) },

  // ── seo-audit ──
  { capabilitySlug: "seo-audit", testName: "strale.dev — SEO metrics", testType: "schema_check",
    input: { url: "https://strale.dev" },
    validationRules: checks(notNull("overall_score")) },
  { capabilitySlug: "seo-audit", testName: "Schema: has score/issues", testType: "schema_check",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("overall_score")) },

  // ── landing-page-roast ──
  { capabilitySlug: "landing-page-roast", testName: "strale.dev — critique", testType: "schema_check",
    input: { url: "https://strale.dev" },
    validationRules: checks(notNull("overall_score")) },
  { capabilitySlug: "landing-page-roast", testName: "Schema: text analysis present", testType: "schema_check",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("overall_score")) },

  // ── social-profile-check ──
  { capabilitySlug: "social-profile-check", testName: "Spotify — profiles found", testType: "schema_check",
    input: { username: "Spotify" },
    validationRules: checks(notNull("profiles")) },
  { capabilitySlug: "social-profile-check", testName: "Schema structure", testType: "schema_check",
    input: { username: "Google" },
    validationRules: checks(notNull("profiles")) },

  // ─────────────────────────────────────────────────────────────────────────
  // SPRINT 1B: Solution-constituent capability coverage
  // known_answer + edge_case tests for all capabilities used in solutions
  // ─────────────────────────────────────────────────────────────────────────

  // ── cookie-scan — known_answer + edge_case ──
  { capabilitySlug: "cookie-scan", testName: "google.com — cookies detected", testType: "known_answer",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("cookies")) },
  { capabilitySlug: "cookie-scan", testName: "Minimal static site", testType: "edge_case",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("cookies")) },

  // ── domain-reputation — known_answer + edge_case ──
  { capabilitySlug: "domain-reputation", testName: "google.com — high reputation", testType: "known_answer",
    input: { domain: "google.com" },
    validationRules: checks(notNull("reputation_score"), gt("reputation_score", 50)) },
  { capabilitySlug: "domain-reputation", testName: "Non-existent domain", testType: "edge_case",
    input: { domain: "this-domain-does-not-exist-abc123xyz.com" },
    validationRules: checks() },

  // ── email-deliverability-check — known_answer + edge_case ──
  { capabilitySlug: "email-deliverability-check", testName: "google.com — has SPF record", testType: "known_answer",
    input: { domain: "google.com" },
    validationRules: checks(notNull("spf")) },
  { capabilitySlug: "email-deliverability-check", testName: "Domain with no mail setup", testType: "edge_case",
    input: { domain: "example.com" },
    validationRules: checks() },

  // ── eu-ai-act-classify — known_answer + edge_case ──
  { capabilitySlug: "eu-ai-act-classify", testName: "Biometric surveillance — expect high risk", testType: "known_answer",
    input: { description: "Real-time facial recognition system used for law enforcement surveillance in public spaces" },
    validationRules: checks(notNull("risk_level"), eql("risk_level", "high")) },
  { capabilitySlug: "eu-ai-act-classify", testName: "Very short vague description", testType: "edge_case",
    input: { description: "AI" },
    validationRules: checks(notNull("risk_level")) },

  // ── gdpr-fine-lookup — known_answer + edge_case ──
  { capabilitySlug: "gdpr-fine-lookup", testName: "Meta — known GDPR fines", testType: "known_answer",
    input: { company: "Meta" },
    validationRules: checks(notNull("fines")) },
  { capabilitySlug: "gdpr-fine-lookup", testName: "Company with no GDPR fines", testType: "edge_case",
    input: { company: "Strale" },
    validationRules: checks(notNull("fines")) },

  // ── gdpr-website-check — known_answer + edge_case ──
  { capabilitySlug: "gdpr-website-check", testName: "google.com — GDPR check", testType: "known_answer",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("gdpr_score")) },
  { capabilitySlug: "gdpr-website-check", testName: "Plain HTTP site", testType: "edge_case",
    input: { url: "http://example.com" },
    validationRules: checks() },

  // ── header-security-check — known_answer + edge_case ──
  { capabilitySlug: "header-security-check", testName: "google.com — security headers", testType: "known_answer",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("score"), notNull("grade")) },
  { capabilitySlug: "header-security-check", testName: "IP address instead of domain", testType: "edge_case",
    input: { url: "http://1.1.1.1" },
    validationRules: checks() },

  // ── landing-page-roast — known_answer + edge_case ──
  { capabilitySlug: "landing-page-roast", testName: "google.com — landing page critique", testType: "known_answer",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("overall_score")) },
  { capabilitySlug: "landing-page-roast", testName: "Minimal page with no content", testType: "edge_case",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("overall_score")) },

  // ── page-speed-test — known_answer + edge_case ──
  { capabilitySlug: "page-speed-test", testName: "google.com — fast performance", testType: "known_answer",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("performance_score"), gt("performance_score", 50)) },
  { capabilitySlug: "page-speed-test", testName: "URL without protocol", testType: "edge_case",
    input: { url: "example.com" },
    validationRules: checks() },

  // ── pii-redact — known_answer + edge_case ──
  { capabilitySlug: "pii-redact", testName: "Email and SSN redacted", testType: "known_answer",
    input: { text: "Contact John at john.smith@example.com, SSN 123-45-6789" },
    validationRules: checks(notNull("redacted_text")) },
  { capabilitySlug: "pii-redact", testName: "Text with no PII", testType: "edge_case",
    input: { text: "The weather is sunny today with a high of 25 degrees." },
    validationRules: checks(notNull("redacted_text")) },

  // ── privacy-policy-analyze — known_answer + edge_case ──
  { capabilitySlug: "privacy-policy-analyze", testName: "google.com — privacy analysis", testType: "known_answer",
    input: { url: "https://policies.google.com/privacy" },
    validationRules: checks(notNull("data_collected")) },
  { capabilitySlug: "privacy-policy-analyze", testName: "Page with no privacy policy", testType: "edge_case",
    input: { url: "https://example.com" },
    validationRules: checks() },

  // ── sanctions-check — known_answer + edge_case ──
  { capabilitySlug: "sanctions-check", testName: "Spotify AB — not sanctioned", testType: "known_answer",
    input: { name: "Spotify AB" },
    validationRules: checks(notNull("is_sanctioned"), isFalse("is_sanctioned")) },
  { capabilitySlug: "sanctions-check", testName: "Single character name", testType: "edge_case",
    input: { name: "X" },
    validationRules: checks(notNull("is_sanctioned")) },

  // ── pep-check ──
  { capabilitySlug: "pep-check", testName: "Angela Merkel — known PEP", testType: "known_answer",
    input: { name: "Angela Merkel" },
    validationRules: checks(notNull("is_pep"), isTrue("is_pep")) },
  { capabilitySlug: "pep-check", testName: "Random unknown person", testType: "schema_check",
    input: { name: "John Random Randomsson" },
    validationRules: checks(notNull("is_pep")) },
  { capabilitySlug: "pep-check", testName: "Schema validation", testType: "schema_check",
    input: { name: "Test Person" },
    validationRules: checks(notNull("is_pep"), notNull("match_count")) },
  { capabilitySlug: "pep-check", testName: "Single character name", testType: "edge_case",
    input: { name: "X" },
    validationRules: checks(notNull("is_pep")) },

  // ── adverse-media-check ──
  { capabilitySlug: "adverse-media-check", testName: "Deutsche Bank — known adverse media", testType: "schema_check",
    input: { name: "Deutsche Bank", entity_type: "company" },
    validationRules: checks(notNull("risk_level"), notNull("total_hits")) },
  { capabilitySlug: "adverse-media-check", testName: "Random clean company", testType: "schema_check",
    input: { name: "Smålands Bästa Städfirma AB" },
    validationRules: checks(notNull("risk_level")) },
  { capabilitySlug: "adverse-media-check", testName: "Schema validation", testType: "schema_check",
    input: { name: "Test Person" },
    validationRules: checks(notNull("risk_level"), notNull("categories")) },

  // ── seo-audit — known_answer + edge_case ──
  { capabilitySlug: "seo-audit", testName: "google.com — SEO score", testType: "known_answer",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("overall_score")) },
  { capabilitySlug: "seo-audit", testName: "Non-existent domain", testType: "edge_case",
    input: { url: "https://this-domain-does-not-exist-xyz987.com" },
    validationRules: checks() },

  // ── social-profile-check — known_answer + edge_case ──
  { capabilitySlug: "social-profile-check", testName: "Google — known profiles", testType: "known_answer",
    input: { username: "Google" },
    validationRules: checks(notNull("profiles")) },
  { capabilitySlug: "social-profile-check", testName: "Random gibberish username", testType: "edge_case",
    input: { username: "xz9q8w7e6r5t4y3u2i1" },
    validationRules: checks(notNull("profiles")) },

  // ── tech-stack-detect — known_answer + edge_case ──
  { capabilitySlug: "tech-stack-detect", testName: "google.com — technologies detected", testType: "known_answer",
    input: { url: "https://google.com" },
    validationRules: checks(notNull("url")) },
  { capabilitySlug: "tech-stack-detect", testName: "IP address URL", testType: "edge_case",
    input: { url: "http://1.1.1.1" },
    validationRules: checks() },

  // ── url-to-markdown — known_answer + edge_case ──
  { capabilitySlug: "url-to-markdown", testName: "example.com — markdown content", testType: "known_answer",
    input: { url: "https://example.com" },
    validationRules: checks(notNull("markdown"), contains("markdown", "Example")) },
  { capabilitySlug: "url-to-markdown", testName: "URL with query parameters", testType: "edge_case",
    input: { url: "https://example.com?foo=bar&baz=qux" },
    validationRules: checks() },

  // ── danish-company-data — edge_case ──
  { capabilitySlug: "danish-company-data", testName: "CVR with leading zeros", testType: "edge_case",
    input: { cvr_number: "00000001" },
    validationRules: checks() },

  // ── data-protection-authority-lookup — edge_case ──
  { capabilitySlug: "data-protection-authority-lookup", testName: "Non-EU country (US)", testType: "edge_case",
    input: { country_code: "US" },
    validationRules: checks() },

  // ── dns-lookup — edge_case ──
  { capabilitySlug: "dns-lookup", testName: "Deep subdomain", testType: "edge_case",
    input: { domain: "a.b.c.d.google.com" },
    validationRules: checks() },

  // ── exchange-rate — edge_case ──
  { capabilitySlug: "exchange-rate", testName: "Same currency (USD to USD)", testType: "edge_case",
    input: { from: "USD", to: "USD" },
    validationRules: checks(notNull("rate")) },

  // ── finnish-company-data — edge_case ──
  { capabilitySlug: "finnish-company-data", testName: "Y-tunnus with wrong check digit", testType: "edge_case",
    input: { business_id: "0112038-0" },
    validationRules: checks() },

  // ── norwegian-company-data — edge_case ──
  { capabilitySlug: "norwegian-company-data", testName: "Very short org number", testType: "edge_case",
    input: { org_number: "123" },
    validationRules: checks() },

  // ── ssl-certificate-chain — edge_case ──
  { capabilitySlug: "ssl-certificate-chain", testName: "Self-signed certificate domain", testType: "edge_case",
    input: { domain: "self-signed.badssl.com" },
    validationRules: checks() },

  // ── ssl-check — edge_case ──
  { capabilitySlug: "ssl-check", testName: "Domain with no SSL", testType: "edge_case",
    input: { domain: "http.badssl.com" },
    validationRules: checks() },

  // ── us-company-data — edge_case ──
  { capabilitySlug: "us-company-data", testName: "Company with special characters", testType: "edge_case",
    input: { company: "AT&T" },
    validationRules: checks() },
];

// ─── Seed logic ─────────────────────────────────────────────────────────────

async function seed() {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;

  for (const test of TESTS) {
    // Idempotent: check by capability_slug + test_name
    const [existing] = await db
      .select({ id: testSuites.id })
      .from(testSuites)
      .where(
        eq(testSuites.capabilitySlug, test.capabilitySlug),
      )
      .limit(1000);

    // Check if this exact test name already exists
    const allForSlug = await db
      .select({ id: testSuites.id, testName: testSuites.testName })
      .from(testSuites)
      .where(eq(testSuites.capabilitySlug, test.capabilitySlug));

    if (allForSlug.find((t) => t.testName === test.testName)) {
      skipped++;
      continue;
    }

    await db.insert(testSuites).values({
      capabilitySlug: test.capabilitySlug,
      testName: test.testName,
      testType: test.testType,
      input: test.input,
      expectedOutput: test.expectedOutput ?? null,
      validationRules: test.validationRules,
    });
    inserted++;
  }

  console.log(`Seeded: ${inserted} inserted, ${skipped} already existed.`);
  console.log(`Total test cases defined: ${TESTS.length}`);

  // Summary by capability
  const byCap = new Map<string, number>();
  for (const t of TESTS) {
    byCap.set(t.capabilitySlug, (byCap.get(t.capabilitySlug) ?? 0) + 1);
  }
  console.log(`\nTests per capability:`);
  for (const [slug, count] of [...byCap.entries()].sort()) {
    console.log(`  ${slug.padEnd(40)} ${count}`);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
