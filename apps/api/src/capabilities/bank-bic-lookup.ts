import { registerCapability, type CapabilityInput } from "./index.js";

const KNOWN_BICS: Record<string, string> = {
  DEUT: "Deutsche Bank", BNPA: "BNP Paribas", COBA: "Commerzbank",
  SWED: "Swedbank", NDEA: "Nordea", HAND: "Handelsbanken",
  ESSE: "SEB", DAAB: "Danske Bank", DNBA: "DNB",
  HSBC: "HSBC", BARC: "Barclays", LOYD: "Lloyds Banking Group",
  NWBK: "NatWest", ROYA: "Royal Bank of Scotland", MIDL: "HSBC UK",
  CHAS: "JPMorgan Chase", CITI: "Citibank", BOFAUS: "Bank of America",
  WFBI: "Wells Fargo", GSCR: "Goldman Sachs",
  UBSW: "UBS", CRES: "Credit Suisse (UBS)", ZKBK: "Zürcher Kantonalbank",
  INGB: "ING Bank", ABNA: "ABN AMRO", RABO: "Rabobank",
  SOGE: "Société Générale", CRLY: "Crédit Lyonnais (LCL)", AGRI: "Crédit Agricole",
  BCCI: "BCI", UNCRITMM: "UniCredit", BCIT: "Intesa Sanpaolo",
  BBVA: "BBVA", CAIXESBB: "CaixaBank", BSCH: "Santander",
  OKOK: "OP Financial Group", NDEAFIHH: "Nordea Finland",
  DABA: "Danske Bank", JYBA: "Jyske Bank",
  SHBK: "Handelsbanken", SKAB: "Skandiabanken",
  SPKR: "Sparkasse", GENO: "Volksbank/Raiffeisenbank",
  COBADEFF: "Commerzbank Frankfurt", DEUTDEFF: "Deutsche Bank Frankfurt",
  BNPAFRPP: "BNP Paribas Paris", SWEDSESS: "Swedbank Stockholm",
  NDEASESS: "Nordea Stockholm", HANDSESS: "Handelsbanken Stockholm",
  ESSESESS: "SEB Stockholm", DNBANOKK: "DNB Oslo",
  DABADKKK: "Danske Bank Copenhagen", HELSFI: "Helsingfors Sparbank",
  NDEADKKK: "Nordea Denmark", NDEANOKKXXX: "Nordea Norway",
  POFICHBEXXX: "PostFinance", KRED: "KBC Bank",
  GIBAATWW: "Erste Bank Austria", BKAUATWW: "UniCredit Bank Austria",
  AIBKIE2D: "AIB", BOFIIE2D: "Bank of Ireland",
  BSCHESMM: "Santander Spain", CAIXESBBXXX: "CaixaBank",
  ICRAITRR: "Intesa Sanpaolo", UNCRITMM2: "UniCredit Italy",
  POLUPLPR: "PKO BP", BREXPLPW: "mBank Poland",
  HBUKGB4B: "HSBC UK", BARCGB22: "Barclays",
  REVOLT21: "Revolut", TRWIBEB1: "Wise (TransferWise)",
  BUNQ: "bunq", N26: "N26",
};

const ISO_COUNTRIES: Record<string, string> = {
  AF:"Afghanistan",AL:"Albania",DZ:"Algeria",AD:"Andorra",AO:"Angola",
  AR:"Argentina",AM:"Armenia",AU:"Australia",AT:"Austria",AZ:"Azerbaijan",
  BS:"Bahamas",BH:"Bahrain",BD:"Bangladesh",BB:"Barbados",BY:"Belarus",
  BE:"Belgium",BZ:"Belize",BJ:"Benin",BT:"Bhutan",BO:"Bolivia",
  BA:"Bosnia and Herzegovina",BW:"Botswana",BR:"Brazil",BN:"Brunei",BG:"Bulgaria",
  KH:"Cambodia",CM:"Cameroon",CA:"Canada",CL:"Chile",CN:"China",
  CO:"Colombia",CR:"Costa Rica",HR:"Croatia",CU:"Cuba",CY:"Cyprus",
  CZ:"Czech Republic",DK:"Denmark",DO:"Dominican Republic",EC:"Ecuador",EG:"Egypt",
  EE:"Estonia",ET:"Ethiopia",FI:"Finland",FR:"France",DE:"Germany",
  GH:"Ghana",GR:"Greece",GT:"Guatemala",HK:"Hong Kong",HU:"Hungary",
  IS:"Iceland",IN:"India",ID:"Indonesia",IR:"Iran",IQ:"Iraq",
  IE:"Ireland",IL:"Israel",IT:"Italy",JM:"Jamaica",JP:"Japan",
  JO:"Jordan",KZ:"Kazakhstan",KE:"Kenya",KR:"South Korea",KW:"Kuwait",
  LV:"Latvia",LB:"Lebanon",LI:"Liechtenstein",LT:"Lithuania",LU:"Luxembourg",
  MO:"Macau",MG:"Madagascar",MY:"Malaysia",MT:"Malta",MX:"Mexico",
  MD:"Moldova",MC:"Monaco",MN:"Mongolia",ME:"Montenegro",MA:"Morocco",
  MZ:"Mozambique",MM:"Myanmar",NP:"Nepal",NL:"Netherlands",NZ:"New Zealand",
  NG:"Nigeria",MK:"North Macedonia",NO:"Norway",OM:"Oman",PK:"Pakistan",
  PA:"Panama",PY:"Paraguay",PE:"Peru",PH:"Philippines",PL:"Poland",
  PT:"Portugal",QA:"Qatar",RO:"Romania",RU:"Russia",SA:"Saudi Arabia",
  RS:"Serbia",SG:"Singapore",SK:"Slovakia",SI:"Slovenia",ZA:"South Africa",
  ES:"Spain",LK:"Sri Lanka",SE:"Sweden",CH:"Switzerland",TW:"Taiwan",
  TH:"Thailand",TN:"Tunisia",TR:"Turkey",UA:"Ukraine",AE:"United Arab Emirates",
  GB:"United Kingdom",US:"United States",UY:"Uruguay",UZ:"Uzbekistan",
  VE:"Venezuela",VN:"Vietnam",
};

registerCapability("bank-bic-lookup", async (input: CapabilityInput) => {
  const raw = ((input.bic as string) ?? (input.swift_code as string) ?? (input.task as string) ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) throw new Error("'bic' (BIC/SWIFT code) is required.");

  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(raw)) {
    return {
      output: { bic: raw, valid: false, error: "Invalid BIC format. Must be 8 or 11 alphanumeric characters: 4 bank + 2 country + 2 location + optional 3 branch." },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  const bankCode = raw.slice(0, 4);
  const countryCode = raw.slice(4, 6);
  const locationCode = raw.slice(6, 8);
  const branchCode = raw.length === 11 ? raw.slice(8, 11) : "XXX";
  const isHeadOffice = branchCode === "XXX";
  const country = ISO_COUNTRIES[countryCode] ?? null;

  if (!country) {
    return {
      output: { bic: raw, valid: false, error: `Invalid country code '${countryCode}' in BIC.` },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  // Try exact BIC match first, then prefix match
  let bankName: string | null = KNOWN_BICS[raw] ?? KNOWN_BICS[raw.slice(0, 8)] ?? KNOWN_BICS[bankCode + countryCode] ?? KNOWN_BICS[bankCode] ?? null;

  return {
    output: {
      bic: raw, valid: true, bank_code: bankCode, country_code: countryCode,
      location_code: locationCode, branch_code: branchCode,
      bank_name: bankName, country, is_head_office: isHeadOffice,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
