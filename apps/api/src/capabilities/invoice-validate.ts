import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Invoice validation — pure algorithmic, no external API ─────────────────

// EU VAT number format patterns (2-letter prefix + digits/chars)
const VAT_PATTERNS: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE[01]\d{9}$/,
  BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  EL: /^EL\d{9}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  HR: /^HR\d{11}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE(\d{7}[A-Z]{1,2}|\d[A-Z+*]\d{5}[A-Z])$/,
  IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/,
  SI: /^SI\d{8}$/,
  SK: /^SK\d{10}$/,
  GB: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
  CH: /^CHE\d{9}(MWST|TVA|IVA)$/,
  NO: /^NO\d{9}MVA$/,
};

function validateVatFormat(vat: string): boolean {
  if (!vat || typeof vat !== "string") return false;
  const cleaned = vat.trim().toUpperCase().replace(/[\s.-]/g, "");
  // Extract country prefix (2 letters, or 3 for CHE)
  const countryMatch = cleaned.match(/^([A-Z]{2,3})/);
  if (!countryMatch) return false;
  let key = countryMatch[1].slice(0, 2);
  if (cleaned.startsWith("CHE")) key = "CH";
  const pattern = VAT_PATTERNS[key];
  if (!pattern) return false;
  return pattern.test(cleaned);
}

interface LineItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  [key: string]: unknown;
}

interface InvoiceAmounts {
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  total?: number;
  [key: string]: unknown;
}

interface InvoiceData {
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  vendor_vat?: string;
  vendor_name?: string;
  vendor_address?: string;
  buyer_vat?: string;
  buyer_name?: string;
  buyer_address?: string;
  line_items?: LineItem[];
  amounts?: InvoiceAmounts;
  currency?: string;
  [key: string]: unknown;
}

// EU invoice required fields per directive 2006/112/EC
const EU_REQUIRED_FIELDS = [
  "invoice_number",
  "invoice_date",
  "vendor_vat",
  "vendor_name",
  "vendor_address",
  "line_items",
  "amounts",
] as const;

const EU_RECOMMENDED_FIELDS = [
  "buyer_name",
  "buyer_vat",
  "buyer_address",
  "due_date",
  "currency",
] as const;

