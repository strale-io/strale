import { registerCapability, type CapabilityInput } from "./index.js";

// ─── SEPA XML validation — pure algorithmic, no XML library ─────────────────
// Validates pain.001.001.03 (credit transfer) and pain.008.001.02 (direct debit)

/**
 * Extract text content of a simple XML tag.
 * Returns first match or null.
 */
function getTagValue(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "s");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract all occurrences of a tag's text content.
 */
function getAllTagValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gs");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

/**
 * Extract all blocks matching an XML element (including nested content).
 * Uses a simple depth-tracking approach.
 */
function getAllBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;

  let searchFrom = 0;
  while (searchFrom < xml.length) {
    const startIdx = xml.indexOf(openTag, searchFrom);
    if (startIdx === -1) break;

    // Find the end of the opening tag
    const openEnd = xml.indexOf(">", startIdx);
    if (openEnd === -1) break;

    // Track depth to handle nested same-name tags
    let depth = 1;
    let pos = openEnd + 1;
    while (depth > 0 && pos < xml.length) {
      const nextOpen = xml.indexOf(openTag, pos);
      const nextClose = xml.indexOf(closeTag, pos);

      if (nextClose === -1) break; // Malformed
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + openTag.length;
      } else {
        depth--;
        if (depth === 0) {
          blocks.push(xml.slice(startIdx, nextClose + closeTag.length));
        }
        pos = nextClose + closeTag.length;
      }
    }

    searchFrom = pos;
  }

  return blocks;
}

/**
 * Validate IBAN format (basic check: 2 letters + 2 digits + up to 30 alphanumeric).
 */
function isValidIbanFormat(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "");
  return /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned);
}

/**
 * Validate BIC/SWIFT format (4 letters + 2 letters + 2 alphanumeric + optional 3 alphanumeric).
 */
function isValidBicFormat(bic: string): boolean {
  const cleaned = bic.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleaned);
}

/**
 * Validate that an amount is positive and has at most 2 decimal places.
 */
function isValidAmount(amountStr: string): boolean {
  const num = parseFloat(amountStr);
  if (isNaN(num) || num <= 0) return false;
  // Check decimal places (SEPA allows max 2)
  if (amountStr.includes(".") && amountStr.split(".")[1].length > 2) return false;
  return true;
}

interface ValidationError {
  path: string;
  message: string;
}

