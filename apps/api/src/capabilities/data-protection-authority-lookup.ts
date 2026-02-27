import { registerCapability, type CapabilityInput } from "./index.js";

// ─── EU/EEA Data Protection Authority lookup — pure algorithmic ──────────────

interface DpaEntry {
  country_code: string;
  country_name: string;
  authority_name: string;
  website: string;
  complaint_url: string;
  contact_email: string | null;
  phone: string | null;
  address: string;
}

const DPA_DIRECTORY: Record<string, DpaEntry> = {
  AT: {
    country_code: "AT",
    country_name: "Austria",
    authority_name: "Österreichische Datenschutzbehörde",
    website: "https://www.dsb.gv.at",
    complaint_url: "https://www.dsb.gv.at/download-links/dokumente.html",
    contact_email: "dsb@dsb.gv.at",
    phone: "+43 1 52 152-0",
    address: "Barichgasse 40-42, 1030 Vienna, Austria",
  },
  BE: {
    country_code: "BE",
    country_name: "Belgium",
    authority_name: "Gegevensbeschermingsautoriteit / Autorité de protection des données",
    website: "https://www.dataprotectionauthority.be",
    complaint_url: "https://www.dataprotectionauthority.be/citizen/actions/lodge-a-complaint",
    contact_email: "contact@apd-gba.be",
    phone: "+32 2 274 48 00",
    address: "Rue de la Presse 35, 1000 Brussels, Belgium",
  },
  BG: {
    country_code: "BG",
    country_name: "Bulgaria",
    authority_name: "Commission for Personal Data Protection (CPDP)",
    website: "https://www.cpdp.bg",
    complaint_url: "https://www.cpdp.bg/en/index.php?p=pages&aid=6",
    contact_email: "kzld@cpdp.bg",
    phone: "+359 2 915 3580",
    address: "2 Prof. Tsvetan Lazarov Blvd., 1592 Sofia, Bulgaria",
  },
  CY: {
    country_code: "CY",
    country_name: "Cyprus",
    authority_name: "Commissioner for Personal Data Protection",
    website: "http://www.dataprotection.gov.cy",
    complaint_url: "http://www.dataprotection.gov.cy/dataprotection/dataprotection.nsf/page3e_en/page3e_en",
    contact_email: "commissioner@dataprotection.gov.cy",
    phone: "+357 22 818 456",
    address: "1 Iasonos Street, 1082 Nicosia, Cyprus",
  },
  CZ: {
    country_code: "CZ",
    country_name: "Czech Republic",
    authority_name: "Úřad pro ochranu osobních údajů (ÚOOÚ)",
    website: "https://www.uoou.cz",
    complaint_url: "https://www.uoou.cz/en/vismo/zobraz_dok.asp?id_org=200156&id_ktg=1420",
    contact_email: "posta@uoou.cz",
    phone: "+420 234 665 111",
    address: "Pplk. Sochora 27, 170 00 Prague 7, Czech Republic",
  },
  DE: {
    country_code: "DE",
    country_name: "Germany",
    authority_name: "Der Bundesbeauftragte für den Datenschutz und die Informationsfreiheit (BfDI)",
    website: "https://www.bfdi.bund.de",
    complaint_url: "https://www.bfdi.bund.de/DE/Buerger/Inhalte/Allgemein/Beschwerde/Beschwerde_node.html",
    contact_email: "poststelle@bfdi.bund.de",
    phone: "+49 228 997799-0",
    address: "Graurheindorfer Str. 153, 53117 Bonn, Germany",
  },
  DK: {
    country_code: "DK",
    country_name: "Denmark",
    authority_name: "Datatilsynet",
    website: "https://www.datatilsynet.dk",
    complaint_url: "https://www.datatilsynet.dk/english/file-a-complaint",
    contact_email: "dt@datatilsynet.dk",
    phone: "+45 33 19 32 00",
    address: "Carl Jacobsens Vej 35, 2500 Valby, Denmark",
  },
  EE: {
    country_code: "EE",
    country_name: "Estonia",
    authority_name: "Andmekaitse Inspektsioon (AKI)",
    website: "https://www.aki.ee",
    complaint_url: "https://www.aki.ee/en/inspectorate/file-complaint",
    contact_email: "info@aki.ee",
    phone: "+372 627 4135",
    address: "Tatari 39, 10134 Tallinn, Estonia",
  },
  ES: {
    country_code: "ES",
    country_name: "Spain",
    authority_name: "Agencia Española de Protección de Datos (AEPD)",
    website: "https://www.aepd.es",
    complaint_url: "https://www.aepd.es/en/areas-of-action/know-your-rights/right-to-complain",
    contact_email: "ciudadano@aepd.es",
    phone: "+34 91 266 35 17",
    address: "C/ Jorge Juan 6, 28001 Madrid, Spain",
  },
  FI: {
    country_code: "FI",
    country_name: "Finland",
    authority_name: "Tietosuojavaltuutetun toimisto (Office of the Data Protection Ombudsman)",
    website: "https://tietosuoja.fi",
    complaint_url: "https://tietosuoja.fi/en/notification-to-the-data-protection-ombudsman",
    contact_email: "tietosuoja@om.fi",
    phone: "+358 29 566 6700",
    address: "Lintulahdenkuja 4, 00530 Helsinki, Finland",
  },
  FR: {
    country_code: "FR",
    country_name: "France",
    authority_name: "Commission Nationale de l'Informatique et des Libertés (CNIL)",
    website: "https://www.cnil.fr",
    complaint_url: "https://www.cnil.fr/en/complaints",
    contact_email: null,
    phone: "+33 1 53 73 22 22",
    address: "3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France",
  },
  GR: {
    country_code: "GR",
    country_name: "Greece",
    authority_name: "Hellenic Data Protection Authority (HDPA)",
    website: "https://www.dpa.gr",
    complaint_url: "https://www.dpa.gr/en/individuals/applyings-to-authority/complaint",
    contact_email: "contact@dpa.gr",
    phone: "+30 210 647 5600",
    address: "Kifissias 1-3, 115 23 Athens, Greece",
  },
  HR: {
    country_code: "HR",
    country_name: "Croatia",
    authority_name: "Agencija za zaštitu osobnih podataka (AZOP)",
    website: "https://azop.hr",
    complaint_url: "https://azop.hr/how-to-file-a-complaint/",
    contact_email: "azop@azop.hr",
    phone: "+385 1 4609 000",
    address: "Fra Grge Martića 14, 10000 Zagreb, Croatia",
  },
  HU: {
    country_code: "HU",
    country_name: "Hungary",
    authority_name: "Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH)",
    website: "https://www.naih.hu",
    complaint_url: "https://www.naih.hu/panaszugyintezes",
    contact_email: "ugyfelszolgalat@naih.hu",
    phone: "+36 1 391 1400",
    address: "Falk Miksa utca 9-11, 1055 Budapest, Hungary",
  },
  IE: {
    country_code: "IE",
    country_name: "Ireland",
    authority_name: "Data Protection Commission (DPC)",
    website: "https://www.dataprotection.ie",
    complaint_url: "https://forms.dataprotection.ie/contact",
    contact_email: "info@dataprotection.ie",
    phone: "+353 57 868 4800",
    address: "21 Fitzwilliam Square South, Dublin 2, D02 RD28, Ireland",
  },
  IT: {
    country_code: "IT",
    country_name: "Italy",
    authority_name: "Garante per la protezione dei dati personali",
    website: "https://www.garanteprivacy.it",
    complaint_url: "https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/4535524",
    contact_email: "garante@gpdp.it",
    phone: "+39 06 69677 1",
    address: "Piazza Venezia 11, 00187 Rome, Italy",
  },
  LT: {
    country_code: "LT",
    country_name: "Lithuania",
    authority_name: "Valstybinė duomenų apsaugos inspekcija (VDAI)",
    website: "https://vdai.lrv.lt",
    complaint_url: "https://vdai.lrv.lt/en/activities/complaints",
    contact_email: "ada@ada.lt",
    phone: "+370 5 271 2804",
    address: "L. Sapiegos g. 17, 10312 Vilnius, Lithuania",
  },
  LU: {
    country_code: "LU",
    country_name: "Luxembourg",
    authority_name: "Commission Nationale pour la Protection des Données (CNPD)",
    website: "https://cnpd.public.lu",
    complaint_url: "https://cnpd.public.lu/en/particuliers/faire-valoir/formulaire-plainte.html",
    contact_email: "info@cnpd.lu",
    phone: "+352 26 10 60 1",
    address: "15 Boulevard du Jazz, L-4370 Belvaux, Luxembourg",
  },
  LV: {
    country_code: "LV",
    country_name: "Latvia",
    authority_name: "Datu valsts inspekcija (Data State Inspectorate)",
    website: "https://www.dvi.gov.lv",
    complaint_url: "https://www.dvi.gov.lv/en/individuals/how-to-file-complaint",
    contact_email: "info@dvi.gov.lv",
    phone: "+371 67 22 31 31",
    address: "Elijas iela 17, Riga, LV-1050, Latvia",
  },
  MT: {
    country_code: "MT",
    country_name: "Malta",
    authority_name: "Office of the Information and Data Protection Commissioner (IDPC)",
    website: "https://idpc.org.mt",
    complaint_url: "https://idpc.org.mt/complaints/",
    contact_email: "idpc.info@idpc.org.mt",
    phone: "+356 2328 7100",
    address: "Floor 2, Airways House, High Street, Sliema, SLM 1549, Malta",
  },
  NL: {
    country_code: "NL",
    country_name: "Netherlands",
    authority_name: "Autoriteit Persoonsgegevens (AP)",
    website: "https://autoriteitpersoonsgegevens.nl",
    complaint_url: "https://autoriteitpersoonsgegevens.nl/en/complaints",
    contact_email: null,
    phone: "+31 70 888 85 00",
    address: "Bezuidenhoutseweg 30, 2594 AV The Hague, Netherlands",
  },
  PL: {
    country_code: "PL",
    country_name: "Poland",
    authority_name: "Urząd Ochrony Danych Osobowych (UODO)",
    website: "https://uodo.gov.pl",
    complaint_url: "https://uodo.gov.pl/en/559/930",
    contact_email: "kancelaria@uodo.gov.pl",
    phone: "+48 22 531 03 00",
    address: "ul. Stawki 2, 00-193 Warsaw, Poland",
  },
  PT: {
    country_code: "PT",
    country_name: "Portugal",
    authority_name: "Comissão Nacional de Protecção de Dados (CNPD)",
    website: "https://www.cnpd.pt",
    complaint_url: "https://www.cnpd.pt/direitos/exercer-direitos/",
    contact_email: "geral@cnpd.pt",
    phone: "+351 21 392 84 00",
    address: "Rua de São Bento 148, 3°, 1200-821 Lisbon, Portugal",
  },
  RO: {
    country_code: "RO",
    country_name: "Romania",
    authority_name: "Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)",
    website: "https://www.dataprotection.ro",
    complaint_url: "https://www.dataprotection.ro/?page=Plangeri",
    contact_email: "anspdcp@dataprotection.ro",
    phone: "+40 318 059 211",
    address: "B-dul G-ral. Gheorghe Magheru nr. 28-30, Sector 1, 010336 Bucharest, Romania",
  },
  SE: {
    country_code: "SE",
    country_name: "Sweden",
    authority_name: "Integritetsskyddsmyndigheten (IMY)",
    website: "https://www.imy.se",
    complaint_url: "https://www.imy.se/en/individuals/file-a-complaint/",
    contact_email: "imy@imy.se",
    phone: "+46 8 657 61 00",
    address: "Drottninggatan 29, Plan 5, 104 20 Stockholm, Sweden",
  },
  SI: {
    country_code: "SI",
    country_name: "Slovenia",
    authority_name: "Informacijski pooblaščenec (Information Commissioner)",
    website: "https://www.ip-rs.si",
    complaint_url: "https://www.ip-rs.si/en/individuals/how-to-file-a-complaint",
    contact_email: "gp.ip@ip-rs.si",
    phone: "+386 1 230 97 30",
    address: "Dunajska cesta 22, 1000 Ljubljana, Slovenia",
  },
  SK: {
    country_code: "SK",
    country_name: "Slovakia",
    authority_name: "Úrad na ochranu osobných údajov Slovenskej republiky",
    website: "https://dataprotection.gov.sk",
    complaint_url: "https://dataprotection.gov.sk/uoou/en/content/complaint",
    contact_email: "statny.dozor@pdp.gov.sk",
    phone: "+421 2 323 132 14",
    address: "Hraničná 12, 820 07 Bratislava 27, Slovakia",
  },
  // EEA countries (non-EU)
  IS: {
    country_code: "IS",
    country_name: "Iceland",
    authority_name: "Persónuvernd",
    website: "https://www.personuvernd.is",
    complaint_url: "https://www.personuvernd.is/information-in-english/complaints",
    contact_email: "postur@personuvernd.is",
    phone: "+354 510 9600",
    address: "Rauðarárstígur 10, 105 Reykjavik, Iceland",
  },
  LI: {
    country_code: "LI",
    country_name: "Liechtenstein",
    authority_name: "Datenschutzstelle Fürstentum Liechtenstein",
    website: "https://www.datenschutzstelle.li",
    complaint_url: "https://www.datenschutzstelle.li/beschwerde",
    contact_email: "info.dss@llv.li",
    phone: "+423 236 60 90",
    address: "Städtle 38, Postfach 684, 9490 Vaduz, Liechtenstein",
  },
  NO: {
    country_code: "NO",
    country_name: "Norway",
    authority_name: "Datatilsynet",
    website: "https://www.datatilsynet.no",
    complaint_url: "https://www.datatilsynet.no/en/about-complaints/",
    contact_email: "postkasse@datatilsynet.no",
    phone: "+47 22 39 69 00",
    address: "Postboks 458 Sentrum, 0105 Oslo, Norway",
  },
};