registerCapability("invoice-validate", async (input: CapabilityInput) => {
  // Parse invoice data from various input sources
  let invoiceData: InvoiceData;
  const rawData = input.invoice ?? input.data ?? input.task;

  if (!rawData) {
    throw new Error(
      "'invoice' or 'data' is required. Provide invoice data as a JSON object with fields: vendor_vat, buyer_vat, amounts, line_items.",
    );
  }

  if (typeof rawData === "string") {
    try {
      invoiceData = JSON.parse(rawData.trim()) as InvoiceData;
    } catch {
      throw new Error(
        "Failed to parse invoice data as JSON. Provide a valid JSON object.",
      );
    }
  } else if (typeof rawData === "object" && rawData !== null) {
    invoiceData = rawData as InvoiceData;
  } else {
    throw new Error("Invoice data must be a JSON object or JSON string.");
  }

  const errors: { field: string; issue: string }[] = [];
  const warnings: { field: string; issue: string }[] = [];

  // ── 1. Required fields check for EU compliance ──
  for (const field of EU_REQUIRED_FIELDS) {
    const value = invoiceData[field];
    if (value === undefined || value === null || value === "") {
      errors.push({ field, issue: `Required field '${field}' is missing.` });
    }
  }

  for (const field of EU_RECOMMENDED_FIELDS) {
    const value = invoiceData[field];
    if (value === undefined || value === null || value === "") {
      warnings.push({
        field,
        issue: `Recommended field '${field}' is missing for full EU compliance.`,
      });
    }
  }

  // ── 2. VAT number format checks ──
  if (invoiceData.vendor_vat) {
    if (!validateVatFormat(invoiceData.vendor_vat)) {
      errors.push({
        field: "vendor_vat",
        issue: `Invalid VAT number format: '${invoiceData.vendor_vat}'. Expected EU format with 2-letter country prefix.`,
      });
    }
  }

  if (invoiceData.buyer_vat) {
    if (!validateVatFormat(invoiceData.buyer_vat)) {
      errors.push({
        field: "buyer_vat",
        issue: `Invalid VAT number format: '${invoiceData.buyer_vat}'. Expected EU format with 2-letter country prefix.`,
      });
    }
  }

  // ── 3. Line item math validation ──
  const lineItems = invoiceData.line_items ?? [];
  let lineItemsPassed = 0;
  let lineItemsFailed = 0;
  let computedSubtotal = 0;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const qty = item.quantity;
    const unitPrice = item.unit_price;
    const lineTotal = item.line_total;

    if (qty !== undefined && unitPrice !== undefined && lineTotal !== undefined) {
      const expected = Math.round(qty * unitPrice * 100) / 100;
      const actual = Math.round(lineTotal * 100) / 100;
      if (Math.abs(expected - actual) > 0.01) {
        errors.push({
          field: `line_items[${i}].line_total`,
          issue: `Line total mismatch: quantity(${qty}) x unit_price(${unitPrice}) = ${expected}, but line_total is ${actual}.`,
        });
        lineItemsFailed++;
      } else {
        lineItemsPassed++;
      }
      computedSubtotal += actual;
    } else if (lineTotal !== undefined) {
      // No qty/unit_price to verify, but we can still accumulate
      computedSubtotal += Math.round(lineTotal * 100) / 100;
      warnings.push({
        field: `line_items[${i}]`,
        issue: "Missing quantity or unit_price; cannot verify line_total calculation.",
      });
    } else {
      warnings.push({
        field: `line_items[${i}]`,
        issue: "Missing line_total; cannot verify line item math.",
      });
    }
  }

  computedSubtotal = Math.round(computedSubtotal * 100) / 100;

  // ── 4. Subtotal check ──
  const amounts = invoiceData.amounts ?? ({} as InvoiceAmounts);
  if (amounts.subtotal !== undefined && lineItems.length > 0) {
    const actualSubtotal = Math.round(amounts.subtotal * 100) / 100;
    if (Math.abs(computedSubtotal - actualSubtotal) > 0.01) {
      errors.push({
        field: "amounts.subtotal",
        issue: `Subtotal mismatch: sum of line totals = ${computedSubtotal}, but subtotal is ${actualSubtotal}.`,
      });
    }
  }

  // ── 5. Tax amount check ──
  const subtotalForTax = amounts.subtotal ?? computedSubtotal;
  const taxRate = amounts.tax_rate;
  const taxAmount = amounts.tax_amount;
  let expectedTax: number | null = null;
  let taxDifference: number | null = null;
  let taxPass = true;

  if (taxRate !== undefined && taxAmount !== undefined && subtotalForTax > 0) {
    expectedTax = Math.round(subtotalForTax * taxRate * 100) / 100;
    const actualTax = Math.round(taxAmount * 100) / 100;
    taxDifference = Math.round(Math.abs(expectedTax - actualTax) * 100) / 100;
    taxPass = taxDifference <= 0.01;
    if (!taxPass) {
      errors.push({
        field: "amounts.tax_amount",
        issue: `Tax amount mismatch: subtotal(${subtotalForTax}) x tax_rate(${taxRate}) = ${expectedTax}, but tax_amount is ${actualTax} (difference: ${taxDifference}).`,
      });
    }
  }

  // ── 6. Total check ──
  if (amounts.total !== undefined) {
    const expectedTotal =
      Math.round(
        ((amounts.subtotal ?? computedSubtotal) + (amounts.tax_amount ?? 0)) *
          100,
      ) / 100;
    const actualTotal = Math.round(amounts.total * 100) / 100;
    if (Math.abs(expectedTotal - actualTotal) > 0.01) {
      errors.push({
        field: "amounts.total",
        issue: `Total mismatch: subtotal(${amounts.subtotal ?? computedSubtotal}) + tax_amount(${amounts.tax_amount ?? 0}) = ${expectedTotal}, but total is ${actualTotal}.`,
      });
    }
  }

  // ── 7. Additional format checks ──
  if (invoiceData.invoice_date) {
    const dateStr = String(invoiceData.invoice_date);
    // Accept ISO 8601 dates and common formats
    if (
      !/^\d{4}-\d{2}-\d{2}/.test(dateStr) &&
      !/^\d{2}[./-]\d{2}[./-]\d{4}/.test(dateStr)
    ) {
      warnings.push({
        field: "invoice_date",
        issue: `Date format '${dateStr}' may not be standard. Prefer ISO 8601 (YYYY-MM-DD).`,
      });
    }
  }

  if (invoiceData.currency) {
    const cur = String(invoiceData.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) {
      warnings.push({
        field: "currency",
        issue: `Currency '${invoiceData.currency}' is not a valid ISO 4217 code.`,
      });
    }
  }

  // ── Determine overall EU compliance ──
  const missingRequired = EU_REQUIRED_FIELDS.filter((f) => {
    const v = invoiceData[f];
    return v === undefined || v === null || v === "";
  });
  const euCompliant = missingRequired.length === 0 && errors.length === 0;

  const valid = errors.length === 0;

  return {
    output: {
      valid,
      errors,
      warnings,
      tax_calculation_check: {
        expected_tax: expectedTax,
        actual_tax: taxAmount ?? null,
        difference: taxDifference,
        pass: taxPass,
      },
      line_items_check: {
        total_checked: lineItemsPassed + lineItemsFailed,
        passed: lineItemsPassed,
        failed: lineItemsFailed,
      },
      eu_compliant: euCompliant,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
