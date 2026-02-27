import { registerCapability, type CapabilityInput } from "./index.js";

// ─── SWIFT MT message parsing — pure algorithmic ────────────────────────────
// Parses SWIFT MT message blocks and extracts tagged fields from Block 4.

// Tag name lookup for common SWIFT fields
const TAG_NAMES: Record<string, string> = {
  "20": "Transaction Reference",
  "21": "Related Reference",
  "23B": "Bank Operation Code",
  "25": "Account Identification",
  "28C": "Statement Number/Sequence",
  "32A": "Value Date/Currency/Amount",
  "32B": "Currency/Amount",
  "33B": "Currency/Original Ordered Amount",
  "36": "Exchange Rate",
  "50A": "Ordering Customer (BIC)",
  "50K": "Ordering Customer (Name & Address)",
  "50F": "Ordering Customer (Party Identifier)",
  "51A": "Sending Institution",
  "52A": "Ordering Institution (BIC)",
  "52D": "Ordering Institution (Name & Address)",
  "53A": "Sender's Correspondent (BIC)",
  "53B": "Sender's Correspondent (Location)",
  "53D": "Sender's Correspondent (Name & Address)",
  "54A": "Receiver's Correspondent (BIC)",
  "54B": "Receiver's Correspondent (Location)",
  "54D": "Receiver's Correspondent (Name & Address)",
  "55A": "Third Reimbursement Institution (BIC)",
  "56A": "Intermediary (BIC)",
  "56D": "Intermediary (Name & Address)",
  "57A": "Account With Institution (BIC)",
  "57B": "Account With Institution (Location)",
  "57D": "Account With Institution (Name & Address)",
  "59": "Beneficiary Customer",
  "59A": "Beneficiary Customer (BIC)",
  "59F": "Beneficiary Customer (Party Identifier)",
  "60F": "Opening Balance",
  "60M": "Opening Balance (Intermediate)",
  "61": "Statement Line",
  "62F": "Closing Balance",
  "62M": "Closing Balance (Intermediate)",
  "64": "Closing Available Balance",
  "65": "Forward Available Balance",
  "70": "Remittance Information",
  "71A": "Details of Charges",
  "71F": "Sender's Charges",
  "71G": "Receiver's Charges",
  "72": "Sender to Receiver Information",
  "77B": "Regulatory Reporting",
  "77T": "Envelope Contents",
  "86": "Information to Account Owner",
};

// Map of MT message types to descriptions
const MT_DESCRIPTIONS: Record<string, string> = {
  "103": "Single Customer Credit Transfer",
  "101": "Request for Transfer",
  "102": "Multiple Customer Credit Transfer",
  "104": "Direct Debit and Request for Debit Transfer",
  "110": "Advice of Cheque(s)",
  "200": "Financial Institution Transfer for its Own Account",
  "202": "General Financial Institution Transfer",
  "202COV": "General Financial Institution Transfer (Cover)",
  "204": "Financial Markets Direct Debit",
  "210": "Notice to Receive",
  "300": "Foreign Exchange Confirmation",
  "400": "Advice of Payment",
  "900": "Confirmation of Debit",
  "910": "Confirmation of Credit",
  "940": "Customer Statement Message",
  "942": "Interim Transaction Report",
  "950": "Statement Message",
};

interface ParsedField {
  tag: string;
  name: string;
  value: string;
}

interface ParsedAmount {
  amount: number | null;
  currency: string | null;
  value_date: string | null;
}

/**
 * Extract a block from a SWIFT message by block number.
 * Blocks are {N:content} where N is the block number.
 */
function extractBlock(message: string, blockNum: number): string | null {
  // Match {N:...} where content may contain nested braces for block 4
  const prefix = `{${blockNum}:`;
  const startIdx = message.indexOf(prefix);
  if (startIdx === -1) return null;

  let depth = 1;
  let i = startIdx + prefix.length;
  while (i < message.length && depth > 0) {
    if (message[i] === "{") depth++;
    if (message[i] === "}") depth--;
    if (depth > 0) i++;
  }

  if (depth !== 0) return null;
  return message.slice(startIdx + prefix.length, i);
}