// Country name to code mapping for fuzzy lookup
const COUNTRY_NAME_MAP: Record<string, string> = {
  austria: "AT", belgium: "BE", bulgaria: "BG", cyprus: "CY",
  "czech republic": "CZ", czechia: "CZ", germany: "DE", denmark: "DK",
  estonia: "EE", spain: "ES", finland: "FI", france: "FR",
  greece: "GR", croatia: "HR", hungary: "HU", ireland: "IE",
  italy: "IT", lithuania: "LT", luxembourg: "LU", latvia: "LV",
  malta: "MT", netherlands: "NL", holland: "NL", poland: "PL",
  portugal: "PT", romania: "RO", sweden: "SE", slovenia: "SI",
  slovakia: "SK", iceland: "IS", liechtenstein: "LI", norway: "NO",
};

function resolveCountryCode(input: string): string | null {
  const trimmed = input.trim().toUpperCase();

  // Direct code match
  if (DPA_DIRECTORY[trimmed]) return trimmed;

  // Country name match
  const lower = input.trim().toLowerCase();
  const code = COUNTRY_NAME_MAP[lower];
  if (code) return code;

  // Partial match
  for (const [name, c] of Object.entries(COUNTRY_NAME_MAP)) {
    if (lower.includes(name) || name.includes(lower)) return c;
  }

  return null;
}

registerCapability("data-protection-authority-lookup", async (input: CapabilityInput) => {
  const rawCode = ((input.country_code as string) ?? "").trim();
  const rawCountry = ((input.country as string) ?? "").trim();
  const rawTask = ((input.task as string) ?? "").trim();

  const searchInput = rawCode || rawCountry || rawTask;

  if (!searchInput) {
    throw new Error(
      "'country_code' or 'country' is required. Provide an EU/EEA country code (e.g. 'SE', 'DE', 'FR') or country name.",
    );
  }

  const code = resolveCountryCode(searchInput);

  if (!code || !DPA_DIRECTORY[code]) {
    // Return list of supported countries
    const supported = Object.keys(DPA_DIRECTORY).sort().join(", ");
    throw new Error(
      `No DPA found for "${searchInput}". Supported EU/EEA country codes: ${supported}`,
    );
  }

  const dpa = DPA_DIRECTORY[code];

  return {
    output: { ...dpa },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
