/** Editorial landing-page content. Names, prices and availability still come from the catalogue. */
interface ToolPage {
  title: string;
  description: string;
  intro: string;
  example: { input: Record<string, string>; output: Record<string, unknown>; note: string; selected?: boolean };
  uses: string[];
  results: { label: string; explanation: string }[];
  /** Display corrections verified against the executor; do not change the API contract. */
  outputOverrides?: Record<string, { type?: string; appears?: string }>;
  guide: { href: string; label: string };
}

export const toolPages: Partial<Record<string, ToolPage>> = {
  "dns-lookup": {
    title: "DNS Lookup API — DNS records, SPF and DMARC",
    description: "Look up A, AAAA, MX, TXT, CNAME and NS records as JSON with Strale’s DNS lookup API. Check SPF and DMARC presence. Try it in your browser without a key.",
    intro: "Strale’s DNS lookup API returns a domain’s DNS records as JSON for your app or AI agent. Read its IP addresses, mail servers and nameservers, and check whether SPF and DMARC records are present.",
    example: {
      input: { domain: "strale.io" },
      output: {
        domain: "strale.io",
        a_records: ["172.67.181.122", "104.21.35.241"],
        mx_records: [{ priority: 0, exchange: "strale-io.mail.protection.outlook.com" }],
        has_spf: true,
        has_dmarc: true,
      },
      selected: true,
      note: "Selected output fields from a real lookup on 10 November 2026. DNS records can change; run the tool below for a fresh result. The full response also includes AAAA, TXT, CNAME and NS records and the DMARC record.",
    },
    uses: [
      "Check A and AAAA records when investigating where a domain points.",
      "Read MX records to see which servers handle a domain’s email.",
      "Check for SPF and DMARC before investigating email authentication. Their presence alone does not prove that the policies are correct or that mail will be delivered.",
    ],
    results: [
      { label: "Records returned", explanation: "Use the record arrays in your workflow. An empty array means no records of that type were returned; it is not a full diagnosis of the domain." },
      { label: "Lookup fails", explanation: "Check the domain spelling and try again. An error or missing record is not evidence that a company is untrustworthy." },
    ],
    guide: { href: "/guides/dns-lookup-agent-python", label: "Run DNS lookups from Python" },
  },
  "eori-validate": {
    title: "EORI Validation API — check EU EORI numbers",
    description: "Validate an EORI number against the EU register with Strale’s API. Get validity and available trader details as JSON for customs and supplier onboarding.",
    intro: "Check an Economic Operators Registration and Identification (EORI) number against the European Commission’s validation service. Strale returns the result as JSON, with trader details when the register provides them, so your app or AI agent can use it in a customs or supplier-onboarding workflow.",
    example: {
      input: { eori: "SE5560125790" },
      output: {
        valid: true,
        eori_number: "SE5560125790",
        country_code: "SE",
        trader_name: "Aktiebolaget Volvo",
        trader_address: "AB Volvo",
        street: null,
        city: "GÖTEBORG",
        postal_code: "40508",
        country: "Sweden",
      },
      note: "Recorded from the EU service on 10 November 2026. Registration details can change. A valid result can still have missing name or address fields.",
    },
    uses: [
      "Check a supplier’s EORI number during onboarding and send missing or invalid registrations for follow-up.",
      "Validate an EORI number before preparing customs paperwork. This checks the registration; it does not determine whether a shipment meets every customs requirement.",
    ],
    results: [
      { label: "valid: true", explanation: "The EU service returned a valid registration. Read the trader details where available; fields can be null." },
      { label: "valid: false", explanation: "The number failed the format check or the EU service did not confirm a valid registration. Check the number with the supplier and correct any typing errors before retrying." },
      { label: "valid: null", explanation: "The EU service was unavailable, so the registration has not been verified. Retry later. A format_valid value of true only confirms the syntax; do not treat it as a valid registration." },
    ],
    outputOverrides: {
      valid: { type: "boolean or null" },
      trader_name: { type: "string or null", appears: "May be null; omitted when the input format is invalid" },
    },
    guide: { href: "/guides/eori-number-validation-agent", label: "Add EORI validation to a Python agent" },
  },
};
