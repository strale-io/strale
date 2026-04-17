import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * MF ČR — Unreliable VAT payer + published bank accounts lookup.
 *
 * Critical for Czech invoice verification: under §109 of the CZ VAT Act,
 * the purchaser can become jointly liable for VAT if they pay an unreliable
 * payer, or pay to a bank account the payer has not registered as published.
 *
 * Source: SOAP web service "rozhraniCRPDPH" (Czech Ministry of Finance).
 * Auth: none. Free. No known rate limit.
 */

const MFCR_SOAP_ENDPOINT =
  "https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP";

function buildRequest(dic: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://adis.mfcr.cz/rozhraniCRPDPH/">
  <soapenv:Body>
    <tns:StatusNespolehlivyPlatceRozsirenyRequest>
      <tns:dic>${dic}</tns:dic>
    </tns:StatusNespolehlivyPlatceRozsirenyRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function normalizeDic(raw: string): string | null {
  const cleaned = raw.replace(/[\s.-]/g, "").toUpperCase();
  const m = cleaned.match(/^(CZ)?(\d{8,10})$/);
  if (!m) return null;
  return m[2];
}

type PublishedAccount = {
  published_at: string;
  account_number: string;
  bank_code: string | null;
  is_standard: boolean;
};

function parseResponse(xml: string): {
  dic: string | null;
  is_unreliable_payer: boolean | null;
  status_not_registered: boolean;
  financial_office_code: string | null;
  response_generated_at: string | null;
  published_accounts: PublishedAccount[];
  raw_fault: string | null;
} {
  const fault = xml.match(/<(?:soapenv:)?Fault[^>]*>([\s\S]*?)<\/(?:soapenv:)?Fault>/);
  if (fault) {
    return {
      dic: null,
      is_unreliable_payer: null,
      status_not_registered: false,
      financial_office_code: null,
      response_generated_at: null,
      published_accounts: [],
      raw_fault: fault[1].trim(),
    };
  }

  const statusCode = xml.match(/statusCode="(\d+)"/)?.[1];
  if (statusCode && statusCode !== "0") {
    const statusText = xml.match(/statusText="([^"]+)"/)?.[1] ?? "Unknown status";
    return {
      dic: null,
      is_unreliable_payer: null,
      status_not_registered: false,
      financial_office_code: null,
      response_generated_at: null,
      published_accounts: [],
      raw_fault: `statusCode=${statusCode}: ${statusText}`,
    };
  }

  const generated = xml.match(/odpovedGenerovana="([^"]+)"/)?.[1] ?? null;

  // No statusPlatceDPH element at all → DIČ not registered as VAT payer
  const hasPlatceBlock = /<statusPlatceDPH[^/>]*/.test(xml);
  if (!hasPlatceBlock) {
    return {
      dic: null,
      is_unreliable_payer: null,
      status_not_registered: true,
      financial_office_code: null,
      response_generated_at: generated,
      published_accounts: [],
      raw_fault: null,
    };
  }

  const dic = xml.match(/<statusPlatceDPH[^>]*\bdic="([^"]+)"/)?.[1] ?? null;
  const nespolehlivy = xml.match(/\bnespolehlivyPlatce="([^"]+)"/)?.[1];
  const isUnreliable =
    nespolehlivy === "ANO" ? true : nespolehlivy === "NE" ? false : null;
  const fu = xml.match(/\bcisloFu="([^"]+)"/)?.[1] ?? null;

  const accounts: PublishedAccount[] = [];
  const accountRegex = /<ucet\s+datumZverejneni="([^"]+)">([\s\S]*?)<\/ucet>/g;
  for (const m of xml.matchAll(accountRegex)) {
    const publishedAt = m[1];
    const body = m[2];
    const std = body.match(/<standardniUcet\s+cislo="([^"]+)"\s+kodBanky="([^"]+)"/);
    if (std) {
      accounts.push({
        published_at: publishedAt,
        account_number: std[1],
        bank_code: std[2],
        is_standard: true,
      });
      continue;
    }
    const nstd = body.match(/<nestandardniUcet\s+cislo="([^"]+)"/);
    if (nstd) {
      accounts.push({
        published_at: publishedAt,
        account_number: nstd[1],
        bank_code: null,
        is_standard: false,
      });
    }
  }

  return {
    dic,
    is_unreliable_payer: isUnreliable,
    status_not_registered: false,
    financial_office_code: fu,
    response_generated_at: generated,
    published_accounts: accounts,
    raw_fault: null,
  };
}

registerCapability("cz-unreliable-vat-payer", async (input: CapabilityInput) => {
  const raw = (input.dic as string) ?? (input.ico as string) ?? (input.vat_id as string) ?? "";
  if (!raw || !raw.trim()) {
    throw new Error("'dic' is required. Provide a Czech DIČ (CZ + 8-10 digits) or bare IČO (8 digits).");
  }

  const dic = normalizeDic(raw);
  if (!dic) {
    throw new Error(`'${raw}' is not a valid Czech DIČ format (expected 'CZ' + 8-10 digits, or bare IČO).`);
  }

  const resp = await fetch(MFCR_SOAP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://adis.mfcr.cz/rozhraniCRPDPH/getStatusNespolehlivyPlatceRozsireny"',
    },
    body: buildRequest(dic),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new Error(`MF ČR unreliable-VAT SOAP returned HTTP ${resp.status}`);
  }

  const xml = await resp.text();
  const parsed = parseResponse(xml);

  if (parsed.raw_fault) {
    throw new Error(`MF ČR SOAP fault: ${parsed.raw_fault}`);
  }

  if (parsed.status_not_registered) {
    return {
      output: {
        input_dic: dic,
        is_registered_vat_payer: false,
        is_unreliable_payer: null,
        financial_office_code: null,
        published_accounts: [],
        published_account_count: 0,
        response_generated_at: parsed.response_generated_at,
        joint_liability_risk:
          "DIČ is NOT registered as a VAT payer in the Czech VAT register. Treat as non-VAT-registered for invoice handling.",
      },
      provenance: {
        source: "MF ČR rozhraniCRPDPH SOAP",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  const jointLiability = parsed.is_unreliable_payer
    ? "HIGH RISK: Payer is flagged unreliable. Under §109 of the CZ VAT Act, the purchaser may become jointly liable for unpaid VAT."
    : parsed.published_accounts.length === 0
      ? "MEDIUM: Payer is reliable but has no published bank accounts. Paying to any account creates joint-liability risk under §109."
      : "LOW: Payer is reliable. Pay only to one of the published accounts to avoid §109 joint liability.";

  return {
    output: {
      input_dic: dic,
      dic: parsed.dic,
      is_registered_vat_payer: true,
      is_unreliable_payer: parsed.is_unreliable_payer,
      financial_office_code: parsed.financial_office_code,
      published_accounts: parsed.published_accounts,
      published_account_count: parsed.published_accounts.length,
      response_generated_at: parsed.response_generated_at,
      joint_liability_risk: jointLiability,
    },
    provenance: {
      source: "MF ČR rozhraniCRPDPH SOAP",
      fetched_at: new Date().toISOString(),
    },
  };
});