registerCapability("sepa-xml-validate", async (input: CapabilityInput) => {
  const rawXml =
    (input.xml as string) ??
    (input.xml_string as string) ??
    (input.task as string) ??
    "";

  if (typeof rawXml !== "string" || !rawXml.trim()) {
    throw new Error(
      "'xml' or 'xml_string' is required. Provide a SEPA XML string (pain.001 or pain.008).",
    );
  }

  const xml = rawXml.trim();
  const errors: ValidationError[] = [];
  const warnings: { path: string; message: string }[] = [];

  // ── 1. Detect message type from namespace ──
  let messageType: "pain.001" | "pain.008" | "unknown" = "unknown";
  let detectedSchema = "";

  if (xml.includes("pain.001.001.03") || xml.includes("pain.001.001.09") || xml.includes("pain.001.001")) {
    messageType = "pain.001";
    detectedSchema = "pain.001 (Credit Transfer)";
  } else if (xml.includes("pain.008.001.02") || xml.includes("pain.008.001.08") || xml.includes("pain.008.001")) {
    messageType = "pain.008";
    detectedSchema = "pain.008 (Direct Debit)";
  }

  // Check for proper namespace
  const nsMatch = xml.match(/urn:iso:std:iso:20022:tech:xsd:(pain\.\d{3}\.\d{3}\.\d{2})/);
  if (nsMatch) {
    detectedSchema = nsMatch[1];
  } else {
    // Also check for namespace without full URN
    if (!xml.includes("urn:iso:std:iso:20022")) {
      errors.push({
        path: "Document/@xmlns",
        message: "Missing or invalid SEPA namespace. Expected urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 or pain.008.001.02.",
      });
    }
  }

  if (messageType === "unknown") {
    errors.push({
      path: "Document",
      message: "Cannot determine SEPA message type. Expected pain.001 (credit transfer) or pain.008 (direct debit).",
    });
  }

  // ── 2. Extract Group Header (GrpHdr) fields ──
  const messageId = getTagValue(xml, "MsgId");
  const creationDate = getTagValue(xml, "CreDtTm");
  const nbOfTxsStr = getTagValue(xml, "NbOfTxs");
  const ctrlSumStr = getTagValue(xml, "CtrlSum");

  if (!messageId) {
    errors.push({ path: "GrpHdr/MsgId", message: "Missing MsgId (Message Identification)." });
  } else if (messageId.length > 35) {
    errors.push({ path: "GrpHdr/MsgId", message: `MsgId exceeds 35 characters (${messageId.length}).` });
  }

  if (!creationDate) {
    errors.push({ path: "GrpHdr/CreDtTm", message: "Missing CreDtTm (Creation Date Time)." });
  } else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(creationDate)) {
    warnings.push({ path: "GrpHdr/CreDtTm", message: `CreDtTm format may be non-standard: '${creationDate}'.` });
  }

  if (!nbOfTxsStr) {
    errors.push({ path: "GrpHdr/NbOfTxs", message: "Missing NbOfTxs (Number of Transactions)." });
  }
  const declaredTxCount = nbOfTxsStr ? parseInt(nbOfTxsStr, 10) : null;

  const declaredCtrlSum = ctrlSumStr ? parseFloat(ctrlSumStr) : null;

  // ── 3. Extract initiating party ──
  const initiatingPartyName = getTagValue(xml, "InitgPty") !== null
    ? getTagValue(xml, "Nm")
    : null;

  // ── 4. Parse Payment Information blocks ──
  const pmtInfBlocks = getAllBlocks(xml, "PmtInf");
  if (pmtInfBlocks.length === 0) {
    errors.push({ path: "PmtInf", message: "No PmtInf (Payment Information) blocks found." });
  }

  let totalTransactions = 0;
  let totalAmount = 0;
  const debtorInfo: { name: string | null; iban: string | null; bic: string | null } = {
    name: null, iban: null, bic: null,
  };
  let creditorCount = 0;

  for (let pi = 0; pi < pmtInfBlocks.length; pi++) {
    const pmtBlock = pmtInfBlocks[pi];
    const pmtInfId = getTagValue(pmtBlock, "PmtInfId");
    const path = `PmtInf[${pi}]`;

    if (!pmtInfId) {
      errors.push({ path: `${path}/PmtInfId`, message: "Missing PmtInfId (Payment Information Identification)." });
    }

    // Execution date
    const reqExecDate = getTagValue(pmtBlock, "ReqdExctnDt");
    const reqCollDate = getTagValue(pmtBlock, "ReqdColltnDt");
    const executionDate = reqExecDate ?? reqCollDate;
    if (!executionDate) {
      if (messageType === "pain.001") {
        errors.push({ path: `${path}/ReqdExctnDt`, message: "Missing ReqdExctnDt (Requested Execution Date)." });
      } else if (messageType === "pain.008") {
        errors.push({ path: `${path}/ReqdColltnDt`, message: "Missing ReqdColltnDt (Requested Collection Date)." });
      }
    }

    // Debtor info (from PmtInf level in pain.001; Creditor in pain.008)
    // For pain.001: Dbtr is the debtor at PmtInf level
    // For pain.008: Cdtr is the creditor at PmtInf level
    if (messageType === "pain.001") {
      // Get debtor blocks
      const dbtrBlocks = getAllBlocks(pmtBlock, "Dbtr");
      if (dbtrBlocks.length > 0) {
        const name = getTagValue(dbtrBlocks[0], "Nm");
        if (name && !debtorInfo.name) debtorInfo.name = name;
      }
      const dbtrAcctBlocks = getAllBlocks(pmtBlock, "DbtrAcct");
      if (dbtrAcctBlocks.length > 0) {
        const iban = getTagValue(dbtrAcctBlocks[0], "IBAN");
        if (iban && !debtorInfo.iban) {
          debtorInfo.iban = iban;
          if (!isValidIbanFormat(iban)) {
            errors.push({ path: `${path}/DbtrAcct/IBAN`, message: `Invalid IBAN format: '${iban}'.` });
          }
        }
      }
      const dbtrAgtBlocks = getAllBlocks(pmtBlock, "DbtrAgt");
      if (dbtrAgtBlocks.length > 0) {
        const bic = getTagValue(dbtrAgtBlocks[0], "BIC");
        if (bic && !debtorInfo.bic) {
          debtorInfo.bic = bic;
          if (!isValidBicFormat(bic)) {
            errors.push({ path: `${path}/DbtrAgt/BIC`, message: `Invalid BIC format: '${bic}'.` });
          }
        }
      }
    } else if (messageType === "pain.008") {
      // For direct debit, the creditor is at PmtInf level
      const cdtrBlocks = getAllBlocks(pmtBlock, "Cdtr");
      if (cdtrBlocks.length > 0) {
        const name = getTagValue(cdtrBlocks[0], "Nm");
        if (name && !debtorInfo.name) debtorInfo.name = name; // Store as "debtor" in output for consistency
      }
      const cdtrAcctBlocks = getAllBlocks(pmtBlock, "CdtrAcct");
      if (cdtrAcctBlocks.length > 0) {
        const iban = getTagValue(cdtrAcctBlocks[0], "IBAN");
        if (iban && !debtorInfo.iban) {
          debtorInfo.iban = iban;
          if (!isValidIbanFormat(iban)) {
            errors.push({ path: `${path}/CdtrAcct/IBAN`, message: `Invalid IBAN format: '${iban}'.` });
          }
        }
      }
    }

    // Parse individual transactions
    const txTag = messageType === "pain.001" ? "CdtTrfTxInf" : "DrctDbtTxInf";
    const txBlocks = getAllBlocks(pmtBlock, txTag);

    for (let ti = 0; ti < txBlocks.length; ti++) {
      const txBlock = txBlocks[ti];
      const txPath = `${path}/${txTag}[${ti}]`;
      totalTransactions++;

      // End-to-End ID
      const endToEndId = getTagValue(txBlock, "EndToEndId");
      if (!endToEndId) {
        errors.push({ path: `${txPath}/EndToEndId`, message: "Missing EndToEndId." });
      }

      // Amount
      const amtBlocks = getAllBlocks(txBlock, "InstdAmt");
      let amtBlock = amtBlocks.length > 0 ? amtBlocks[0] : null;
      // Also try Amt > InstdAmt
      if (!amtBlock) {
        const amtParent = getAllBlocks(txBlock, "Amt");
        if (amtParent.length > 0) {
          const inner = getAllBlocks(amtParent[0], "InstdAmt");
          if (inner.length > 0) amtBlock = inner[0];
        }
      }

      if (amtBlock) {
        // Extract amount value and currency
        const amtMatch = amtBlock.match(/<InstdAmt[^>]*Ccy="([^"]*)"[^>]*>([^<]*)<\/InstdAmt>/);
        if (amtMatch) {
          const currency = amtMatch[1];
          const amountStr = amtMatch[2].trim();

          if (currency !== "EUR") {
            errors.push({
              path: `${txPath}/InstdAmt/@Ccy`,
              message: `Currency must be EUR for SEPA, found '${currency}'.`,
            });
          }

          if (!isValidAmount(amountStr)) {
            errors.push({
              path: `${txPath}/InstdAmt`,
              message: `Invalid amount: '${amountStr}'. Must be positive with at most 2 decimal places.`,
            });
          } else {
            totalAmount += parseFloat(amountStr);
          }
        } else {
          // Try to extract just the value
          const valMatch = amtBlock.match(/>([0-9.]+)<\/InstdAmt>/);
          if (valMatch) {
            const amountStr = valMatch[1].trim();
            if (isValidAmount(amountStr)) {
              totalAmount += parseFloat(amountStr);
            }
            warnings.push({
              path: `${txPath}/InstdAmt`,
              message: "Could not extract currency attribute from InstdAmt.",
            });
          } else {
            errors.push({ path: `${txPath}/InstdAmt`, message: "Could not parse InstdAmt value." });
          }
        }
      } else {
        errors.push({ path: `${txPath}/InstdAmt`, message: "Missing InstdAmt (Instructed Amount)." });
      }

      // Creditor/Debtor per transaction
      if (messageType === "pain.001") {
        // Credit transfer: Cdtr is per transaction
        const cdtrName = getTagValue(txBlock, "Nm");
        if (cdtrName) creditorCount++;

        const cdtrIban = getTagValue(txBlock, "IBAN");
        if (cdtrIban && !isValidIbanFormat(cdtrIban)) {
          errors.push({ path: `${txPath}/CdtrAcct/IBAN`, message: `Invalid creditor IBAN format: '${cdtrIban}'.` });
        }

        const cdtrBic = getTagValue(txBlock, "BIC");
        if (cdtrBic && !isValidBicFormat(cdtrBic)) {
          errors.push({ path: `${txPath}/CdtrAgt/BIC`, message: `Invalid creditor BIC format: '${cdtrBic}'.` });
        }
      } else if (messageType === "pain.008") {
        // Direct debit: Dbtr is per transaction
        const dbtrName = getTagValue(txBlock, "Nm");
        if (dbtrName) creditorCount++; // Count debtors in direct debit context

        const dbtrIban = getTagValue(txBlock, "IBAN");
        if (dbtrIban && !isValidIbanFormat(dbtrIban)) {
          errors.push({ path: `${txPath}/DbtrAcct/IBAN`, message: `Invalid debtor IBAN format: '${dbtrIban}'.` });
        }
      }
    }
  }

  // Round total amount to 2 decimal places
  totalAmount = Math.round(totalAmount * 100) / 100;

  // ── 5. Cross-checks ──
  if (declaredTxCount !== null && declaredTxCount !== totalTransactions) {
    errors.push({
      path: "GrpHdr/NbOfTxs",
      message: `Transaction count mismatch: NbOfTxs declares ${declaredTxCount}, but found ${totalTransactions} transactions.`,
    });
  }

  if (declaredCtrlSum !== null) {
    const ctrlSumRounded = Math.round(declaredCtrlSum * 100) / 100;
    if (Math.abs(ctrlSumRounded - totalAmount) > 0.01) {
      errors.push({
        path: "GrpHdr/CtrlSum",
        message: `Control sum mismatch: CtrlSum declares ${ctrlSumRounded}, but computed total is ${totalAmount}.`,
      });
    }
  }

  const valid = errors.length === 0;

  return {
    output: {
      valid,
      message_type: messageType !== "unknown" ? messageType : null,
      schema: detectedSchema || null,
      message_id: messageId,
      creation_date: creationDate,
      payment_count: totalTransactions,
      total_amount: totalAmount,
      currency: "EUR",
      debtor: {
        name: debtorInfo.name,
        iban: debtorInfo.iban,
        bic: debtorInfo.bic,
      },
      creditor_count: creditorCount,
      errors,
      warnings,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
