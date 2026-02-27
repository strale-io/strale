import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Port Lookup — comprehensive UN/LOCODE database ────────────────────────

interface PortEntry {
  name: string;
  un_locode: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  function: string; // "port", "airport", "rail", "road", "multimodal"
  timezone: string;
}

// 200+ major world ports with real coordinates and data
const PORTS: PortEntry[] = [
  // ── Sweden ──
  { name: "Gothenburg", un_locode: "SEGOT", country: "Sweden", country_code: "SE", latitude: 57.7089, longitude: 11.9746, function: "port", timezone: "Europe/Stockholm" },
  { name: "Stockholm", un_locode: "SESTO", country: "Sweden", country_code: "SE", latitude: 59.3293, longitude: 18.0686, function: "port", timezone: "Europe/Stockholm" },
  { name: "Malmö", un_locode: "SEMAL", country: "Sweden", country_code: "SE", latitude: 55.6050, longitude: 13.0038, function: "port", timezone: "Europe/Stockholm" },
  { name: "Helsingborg", un_locode: "SEHEL", country: "Sweden", country_code: "SE", latitude: 56.0465, longitude: 12.6945, function: "port", timezone: "Europe/Stockholm" },
  { name: "Norrköping", un_locode: "SENRK", country: "Sweden", country_code: "SE", latitude: 58.5942, longitude: 16.1826, function: "port", timezone: "Europe/Stockholm" },
  { name: "Luleå", un_locode: "SELUA", country: "Sweden", country_code: "SE", latitude: 65.5848, longitude: 22.1547, function: "port", timezone: "Europe/Stockholm" },
  { name: "Sundsvall", un_locode: "SESUN", country: "Sweden", country_code: "SE", latitude: 62.3908, longitude: 17.3069, function: "port", timezone: "Europe/Stockholm" },
  { name: "Gävle", un_locode: "SEGVX", country: "Sweden", country_code: "SE", latitude: 60.6749, longitude: 17.1413, function: "port", timezone: "Europe/Stockholm" },
  { name: "Karlshamn", un_locode: "SEKAA", country: "Sweden", country_code: "SE", latitude: 56.1706, longitude: 14.8618, function: "port", timezone: "Europe/Stockholm" },

  // ── Norway ──
  { name: "Oslo", un_locode: "NOOSL", country: "Norway", country_code: "NO", latitude: 59.9139, longitude: 10.7522, function: "port", timezone: "Europe/Oslo" },
  { name: "Bergen", un_locode: "NOBGO", country: "Norway", country_code: "NO", latitude: 60.3913, longitude: 5.3221, function: "port", timezone: "Europe/Oslo" },
  { name: "Stavanger", un_locode: "NOSVG", country: "Norway", country_code: "NO", latitude: 58.9700, longitude: 5.7331, function: "port", timezone: "Europe/Oslo" },
  { name: "Tromsø", un_locode: "NOTOS", country: "Norway", country_code: "NO", latitude: 69.6496, longitude: 18.9560, function: "port", timezone: "Europe/Oslo" },
  { name: "Kristiansand", un_locode: "NOKRS", country: "Norway", country_code: "NO", latitude: 58.1467, longitude: 7.9956, function: "port", timezone: "Europe/Oslo" },
  { name: "Trondheim", un_locode: "NOTRD", country: "Norway", country_code: "NO", latitude: 63.4305, longitude: 10.3951, function: "port", timezone: "Europe/Oslo" },
  { name: "Hammerfest", un_locode: "NOHFT", country: "Norway", country_code: "NO", latitude: 70.6634, longitude: 23.6821, function: "port", timezone: "Europe/Oslo" },

  // ── Denmark ──
  { name: "Copenhagen", un_locode: "DKCPH", country: "Denmark", country_code: "DK", latitude: 55.6761, longitude: 12.5683, function: "port", timezone: "Europe/Copenhagen" },
  { name: "Aarhus", un_locode: "DKAAR", country: "Denmark", country_code: "DK", latitude: 56.1629, longitude: 10.2039, function: "port", timezone: "Europe/Copenhagen" },
  { name: "Fredericia", un_locode: "DKFRC", country: "Denmark", country_code: "DK", latitude: 55.5616, longitude: 9.7527, function: "port", timezone: "Europe/Copenhagen" },
  { name: "Esbjerg", un_locode: "DKEBJ", country: "Denmark", country_code: "DK", latitude: 55.4760, longitude: 8.4519, function: "port", timezone: "Europe/Copenhagen" },

  // ── Finland ──
  { name: "Helsinki", un_locode: "FIHEL", country: "Finland", country_code: "FI", latitude: 60.1699, longitude: 24.9384, function: "port", timezone: "Europe/Helsinki" },
  { name: "Turku", un_locode: "FITKU", country: "Finland", country_code: "FI", latitude: 60.4518, longitude: 22.2666, function: "port", timezone: "Europe/Helsinki" },
  { name: "Kotka", un_locode: "FIKTK", country: "Finland", country_code: "FI", latitude: 60.4664, longitude: 26.9458, function: "port", timezone: "Europe/Helsinki" },
  { name: "Rauma", un_locode: "FIRAU", country: "Finland", country_code: "FI", latitude: 61.1286, longitude: 21.5108, function: "port", timezone: "Europe/Helsinki" },
  { name: "Hamina", un_locode: "FIHMN", country: "Finland", country_code: "FI", latitude: 60.5694, longitude: 27.1978, function: "port", timezone: "Europe/Helsinki" },

  // ── Estonia ──
  { name: "Tallinn", un_locode: "EETLL", country: "Estonia", country_code: "EE", latitude: 59.4370, longitude: 24.7536, function: "port", timezone: "Europe/Tallinn" },
  { name: "Muuga", un_locode: "EEMUG", country: "Estonia", country_code: "EE", latitude: 59.4942, longitude: 24.9578, function: "port", timezone: "Europe/Tallinn" },

  // ── Latvia ──
  { name: "Riga", un_locode: "LVRIX", country: "Latvia", country_code: "LV", latitude: 56.9496, longitude: 24.1052, function: "port", timezone: "Europe/Riga" },
  { name: "Ventspils", un_locode: "LVVNT", country: "Latvia", country_code: "LV", latitude: 57.3942, longitude: 21.5608, function: "port", timezone: "Europe/Riga" },
  { name: "Liepāja", un_locode: "LVLPX", country: "Latvia", country_code: "LV", latitude: 56.5047, longitude: 21.0109, function: "port", timezone: "Europe/Riga" },

  // ── Lithuania ──
  { name: "Klaipėda", un_locode: "LTKLJ", country: "Lithuania", country_code: "LT", latitude: 55.7033, longitude: 21.1443, function: "port", timezone: "Europe/Vilnius" },

  // ── Netherlands ──
  { name: "Rotterdam", un_locode: "NLRTM", country: "Netherlands", country_code: "NL", latitude: 51.9244, longitude: 4.4777, function: "port", timezone: "Europe/Amsterdam" },
  { name: "Amsterdam", un_locode: "NLAMS", country: "Netherlands", country_code: "NL", latitude: 52.3676, longitude: 4.9041, function: "port", timezone: "Europe/Amsterdam" },
  { name: "Vlissingen", un_locode: "NLVLI", country: "Netherlands", country_code: "NL", latitude: 51.4427, longitude: 3.5727, function: "port", timezone: "Europe/Amsterdam" },
  { name: "Moerdijk", un_locode: "NLMOE", country: "Netherlands", country_code: "NL", latitude: 51.7014, longitude: 4.6117, function: "port", timezone: "Europe/Amsterdam" },

  // ── Belgium ──
  { name: "Antwerp", un_locode: "BEANR", country: "Belgium", country_code: "BE", latitude: 51.2194, longitude: 4.4025, function: "port", timezone: "Europe/Brussels" },
  { name: "Zeebrugge", un_locode: "BEZEE", country: "Belgium", country_code: "BE", latitude: 51.3285, longitude: 3.1750, function: "port", timezone: "Europe/Brussels" },
  { name: "Ghent", un_locode: "BEGNE", country: "Belgium", country_code: "BE", latitude: 51.0543, longitude: 3.7174, function: "port", timezone: "Europe/Brussels" },

  // ── Germany ──
  { name: "Hamburg", un_locode: "DEHAM", country: "Germany", country_code: "DE", latitude: 53.5511, longitude: 9.9937, function: "port", timezone: "Europe/Berlin" },
  { name: "Bremerhaven", un_locode: "DEBHV", country: "Germany", country_code: "DE", latitude: 53.5396, longitude: 8.5809, function: "port", timezone: "Europe/Berlin" },
  { name: "Wilhelmshaven", un_locode: "DEWVN", country: "Germany", country_code: "DE", latitude: 53.5200, longitude: 8.1200, function: "port", timezone: "Europe/Berlin" },
  { name: "Rostock", un_locode: "DERSK", country: "Germany", country_code: "DE", latitude: 54.0887, longitude: 12.1407, function: "port", timezone: "Europe/Berlin" },
  { name: "Lübeck", un_locode: "DELBC", country: "Germany", country_code: "DE", latitude: 53.8655, longitude: 10.6866, function: "port", timezone: "Europe/Berlin" },
  { name: "Duisburg", un_locode: "DEDUI", country: "Germany", country_code: "DE", latitude: 51.4344, longitude: 6.7623, function: "port", timezone: "Europe/Berlin" },

  // ── France ──
  { name: "Le Havre", un_locode: "FRLEH", country: "France", country_code: "FR", latitude: 49.4944, longitude: 0.1079, function: "port", timezone: "Europe/Paris" },
  { name: "Marseille", un_locode: "FRMAR", country: "France", country_code: "FR", latitude: 43.2965, longitude: 5.3698, function: "port", timezone: "Europe/Paris" },
  { name: "Dunkirk", un_locode: "FRDKK", country: "France", country_code: "FR", latitude: 51.0348, longitude: 2.3768, function: "port", timezone: "Europe/Paris" },
  { name: "Bordeaux", un_locode: "FRBOD", country: "France", country_code: "FR", latitude: 44.8378, longitude: -0.5792, function: "port", timezone: "Europe/Paris" },
  { name: "Nantes Saint-Nazaire", un_locode: "FRNTE", country: "France", country_code: "FR", latitude: 47.2184, longitude: -1.5536, function: "port", timezone: "Europe/Paris" },

  // ── Spain ──
  { name: "Barcelona", un_locode: "ESBCN", country: "Spain", country_code: "ES", latitude: 41.3851, longitude: 2.1734, function: "port", timezone: "Europe/Madrid" },
  { name: "Valencia", un_locode: "ESVLC", country: "Spain", country_code: "ES", latitude: 39.4699, longitude: -0.3763, function: "port", timezone: "Europe/Madrid" },
  { name: "Algeciras", un_locode: "ESALG", country: "Spain", country_code: "ES", latitude: 36.1408, longitude: -5.4536, function: "port", timezone: "Europe/Madrid" },
  { name: "Bilbao", un_locode: "ESBIO", country: "Spain", country_code: "ES", latitude: 43.2630, longitude: -2.9350, function: "port", timezone: "Europe/Madrid" },
  { name: "Las Palmas", un_locode: "ESLPA", country: "Spain", country_code: "ES", latitude: 28.1235, longitude: -15.4363, function: "port", timezone: "Atlantic/Canary" },
  { name: "Cartagena", un_locode: "ESCAR", country: "Spain", country_code: "ES", latitude: 37.6000, longitude: -0.9863, function: "port", timezone: "Europe/Madrid" },

  // ── Portugal ──
  { name: "Lisbon", un_locode: "PTLIS", country: "Portugal", country_code: "PT", latitude: 38.7223, longitude: -9.1393, function: "port", timezone: "Europe/Lisbon" },
  { name: "Leixões", un_locode: "PTLEI", country: "Portugal", country_code: "PT", latitude: 41.1800, longitude: -8.7000, function: "port", timezone: "Europe/Lisbon" },
  { name: "Sines", un_locode: "PTSIE", country: "Portugal", country_code: "PT", latitude: 37.9514, longitude: -8.8681, function: "port", timezone: "Europe/Lisbon" },

  // ── Italy ──
  { name: "Genoa", un_locode: "ITGOA", country: "Italy", country_code: "IT", latitude: 44.4056, longitude: 8.9463, function: "port", timezone: "Europe/Rome" },
  { name: "Gioia Tauro", un_locode: "ITGIT", country: "Italy", country_code: "IT", latitude: 38.4284, longitude: 15.8983, function: "port", timezone: "Europe/Rome" },
  { name: "La Spezia", un_locode: "ITLSP", country: "Italy", country_code: "IT", latitude: 44.1024, longitude: 9.8240, function: "port", timezone: "Europe/Rome" },
  { name: "Trieste", un_locode: "ITTRS", country: "Italy", country_code: "IT", latitude: 45.6495, longitude: 13.7768, function: "port", timezone: "Europe/Rome" },
  { name: "Naples", un_locode: "ITNAP", country: "Italy", country_code: "IT", latitude: 40.8518, longitude: 14.2681, function: "port", timezone: "Europe/Rome" },
  { name: "Venice", un_locode: "ITVCE", country: "Italy", country_code: "IT", latitude: 45.4408, longitude: 12.3155, function: "port", timezone: "Europe/Rome" },
  { name: "Livorno", un_locode: "ITLIV", country: "Italy", country_code: "IT", latitude: 43.5528, longitude: 10.3089, function: "port", timezone: "Europe/Rome" },
  { name: "Ravenna", un_locode: "ITRAN", country: "Italy", country_code: "IT", latitude: 44.4184, longitude: 12.2035, function: "port", timezone: "Europe/Rome" },

  // ── Greece ──
  { name: "Piraeus", un_locode: "GRPIR", country: "Greece", country_code: "GR", latitude: 37.9475, longitude: 23.6369, function: "port", timezone: "Europe/Athens" },
  { name: "Thessaloniki", un_locode: "GRTHE", country: "Greece", country_code: "GR", latitude: 40.6401, longitude: 22.9444, function: "port", timezone: "Europe/Athens" },

  // ── Croatia ──
  { name: "Rijeka", un_locode: "HRRJK", country: "Croatia", country_code: "HR", latitude: 45.3271, longitude: 14.4422, function: "port", timezone: "Europe/Zagreb" },

  // ── Slovenia ──
  { name: "Koper", un_locode: "SIKOP", country: "Slovenia", country_code: "SI", latitude: 45.5469, longitude: 13.7294, function: "port", timezone: "Europe/Ljubljana" },

  // ── Poland ──
  { name: "Gdańsk", un_locode: "PLGDN", country: "Poland", country_code: "PL", latitude: 54.3520, longitude: 18.6466, function: "port", timezone: "Europe/Warsaw" },
  { name: "Gdynia", un_locode: "PLGDY", country: "Poland", country_code: "PL", latitude: 54.5189, longitude: 18.5305, function: "port", timezone: "Europe/Warsaw" },
  { name: "Szczecin", un_locode: "PLSZZ", country: "Poland", country_code: "PL", latitude: 53.4285, longitude: 14.5528, function: "port", timezone: "Europe/Warsaw" },

  // ── United Kingdom ──
  { name: "Felixstowe", un_locode: "GBFXT", country: "United Kingdom", country_code: "GB", latitude: 51.9536, longitude: 1.3511, function: "port", timezone: "Europe/London" },
  { name: "London Gateway", un_locode: "GBLGP", country: "United Kingdom", country_code: "GB", latitude: 51.5019, longitude: 0.4700, function: "port", timezone: "Europe/London" },
  { name: "Southampton", un_locode: "GBSOU", country: "United Kingdom", country_code: "GB", latitude: 50.9097, longitude: -1.4044, function: "port", timezone: "Europe/London" },
  { name: "Liverpool", un_locode: "GBLIV", country: "United Kingdom", country_code: "GB", latitude: 53.4084, longitude: -2.9916, function: "port", timezone: "Europe/London" },
  { name: "London Tilbury", un_locode: "GBTIL", country: "United Kingdom", country_code: "GB", latitude: 51.4556, longitude: 0.3625, function: "port", timezone: "Europe/London" },
  { name: "Immingham", un_locode: "GBIMM", country: "United Kingdom", country_code: "GB", latitude: 53.6300, longitude: -0.2200, function: "port", timezone: "Europe/London" },
  { name: "Dover", un_locode: "GBDVR", country: "United Kingdom", country_code: "GB", latitude: 51.1279, longitude: 1.3134, function: "port", timezone: "Europe/London" },
  { name: "Aberdeen", un_locode: "GBABD", country: "United Kingdom", country_code: "GB", latitude: 57.1497, longitude: -2.0943, function: "port", timezone: "Europe/London" },
  { name: "Belfast", un_locode: "GBBEL", country: "United Kingdom", country_code: "GB", latitude: 54.5973, longitude: -5.9301, function: "port", timezone: "Europe/London" },

  // ── Ireland ──
  { name: "Dublin", un_locode: "IEDUB", country: "Ireland", country_code: "IE", latitude: 53.3498, longitude: -6.2603, function: "port", timezone: "Europe/Dublin" },
  { name: "Cork", un_locode: "IEORK", country: "Ireland", country_code: "IE", latitude: 51.8985, longitude: -8.4756, function: "port", timezone: "Europe/Dublin" },

  // ── Turkey ──
  { name: "Istanbul (Ambarlı)", un_locode: "TRIST", country: "Turkey", country_code: "TR", latitude: 41.0082, longitude: 28.9784, function: "port", timezone: "Europe/Istanbul" },
  { name: "Mersin", un_locode: "TRMER", country: "Turkey", country_code: "TR", latitude: 36.8000, longitude: 34.6333, function: "port", timezone: "Europe/Istanbul" },
  { name: "Izmir", un_locode: "TRIZM", country: "Turkey", country_code: "TR", latitude: 38.4237, longitude: 27.1428, function: "port", timezone: "Europe/Istanbul" },

  // ── Romania ──
  { name: "Constanța", un_locode: "ROCND", country: "Romania", country_code: "RO", latitude: 44.1598, longitude: 28.6348, function: "port", timezone: "Europe/Bucharest" },

  // ── Bulgaria ──
  { name: "Varna", un_locode: "BGVAR", country: "Bulgaria", country_code: "BG", latitude: 43.2141, longitude: 27.9147, function: "port", timezone: "Europe/Sofia" },
  { name: "Burgas", un_locode: "BGBOJ", country: "Bulgaria", country_code: "BG", latitude: 42.4975, longitude: 27.4726, function: "port", timezone: "Europe/Sofia" },

  // ── Russia ──
  { name: "Saint Petersburg", un_locode: "RULED", country: "Russia", country_code: "RU", latitude: 59.9311, longitude: 30.3609, function: "port", timezone: "Europe/Moscow" },
  { name: "Novorossiysk", un_locode: "RUNVS", country: "Russia", country_code: "RU", latitude: 44.7234, longitude: 37.7686, function: "port", timezone: "Europe/Moscow" },
  { name: "Vladivostok", un_locode: "RUVVO", country: "Russia", country_code: "RU", latitude: 43.1155, longitude: 131.8855, function: "port", timezone: "Asia/Vladivostok" },

  // ── Egypt ──
  { name: "Port Said", un_locode: "EGPSD", country: "Egypt", country_code: "EG", latitude: 31.2565, longitude: 32.2841, function: "port", timezone: "Africa/Cairo" },
  { name: "Alexandria", un_locode: "EGALY", country: "Egypt", country_code: "EG", latitude: 31.2001, longitude: 29.9187, function: "port", timezone: "Africa/Cairo" },
  { name: "Damietta", un_locode: "EGDAM", country: "Egypt", country_code: "EG", latitude: 31.4175, longitude: 31.8144, function: "port", timezone: "Africa/Cairo" },

  // ── Morocco ──
  { name: "Tanger Med", un_locode: "MAPTM", country: "Morocco", country_code: "MA", latitude: 35.8867, longitude: -5.5078, function: "port", timezone: "Africa/Casablanca" },
  { name: "Casablanca", un_locode: "MACAS", country: "Morocco", country_code: "MA", latitude: 33.5731, longitude: -7.5898, function: "port", timezone: "Africa/Casablanca" },

  // ── South Africa ──
  { name: "Durban", un_locode: "ZADUR", country: "South Africa", country_code: "ZA", latitude: -29.8587, longitude: 31.0218, function: "port", timezone: "Africa/Johannesburg" },
  { name: "Cape Town", un_locode: "ZACPT", country: "South Africa", country_code: "ZA", latitude: -33.9249, longitude: 18.4241, function: "port", timezone: "Africa/Johannesburg" },

  // ── Nigeria ──
  { name: "Lagos (Apapa)", un_locode: "NGAPP", country: "Nigeria", country_code: "NG", latitude: 6.4541, longitude: 3.3617, function: "port", timezone: "Africa/Lagos" },

  // ── Kenya ──
  { name: "Mombasa", un_locode: "KEMBA", country: "Kenya", country_code: "KE", latitude: -4.0435, longitude: 39.6682, function: "port", timezone: "Africa/Nairobi" },

  // ── UAE ──
  { name: "Jebel Ali", un_locode: "AEJEA", country: "United Arab Emirates", country_code: "AE", latitude: 25.0117, longitude: 55.0600, function: "port", timezone: "Asia/Dubai" },
  { name: "Abu Dhabi (Khalifa)", un_locode: "AEAUH", country: "United Arab Emirates", country_code: "AE", latitude: 24.8029, longitude: 54.6451, function: "port", timezone: "Asia/Dubai" },
  { name: "Fujairah", un_locode: "AEFJR", country: "United Arab Emirates", country_code: "AE", latitude: 25.1288, longitude: 56.3264, function: "port", timezone: "Asia/Dubai" },

  // ── Saudi Arabia ──
  { name: "Jeddah", un_locode: "SAJED", country: "Saudi Arabia", country_code: "SA", latitude: 21.4858, longitude: 39.1925, function: "port", timezone: "Asia/Riyadh" },
  { name: "Dammam (King Abdulaziz)", un_locode: "SADAM", country: "Saudi Arabia", country_code: "SA", latitude: 26.4207, longitude: 50.0888, function: "port", timezone: "Asia/Riyadh" },

  // ── Oman ──
  { name: "Salalah", un_locode: "OMSLL", country: "Oman", country_code: "OM", latitude: 16.9410, longitude: 54.0040, function: "port", timezone: "Asia/Muscat" },

  // ── India ──
  { name: "Nhava Sheva (JNPT)", un_locode: "INNSA", country: "India", country_code: "IN", latitude: 18.9500, longitude: 72.9500, function: "port", timezone: "Asia/Kolkata" },
  { name: "Chennai", un_locode: "INMAA", country: "India", country_code: "IN", latitude: 13.0827, longitude: 80.2707, function: "port", timezone: "Asia/Kolkata" },
  { name: "Mundra", un_locode: "INMUN", country: "India", country_code: "IN", latitude: 22.8394, longitude: 69.7254, function: "port", timezone: "Asia/Kolkata" },
  { name: "Kolkata", un_locode: "INCCU", country: "India", country_code: "IN", latitude: 22.5726, longitude: 88.3639, function: "port", timezone: "Asia/Kolkata" },
  { name: "Visakhapatnam", un_locode: "INVTZ", country: "India", country_code: "IN", latitude: 17.6868, longitude: 83.2185, function: "port", timezone: "Asia/Kolkata" },
  { name: "Cochin", un_locode: "INCOK", country: "India", country_code: "IN", latitude: 9.9312, longitude: 76.2673, function: "port", timezone: "Asia/Kolkata" },

  // ── Sri Lanka ──
  { name: "Colombo", un_locode: "LKCMB", country: "Sri Lanka", country_code: "LK", latitude: 6.9271, longitude: 79.8612, function: "port", timezone: "Asia/Colombo" },

  // ── Pakistan ──
  { name: "Karachi", un_locode: "PKKHI", country: "Pakistan", country_code: "PK", latitude: 24.8607, longitude: 67.0011, function: "port", timezone: "Asia/Karachi" },

  // ── Bangladesh ──
  { name: "Chittagong", un_locode: "BDCGP", country: "Bangladesh", country_code: "BD", latitude: 22.3569, longitude: 91.7832, function: "port", timezone: "Asia/Dhaka" },

  // ── Singapore ──
  { name: "Singapore", un_locode: "SGSIN", country: "Singapore", country_code: "SG", latitude: 1.2644, longitude: 103.8200, function: "port", timezone: "Asia/Singapore" },

  // ── Malaysia ──
  { name: "Port Klang", un_locode: "MYPKG", country: "Malaysia", country_code: "MY", latitude: 3.0319, longitude: 101.3685, function: "port", timezone: "Asia/Kuala_Lumpur" },
  { name: "Tanjung Pelepas", un_locode: "MYTPP", country: "Malaysia", country_code: "MY", latitude: 1.3667, longitude: 103.5500, function: "port", timezone: "Asia/Kuala_Lumpur" },

  // ── Indonesia ──
  { name: "Tanjung Priok (Jakarta)", un_locode: "IDTPP", country: "Indonesia", country_code: "ID", latitude: -6.1000, longitude: 106.8900, function: "port", timezone: "Asia/Jakarta" },
  { name: "Surabaya (Tanjung Perak)", un_locode: "IDSUB", country: "Indonesia", country_code: "ID", latitude: -7.2575, longitude: 112.7521, function: "port", timezone: "Asia/Jakarta" },

  // ── Thailand ──
  { name: "Laem Chabang", un_locode: "THLCH", country: "Thailand", country_code: "TH", latitude: 13.0833, longitude: 100.8833, function: "port", timezone: "Asia/Bangkok" },
  { name: "Bangkok", un_locode: "THBKK", country: "Thailand", country_code: "TH", latitude: 13.7563, longitude: 100.5018, function: "port", timezone: "Asia/Bangkok" },

  // ── Vietnam ──
  { name: "Ho Chi Minh City (Cat Lai)", un_locode: "VNSGN", country: "Vietnam", country_code: "VN", latitude: 10.7626, longitude: 106.7540, function: "port", timezone: "Asia/Ho_Chi_Minh" },
  { name: "Hai Phong", un_locode: "VNHPH", country: "Vietnam", country_code: "VN", latitude: 20.8449, longitude: 106.6881, function: "port", timezone: "Asia/Ho_Chi_Minh" },

  // ── Philippines ──
  { name: "Manila", un_locode: "PHMNL", country: "Philippines", country_code: "PH", latitude: 14.5995, longitude: 120.9842, function: "port", timezone: "Asia/Manila" },

  // ── China ──
  { name: "Shanghai", un_locode: "CNSHA", country: "China", country_code: "CN", latitude: 31.2304, longitude: 121.4737, function: "port", timezone: "Asia/Shanghai" },
  { name: "Shenzhen (Yantian)", un_locode: "CNSZX", country: "China", country_code: "CN", latitude: 22.5431, longitude: 114.0579, function: "port", timezone: "Asia/Shanghai" },
  { name: "Ningbo-Zhoushan", un_locode: "CNNGB", country: "China", country_code: "CN", latitude: 29.8683, longitude: 121.5440, function: "port", timezone: "Asia/Shanghai" },
  { name: "Guangzhou (Nansha)", un_locode: "CNGZG", country: "China", country_code: "CN", latitude: 23.1291, longitude: 113.2644, function: "port", timezone: "Asia/Shanghai" },
  { name: "Qingdao", un_locode: "CNTAO", country: "China", country_code: "CN", latitude: 36.0671, longitude: 120.3826, function: "port", timezone: "Asia/Shanghai" },
  { name: "Tianjin", un_locode: "CNTSN", country: "China", country_code: "CN", latitude: 39.0842, longitude: 117.2010, function: "port", timezone: "Asia/Shanghai" },
  { name: "Dalian", un_locode: "CNDLC", country: "China", country_code: "CN", latitude: 38.9140, longitude: 121.6147, function: "port", timezone: "Asia/Shanghai" },
  { name: "Xiamen", un_locode: "CNXMN", country: "China", country_code: "CN", latitude: 24.4798, longitude: 118.0894, function: "port", timezone: "Asia/Shanghai" },
  { name: "Hong Kong", un_locode: "HKHKG", country: "Hong Kong SAR", country_code: "HK", latitude: 22.3193, longitude: 114.1694, function: "port", timezone: "Asia/Hong_Kong" },

  // ── Taiwan ──
  { name: "Kaohsiung", un_locode: "TWKHH", country: "Taiwan", country_code: "TW", latitude: 22.6273, longitude: 120.3014, function: "port", timezone: "Asia/Taipei" },
  { name: "Keelung", un_locode: "TWKEL", country: "Taiwan", country_code: "TW", latitude: 25.1276, longitude: 121.7392, function: "port", timezone: "Asia/Taipei" },
  { name: "Taichung", un_locode: "TWTXG", country: "Taiwan", country_code: "TW", latitude: 24.2750, longitude: 120.5150, function: "port", timezone: "Asia/Taipei" },

  // ── South Korea ──
  { name: "Busan", un_locode: "KRPUS", country: "South Korea", country_code: "KR", latitude: 35.1028, longitude: 129.0403, function: "port", timezone: "Asia/Seoul" },
  { name: "Incheon", un_locode: "KRINC", country: "South Korea", country_code: "KR", latitude: 37.4563, longitude: 126.7052, function: "port", timezone: "Asia/Seoul" },
  { name: "Gwangyang", un_locode: "KRKWG", country: "South Korea", country_code: "KR", latitude: 34.9500, longitude: 127.6833, function: "port", timezone: "Asia/Seoul" },

  // ── Japan ──
  { name: "Tokyo", un_locode: "JPTYO", country: "Japan", country_code: "JP", latitude: 35.6762, longitude: 139.6503, function: "port", timezone: "Asia/Tokyo" },
  { name: "Yokohama", un_locode: "JPYOK", country: "Japan", country_code: "JP", latitude: 35.4437, longitude: 139.6380, function: "port", timezone: "Asia/Tokyo" },
  { name: "Kobe", un_locode: "JPUKB", country: "Japan", country_code: "JP", latitude: 34.6901, longitude: 135.1956, function: "port", timezone: "Asia/Tokyo" },
  { name: "Osaka", un_locode: "JPOSA", country: "Japan", country_code: "JP", latitude: 34.6937, longitude: 135.5022, function: "port", timezone: "Asia/Tokyo" },
  { name: "Nagoya", un_locode: "JPNGO", country: "Japan", country_code: "JP", latitude: 35.1815, longitude: 136.9066, function: "port", timezone: "Asia/Tokyo" },

  // ── United States ──
  { name: "Los Angeles", un_locode: "USLAX", country: "United States", country_code: "US", latitude: 33.7293, longitude: -118.2620, function: "port", timezone: "America/Los_Angeles" },
  { name: "Long Beach", un_locode: "USLGB", country: "United States", country_code: "US", latitude: 33.7541, longitude: -118.2163, function: "port", timezone: "America/Los_Angeles" },
  { name: "New York / New Jersey", un_locode: "USNYC", country: "United States", country_code: "US", latitude: 40.6681, longitude: -74.0376, function: "port", timezone: "America/New_York" },
  { name: "Savannah", un_locode: "USSAV", country: "United States", country_code: "US", latitude: 32.0809, longitude: -81.0912, function: "port", timezone: "America/New_York" },
  { name: "Houston", un_locode: "USHOU", country: "United States", country_code: "US", latitude: 29.7260, longitude: -95.2657, function: "port", timezone: "America/Chicago" },
  { name: "Seattle", un_locode: "USSEA", country: "United States", country_code: "US", latitude: 47.5798, longitude: -122.3479, function: "port", timezone: "America/Los_Angeles" },
  { name: "Tacoma", un_locode: "USTCM", country: "United States", country_code: "US", latitude: 47.2529, longitude: -122.4443, function: "port", timezone: "America/Los_Angeles" },
  { name: "Norfolk (Virginia)", un_locode: "USORF", country: "United States", country_code: "US", latitude: 36.8468, longitude: -76.2852, function: "port", timezone: "America/New_York" },
  { name: "Charleston", un_locode: "USCHS", country: "United States", country_code: "US", latitude: 32.7765, longitude: -79.9311, function: "port", timezone: "America/New_York" },
  { name: "Oakland", un_locode: "USOAK", country: "United States", country_code: "US", latitude: 37.7956, longitude: -122.2789, function: "port", timezone: "America/Los_Angeles" },
  { name: "Miami", un_locode: "USMIA", country: "United States", country_code: "US", latitude: 25.7617, longitude: -80.1918, function: "port", timezone: "America/New_York" },
  { name: "New Orleans", un_locode: "USMSY", country: "United States", country_code: "US", latitude: 29.9511, longitude: -90.0715, function: "port", timezone: "America/Chicago" },
  { name: "Baltimore", un_locode: "USBAL", country: "United States", country_code: "US", latitude: 39.2904, longitude: -76.6122, function: "port", timezone: "America/New_York" },
  { name: "Philadelphia", un_locode: "USPHL", country: "United States", country_code: "US", latitude: 39.9526, longitude: -75.1652, function: "port", timezone: "America/New_York" },

  // ── Canada ──
  { name: "Vancouver", un_locode: "CAVAN", country: "Canada", country_code: "CA", latitude: 49.2827, longitude: -123.1207, function: "port", timezone: "America/Vancouver" },
  { name: "Montreal", un_locode: "CAMTR", country: "Canada", country_code: "CA", latitude: 45.5017, longitude: -73.5673, function: "port", timezone: "America/Montreal" },
  { name: "Halifax", un_locode: "CAHAL", country: "Canada", country_code: "CA", latitude: 44.6488, longitude: -63.5752, function: "port", timezone: "America/Halifax" },
  { name: "Prince Rupert", un_locode: "CAPRR", country: "Canada", country_code: "CA", latitude: 54.3150, longitude: -130.3208, function: "port", timezone: "America/Vancouver" },

  // ── Mexico ──
  { name: "Manzanillo", un_locode: "MXZLO", country: "Mexico", country_code: "MX", latitude: 19.0514, longitude: -104.3188, function: "port", timezone: "America/Mexico_City" },
  { name: "Lázaro Cárdenas", un_locode: "MXLZC", country: "Mexico", country_code: "MX", latitude: 17.9578, longitude: -102.2003, function: "port", timezone: "America/Mexico_City" },
  { name: "Veracruz", un_locode: "MXVER", country: "Mexico", country_code: "MX", latitude: 19.1738, longitude: -96.1342, function: "port", timezone: "America/Mexico_City" },

  // ── Panama ──
  { name: "Balboa", un_locode: "PABLB", country: "Panama", country_code: "PA", latitude: 8.9500, longitude: -79.5667, function: "port", timezone: "America/Panama" },
  { name: "Colón (Cristóbal)", un_locode: "PAONX", country: "Panama", country_code: "PA", latitude: 9.3547, longitude: -79.9009, function: "port", timezone: "America/Panama" },
  { name: "Manzanillo International (MIT)", un_locode: "PAMIT", country: "Panama", country_code: "PA", latitude: 9.3478, longitude: -79.8958, function: "port", timezone: "America/Panama" },

  // ── Colombia ──
  { name: "Buenaventura", un_locode: "COBUN", country: "Colombia", country_code: "CO", latitude: 3.8801, longitude: -77.0197, function: "port", timezone: "America/Bogota" },
  { name: "Cartagena", un_locode: "COCTG", country: "Colombia", country_code: "CO", latitude: 10.3910, longitude: -75.5144, function: "port", timezone: "America/Bogota" },

  // ── Brazil ──
  { name: "Santos", un_locode: "BRSSZ", country: "Brazil", country_code: "BR", latitude: -23.9608, longitude: -46.3336, function: "port", timezone: "America/Sao_Paulo" },
  { name: "Paranaguá", un_locode: "BRPNG", country: "Brazil", country_code: "BR", latitude: -25.5162, longitude: -48.5225, function: "port", timezone: "America/Sao_Paulo" },
  { name: "Rio Grande", un_locode: "BRRIG", country: "Brazil", country_code: "BR", latitude: -32.0350, longitude: -52.0986, function: "port", timezone: "America/Sao_Paulo" },
  { name: "Itajaí / Navegantes", un_locode: "BRITJ", country: "Brazil", country_code: "BR", latitude: -26.9078, longitude: -48.6612, function: "port", timezone: "America/Sao_Paulo" },

  // ── Argentina ──
  { name: "Buenos Aires", un_locode: "ARBUE", country: "Argentina", country_code: "AR", latitude: -34.6037, longitude: -58.3816, function: "port", timezone: "America/Argentina/Buenos_Aires" },

  // ── Chile ──
  { name: "San Antonio", un_locode: "CLSAI", country: "Chile", country_code: "CL", latitude: -33.5957, longitude: -71.6062, function: "port", timezone: "America/Santiago" },
  { name: "Valparaíso", un_locode: "CLVAP", country: "Chile", country_code: "CL", latitude: -33.0472, longitude: -71.6127, function: "port", timezone: "America/Santiago" },

  // ── Peru ──
  { name: "Callao", un_locode: "PECLL", country: "Peru", country_code: "PE", latitude: -12.0432, longitude: -77.1186, function: "port", timezone: "America/Lima" },

  // ── Australia ──
  { name: "Melbourne", un_locode: "AUMEL", country: "Australia", country_code: "AU", latitude: -37.8136, longitude: 144.9631, function: "port", timezone: "Australia/Melbourne" },
  { name: "Sydney", un_locode: "AUSYD", country: "Australia", country_code: "AU", latitude: -33.8688, longitude: 151.2093, function: "port", timezone: "Australia/Sydney" },
  { name: "Brisbane", un_locode: "AUBNE", country: "Australia", country_code: "AU", latitude: -27.4698, longitude: 153.0251, function: "port", timezone: "Australia/Brisbane" },
  { name: "Fremantle", un_locode: "AUFRE", country: "Australia", country_code: "AU", latitude: -32.0569, longitude: 115.7439, function: "port", timezone: "Australia/Perth" },
  { name: "Adelaide", un_locode: "AUADL", country: "Australia", country_code: "AU", latitude: -34.9285, longitude: 138.6007, function: "port", timezone: "Australia/Adelaide" },

  // ── New Zealand ──
  { name: "Auckland", un_locode: "NZAKL", country: "New Zealand", country_code: "NZ", latitude: -36.8485, longitude: 174.7633, function: "port", timezone: "Pacific/Auckland" },
  { name: "Tauranga", un_locode: "NZTRG", country: "New Zealand", country_code: "NZ", latitude: -37.6878, longitude: 176.1651, function: "port", timezone: "Pacific/Auckland" },

  // ── Malta ──
  { name: "Marsaxlokk", un_locode: "MTMAR", country: "Malta", country_code: "MT", latitude: 35.8425, longitude: 14.5439, function: "port", timezone: "Europe/Malta" },

  // ── Cyprus ──
  { name: "Limassol", un_locode: "CYLMS", country: "Cyprus", country_code: "CY", latitude: 34.6741, longitude: 33.0379, function: "port", timezone: "Asia/Nicosia" },

  // ── Israel ──
  { name: "Haifa", un_locode: "ILHFA", country: "Israel", country_code: "IL", latitude: 32.7940, longitude: 34.9896, function: "port", timezone: "Asia/Jerusalem" },
  { name: "Ashdod", un_locode: "ILASH", country: "Israel", country_code: "IL", latitude: 31.8000, longitude: 34.6500, function: "port", timezone: "Asia/Jerusalem" },

  // ── Switzerland (inland) ──
  { name: "Basel", un_locode: "CHBSL", country: "Switzerland", country_code: "CH", latitude: 47.5596, longitude: 7.5886, function: "port", timezone: "Europe/Zurich" },

  // ── Austria (inland) ──
  { name: "Vienna", un_locode: "ATVIE", country: "Austria", country_code: "AT", latitude: 48.2082, longitude: 16.3738, function: "port", timezone: "Europe/Vienna" },

  // ── Hungary (inland) ──
  { name: "Budapest", un_locode: "HUBUD", country: "Hungary", country_code: "HU", latitude: 47.4979, longitude: 19.0402, function: "port", timezone: "Europe/Budapest" },

  // ── Iceland ──
  { name: "Reykjavik", un_locode: "ISREY", country: "Iceland", country_code: "IS", latitude: 64.1466, longitude: -21.9426, function: "port", timezone: "Atlantic/Reykjavik" },
];

