import { registerCapability, type CapabilityInput } from "./index.js";

// Marketplace fee calculator — pure algorithmic
// Published fee schedules for Amazon, eBay, Etsy, Shopify (2024)

interface FeeBreakdown {
  referral_fee: number | null;
  closing_fee: number | null;
  payment_processing_fee: number | null;
  transaction_fee: number | null;
  listing_fee: number | null;
  other_fees: number | null;
}

interface FeeResult {
  marketplace: string;
  sale_price: number;
  currency: string;
  category: string | null;
  fees: FeeBreakdown;
  total_fees: number;
  net_revenue: number;
  fee_percent: number;
  breakdown_notes: string[];
}

// Amazon referral fee percentages by category
const AMAZON_REFERRAL_RATES: Record<string, number> = {
  electronics: 0.08,
  computers: 0.08,
  cameras: 0.08,
  video_games: 0.15,
  clothing: 0.17,
  shoes: 0.15,
  jewelry: 0.20,
  watches: 0.15,
  books: 0.15,
  media: 0.15,
  home: 0.15,
  kitchen: 0.15,
  garden: 0.15,
  toys: 0.15,
  sports: 0.15,
  automotive: 0.12,
  beauty: 0.15,
  health: 0.15,
  grocery: 0.08,
  pet_supplies: 0.15,
  office: 0.15,
  tools: 0.15,
  industrial: 0.12,
  default: 0.15,
};

const MEDIA_CATEGORIES = new Set(["books", "media", "dvd", "music", "video_games"]);

function calculateAmazonFees(salePrice: number, category: string | null): FeeResult {
  const cat = (category ?? "default").toLowerCase();
  const referralRate = AMAZON_REFERRAL_RATES[cat] ?? AMAZON_REFERRAL_RATES.default;
  const referralFee = round(salePrice * referralRate);
  const closingFee = MEDIA_CATEGORIES.has(cat) ? 1.80 : 0;

  const totalFees = round(referralFee + closingFee);
  const netRevenue = round(salePrice - totalFees);

  const notes = [
    `Referral fee: ${(referralRate * 100).toFixed(1)}% of sale price`,
    `Professional seller plan ($39.99/month not included in per-item calculation)`,
  ];
  if (closingFee > 0) {
    notes.push(`Media closing fee: $${closingFee.toFixed(2)}`);
  }
  notes.push("FBA fulfillment fees not included (varies by size/weight)");

  return {
    marketplace: "amazon",
    sale_price: salePrice,
    currency: "USD",
    category: cat,
    fees: {
      referral_fee: referralFee,
      closing_fee: closingFee || null,
      payment_processing_fee: null,
      transaction_fee: null,
      listing_fee: null,
      other_fees: null,
    },
    total_fees: totalFees,
    net_revenue: netRevenue,
    fee_percent: round((totalFees / salePrice) * 100),
    breakdown_notes: notes,
  };
}

function calculateEbayFees(salePrice: number, category: string | null): FeeResult {
  // eBay final value fee: 12.9% + $0.30 per order for most categories
  const finalValueRate = 0.129;
  const perOrderFee = 0.30;
  const finalValueFee = round(salePrice * finalValueRate + perOrderFee);

  const notes = [
    `Final value fee: 12.9% + $0.30 per order`,
    `Payment processing included in final value fee`,
    `International fee (1.65%) not included — applies to cross-border sales`,
    `eBay Store subscription fees not included`,
  ];

  return {
    marketplace: "ebay",
    sale_price: salePrice,
    currency: "USD",
    category: category ?? null,
    fees: {
      referral_fee: null,
      closing_fee: null,
      payment_processing_fee: null,
      transaction_fee: finalValueFee,
      listing_fee: null,
      other_fees: null,
    },
    total_fees: finalValueFee,
    net_revenue: round(salePrice - finalValueFee),
    fee_percent: round((finalValueFee / salePrice) * 100),
    breakdown_notes: notes,
  };
}

