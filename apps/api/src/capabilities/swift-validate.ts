import { registerCapability, type CapabilityInput } from "./index.js";

// SWIFT/BIC code validation — pure algorithmic
// Format: 4 letters (bank) + 2 letters (country) + 2 alphanumeric (location) + optional 3 alphanumeric (branch)
const SWIFT_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

// ISO 3166-1 alpha-2 country codes (subset used in SWIFT)
const COUNTRY_CODES = new Set([
  "AD","AE","AF","AG","AI","AL","AM","AO","AR","AS","AT","AU","AW","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BM","BN","BO","BR","BS",
  "BT","BW","BY","BZ","CA","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC",
  "EE","EG","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD",
  "GE","GH","GI","GL","GM","GN","GQ","GR","GT","GU","GW","GY","HK","HN",
  "HR","HT","HU","ID","IE","IL","IN","IQ","IR","IS","IT","JM","JO","JP",
  "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MG","MH",
  "MK","ML","MM","MN","MO","MR","MT","MU","MV","MW","MX","MY","MZ","NA",
  "NE","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
  "PH","PK","PL","PM","PR","PS","PT","PW","PY","QA","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SI","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TG","TH","TJ","TL","TM","TN","TO",
  "TR","TT","TV","TW","TZ","UA","UG","US","UY","UZ","VA","VC","VE","VG",
  "VI","VN","VU","WS","XK","YE","ZA","ZM","ZW",
]);

registerCapability("swift-validate", async (input: CapabilityInput) => {
  const raw = (input.swift as string) ?? (input.bic as string) ?? (input.swift_code as string) ?? "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("'swift' is required. Provide a SWIFT/BIC code (e.g. DABASESX).");
  }

  const code = raw.trim().toUpperCase().replace(/\s/g, "");
  const errors: string[] = [];

  // Length check
  if (code.length !== 8 && code.length !== 11) {
    errors.push(`Invalid length: ${code.length} (must be 8 or 11 characters).`);
  }

  // Format check
  if (!SWIFT_RE.test(code)) {
    errors.push("Invalid format. Expected: 4 letters + 2 letters (country) + 2 alphanumeric + optional 3 alphanumeric.");
  }

  // Country code check
  const countryCode = code.length >= 6 ? code.slice(4, 6) : "";
  if (countryCode && !COUNTRY_CODES.has(countryCode)) {
    errors.push(`Unknown country code: ${countryCode}.`);
  }

  const valid = errors.length === 0;
  const bankCode = code.slice(0, 4);
  const locationCode = code.length >= 8 ? code.slice(6, 8) : "";
  const branchCode = code.length === 11 ? code.slice(8, 11) : null;
  const isHeadOffice = branchCode === null || branchCode === "XXX";

  return {
    output: {
      valid,
      swift_code: code,
      bank_code: bankCode,
      country_code: countryCode,
      location_code: locationCode,
      branch_code: branchCode,
      is_head_office: isHeadOffice,
      ...(errors.length > 0 ? { errors } : {}),
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