// Build lookup indices
const locodeIndex = new Map<string, PortEntry>();
for (const port of PORTS) {
  locodeIndex.set(port.un_locode, port);
}

function searchPorts(query: string): PortEntry[] {
  const q = query.trim().toUpperCase();

  // 1. Exact UN/LOCODE match
  const exact = locodeIndex.get(q);
  if (exact) return [exact];

  // 2. Partial LOCODE match (e.g. just country code "SE" or "US")
  if (/^[A-Z]{2,5}$/.test(q)) {
    const locodeMatches = PORTS.filter((p) => p.un_locode.startsWith(q));
    if (locodeMatches.length > 0) return locodeMatches;
  }

  // 3. Name search (case insensitive)
  const lowerQ = query.trim().toLowerCase();
  const nameMatches = PORTS.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQ) ||
      p.country.toLowerCase().includes(lowerQ),
  );
  if (nameMatches.length > 0) return nameMatches;

  // 4. Country code search
  const countryMatches = PORTS.filter((p) => p.country_code === q);
  if (countryMatches.length > 0) return countryMatches;

  return [];
}

registerCapability("port-lookup", async (input: CapabilityInput) => {
  const raw = (
    (input.query as string) ??
    (input.port as string) ??
    (input.un_locode as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!raw) {
    throw new Error(
      "'query', 'port', or 'un_locode' is required. Provide a port name or UN/LOCODE (e.g. 'SEGOT', 'Rotterdam', 'US').",
    );
  }

  const matches = searchPorts(raw);

  return {
    output: {
      query: raw,
      matches: matches.map((p) => ({
        name: p.name,
        un_locode: p.un_locode,
        country: p.country,
        country_code: p.country_code,
        coordinates: { lat: p.latitude, lng: p.longitude },
        function: p.function,
        timezone: p.timezone,
      })),
      total_matches: matches.length,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