function calculateEtsyFees(salePrice: number, _category: string | null): FeeResult {
  // Etsy fees
  const transactionFee = round(salePrice * 0.065); // 6.5%
  const paymentProcessingFee = round(salePrice * 0.03 + 0.25); // 3% + $0.25
  const listingFee = 0.20;

  const totalFees = round(transactionFee + paymentProcessingFee + listingFee);

  const notes = [
    `Transaction fee: 6.5% of sale price`,
    `Payment processing: 3% + $0.25`,
    `Listing fee: $0.20 per item`,
    `Offsite ads fee (12-15%) may apply if sale came from Etsy ads — not included`,
    `Etsy Plus subscription ($10/month) not included`,
  ];

  return {
    marketplace: "etsy",
    sale_price: salePrice,
    currency: "USD",
    category: _category ?? null,
    fees: {
      referral_fee: null,
      closing_fee: null,
      payment_processing_fee: paymentProcessingFee,
      transaction_fee: transactionFee,
      listing_fee: listingFee,
      other_fees: null,
    },
    total_fees: totalFees,
    net_revenue: round(salePrice - totalFees),
    fee_percent: round((totalFees / salePrice) * 100),
    breakdown_notes: notes,
  };
}

function calculateShopifyFees(salePrice: number, _category: string | null): FeeResult {
  // Shopify Basic plan: 2.9% + $0.30 (Shopify Payments)
  const paymentProcessingFee = round(salePrice * 0.029 + 0.30);

  const notes = [
    `Payment processing (Shopify Payments): 2.9% + $0.30`,
    `No transaction fee when using Shopify Payments`,
    `Third-party gateway: additional 2% transaction fee (not included)`,
    `Shopify Basic plan: $39/month (not included in per-item calculation)`,
    `Advanced/Plus plans have lower payment processing rates`,
  ];

  return {
    marketplace: "shopify",
    sale_price: salePrice,
    currency: "USD",
    category: _category ?? null,
    fees: {
      referral_fee: null,
      closing_fee: null,
      payment_processing_fee: paymentProcessingFee,
      transaction_fee: null,
      listing_fee: null,
      other_fees: null,
    },
    total_fees: paymentProcessingFee,
    net_revenue: round(salePrice - paymentProcessingFee),
    fee_percent: round((paymentProcessingFee / salePrice) * 100),
    breakdown_notes: notes,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

registerCapability("marketplace-fee-calculate", async (input: CapabilityInput) => {
  const marketplace = ((input.marketplace as string) ?? "").trim().toLowerCase();
  const salePrice = Number(input.sale_price ?? input.price ?? 0);
  const category = ((input.category as string) ?? "").trim() || null;
  const currency = ((input.currency as string) ?? "USD").trim().toUpperCase();

  if (!marketplace) {
    throw new Error(
      "'marketplace' is required. Supported: amazon, ebay, etsy, shopify.",
    );
  }
  if (!salePrice || salePrice <= 0) {
    throw new Error("'sale_price' is required and must be a positive number.");
  }

  let result: FeeResult;

  switch (marketplace) {
    case "amazon":
      result = calculateAmazonFees(salePrice, category);
      break;
    case "ebay":
      result = calculateEbayFees(salePrice, category);
      break;
    case "etsy":
      result = calculateEtsyFees(salePrice, category);
      break;
    case "shopify":
      result = calculateShopifyFees(salePrice, category);
      break;
    default:
      throw new Error(
        `Unsupported marketplace "${marketplace}". Supported: amazon, ebay, etsy, shopify.`,
      );
  }

  // Override currency if specified
  if (currency !== "USD") {
    result.currency = currency;
    result.breakdown_notes.push(
      `Note: Fee calculations use USD-based fee schedules. Displayed currency set to ${currency} but amounts are not converted.`,
    );
  }

  return {
    output: result as unknown as Record<string, unknown>,
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