/**
 * Parse Block 1 (Basic Header): F01BANKBICAAXXX0000000000
 * Format: [A/F][01][12-char BIC/LT][session][sequence]
 */
function parseBlock1(block: string | null): { sender_bic: string | null } {
  if (!block) return { sender_bic: null };
  // BIC is in positions 3-14 (12 chars, BIC8 or BIC11 padded with X)
  const bic12 = block.slice(3, 15);
  // Clean trailing X padding to get BIC8 or BIC11
  const bic = bic12.replace(/X+$/, "") || bic12.slice(0, 8);
  return { sender_bic: bic || null };
}

/**
 * Parse Block 2 (Application Header):
 * Input: I103BANKBICAXXXXN (I = input, then MT type, then receiver BIC)
 * Output: O103... (O = output)
 */
function parseBlock2(block: string | null): {
  direction: "input" | "output" | null;
  message_type: string | null;
  receiver_bic: string | null;
} {
  if (!block) return { direction: null, message_type: null, receiver_bic: null };

  const direction = block[0] === "I" ? "input" : block[0] === "O" ? "output" : null;

  // MT type is next 3 digits
  const mtType = block.slice(1, 4);

  let receiverBic: string | null = null;
  if (direction === "input") {
    // For input messages: I + 3 digits MT + 12-char receiver BIC/LT
    const bic12 = block.slice(4, 16);
    receiverBic = bic12.replace(/X+$/, "") || bic12.slice(0, 8);
  } else if (direction === "output") {
    // For output messages: O + 3 digits MT + 4 digits input time + 28 chars MIR + 6 chars output date + 4 chars output time + 1 char priority
    // The receiver BIC is part of the MIR at positions 7-18
    if (block.length >= 18) {
      const bic12 = block.slice(7, 19);
      // Only extract if it looks like a BIC (starts with letters)
      if (/^[A-Z]{4}/.test(bic12)) {
        receiverBic = bic12.replace(/X+$/, "") || bic12.slice(0, 8);
      }
    }
  }

  return { direction, message_type: mtType || null, receiver_bic: receiverBic };
}

/**
 * Parse Block 4 (Text Block) tagged fields.
 * Fields start with :TAG: and continue until the next :TAG: or end-of-block marker (-).
 */
function parseBlock4Fields(block: string | null): ParsedField[] {
  if (!block) return [];

  const fields: ParsedField[] = [];

  // Normalize line endings
  const normalized = block.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Match :TAG:VALUE patterns. Tags can be 2-3 chars + optional letter suffix
  const tagPattern = /:(\d{2}[A-Z]?):/g;
  const matches: { tag: string; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(normalized)) !== null) {
    matches.push({ tag: match[1], index: match.index + match[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const tag = matches[i].tag;
    const start = matches[i].index;
    const end = i + 1 < matches.length
      ? matches[i + 1].index - matches[i + 1].tag.length - 2 // subtract ":TAG:" length
      : normalized.length;

    let value = normalized.slice(start, end).trim();
    // Remove trailing block delimiter
    if (value.endsWith("-")) {
      value = value.slice(0, -1).trim();
    }

    const name = TAG_NAMES[tag] ?? `Field ${tag}`;
    fields.push({ tag, name, value });
  }

  return fields;
}

/**
 * Parse amount from :32A: field — format: YYMMDD + 3-letter currency + amount
 * Example: 230115EUR1500,00
 */
function parseAmountField(fields: ParsedField[]): ParsedAmount {
  // Try :32A: first (Value Date/Currency/Amount), then :32B: (Currency/Amount)
  const field32A = fields.find((f) => f.tag === "32A");
  if (field32A) {
    const value = field32A.value.replace(/\n/g, "");
    // YYMMDD + CCY + Amount
    const match = value.match(/^(\d{6})([A-Z]{3})([0-9.,]+)$/);
    if (match) {
      const [, dateStr, currency, amountStr] = match;
      const yy = parseInt(dateStr.slice(0, 2), 10);
      const mm = dateStr.slice(2, 4);
      const dd = dateStr.slice(4, 6);
      const year = yy >= 50 ? 1900 + yy : 2000 + yy;
      const valueDate = `${year}-${mm}-${dd}`;
      // SWIFT uses comma as decimal separator
      const amount = parseFloat(amountStr.replace(",", "."));
      return { amount, currency, value_date: valueDate };
    }
  }

  const field32B = fields.find((f) => f.tag === "32B");
  if (field32B) {
    const value = field32B.value.replace(/\n/g, "");
    const match = value.match(/^([A-Z]{3})([0-9.,]+)$/);
    if (match) {
      const [, currency, amountStr] = match;
      const amount = parseFloat(amountStr.replace(",", "."));
      return { amount, currency, value_date: null };
    }
  }

  return { amount: null, currency: null, value_date: null };
}

/**
 * Extract multiline beneficiary/ordering customer from fields.
 */
function extractPartyInfo(fields: ParsedField[], tags: string[]): string | null {
  for (const tag of tags) {
    const field = fields.find((f) => f.tag === tag);
    if (field) return field.value;
  }
  return null;
}

registerCapability("swift-message-parse", async (input: CapabilityInput) => {
  const rawMessage =
    (input.message as string) ??
    (input.swift_message as string) ??
    (input.task as string) ??
    "";

  if (typeof rawMessage !== "string" || !rawMessage.trim()) {
    throw new Error(
      "'message' or 'swift_message' is required. Provide a raw SWIFT MT message string.",
    );
  }

  const message = rawMessage.trim();

  // Extract raw blocks
  const block1Raw = extractBlock(message, 1);
  const block2Raw = extractBlock(message, 2);
  const block3Raw = extractBlock(message, 3);
  const block4Raw = extractBlock(message, 4);

  // Parse blocks
  const block1 = parseBlock1(block1Raw);
  const block2 = parseBlock2(block2Raw);
  const fields = parseBlock4Fields(block4Raw);

  // Determine message type
  const mtNumber = block2.message_type ?? "";
  const messageType = mtNumber ? `MT${mtNumber}` : "unknown";
  const messageDescription = MT_DESCRIPTIONS[mtNumber] ?? null;

  // Extract reference
  const refField = fields.find((f) => f.tag === "20");
  const reference = refField ? refField.value.replace(/\n/g, " ").trim() : null;

  // Parse amount info
  const amountInfo = parseAmountField(fields);

  // Extract parties
  const beneficiary = extractPartyInfo(fields, ["59", "59A", "59F"]);
  const orderingCustomer = extractPartyInfo(fields, ["50K", "50A", "50F"]);

  // Extract remittance info
  const remittanceField = fields.find((f) => f.tag === "70");
  const remittanceInfo = remittanceField ? remittanceField.value : null;

  // Extract charges
  const chargesField = fields.find((f) => f.tag === "71A");
  const charges = chargesField ? chargesField.value.trim() : null;

  return {
    output: {
      message_type: messageType,
      message_description: messageDescription,
      sender_bic: block1.sender_bic,
      receiver_bic: block2.receiver_bic,
      direction: block2.direction,
      fields,
      reference,
      amount: amountInfo.amount,
      currency: amountInfo.currency,
      value_date: amountInfo.value_date,
      beneficiary,
      ordering_customer: orderingCustomer,
      remittance_info: remittanceInfo,
      charges,
      raw_blocks: {
        block1: block1Raw,
        block2: block2Raw,
        block3: block3Raw,
        block4: block4Raw,
      },
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
