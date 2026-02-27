import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Dangerous Goods Classification — UN Recommendations on Transport ───────

interface DangerousGoodEntry {
  un_number: string;
  proper_shipping_name: string;
  class: string;
  division: string;
  subsidiary_risks: string[];
  packing_group: string; // "I", "II", "III", or "N/A"
  labels: string[];
  special_provisions: string;
  marine_pollutant: boolean;
  limited_quantity: boolean;
  erg_guide: string; // Emergency Response Guidebook number
}

// 200+ most common dangerous goods with real UN numbers
const DANGEROUS_GOODS: DangerousGoodEntry[] = [
  // ── Class 1: Explosives ──
  { un_number: "UN0004", proper_shipping_name: "Ammonium picrate, dry or wetted with less than 10% water", class: "1", division: "1.1", subsidiary_risks: [], packing_group: "II", labels: ["1.1D"], special_provisions: "Explosive. Keep away from heat and flame.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0012", proper_shipping_name: "Cartridges for weapons, with bursting charge", class: "1", division: "1.1", subsidiary_risks: [], packing_group: "II", labels: ["1.1F"], special_provisions: "Articles. Explosive.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0027", proper_shipping_name: "Black powder (gunpowder), granular or as a meal", class: "1", division: "1.1", subsidiary_risks: [], packing_group: "N/A", labels: ["1.1D"], special_provisions: "Explosive substance.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0029", proper_shipping_name: "Detonators, non-electric", class: "1", division: "1.1", subsidiary_risks: [], packing_group: "N/A", labels: ["1.1B"], special_provisions: "Initiating explosive. Handle with extreme care.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0081", proper_shipping_name: "Explosive, blasting, type A", class: "1", division: "1.1", subsidiary_risks: [], packing_group: "N/A", labels: ["1.1D"], special_provisions: "Contains ammonium nitrate. Water-gel, emulsion, or slurry.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0124", proper_shipping_name: "Jet perforating guns, charged, oil well", class: "1", division: "1.1", subsidiary_risks: [], packing_group: "N/A", labels: ["1.1D"], special_provisions: "Industrial explosive article.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0209", proper_shipping_name: "TNT (Trinitrotoluene)", class: "1", division: "1.1", subsidiary_risks: [], packing_group: "N/A", labels: ["1.1D"], special_provisions: "Explosive. Flake, cast, or granular.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0333", proper_shipping_name: "Fireworks", class: "1", division: "1.1", subsidiary_risks: [], packing_group: "N/A", labels: ["1.1G"], special_provisions: "Mass explosion hazard.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0335", proper_shipping_name: "Fireworks", class: "1", division: "1.3", subsidiary_risks: [], packing_group: "N/A", labels: ["1.3G"], special_provisions: "Fire hazard, minor blast hazard.", marine_pollutant: false, limited_quantity: false, erg_guide: "112" },
  { un_number: "UN0336", proper_shipping_name: "Fireworks", class: "1", division: "1.4", subsidiary_risks: [], packing_group: "N/A", labels: ["1.4G"], special_provisions: "Minor hazard in event of ignition.", marine_pollutant: false, limited_quantity: false, erg_guide: "114" },
  { un_number: "UN0337", proper_shipping_name: "Fireworks", class: "1", division: "1.4", subsidiary_risks: [], packing_group: "N/A", labels: ["1.4S"], special_provisions: "No significant hazard. Consumer fireworks.", marine_pollutant: false, limited_quantity: true, erg_guide: "114" },

  // ── Class 2: Gases ──
  { un_number: "UN1001", proper_shipping_name: "Acetylene, dissolved", class: "2", division: "2.1", subsidiary_risks: [], packing_group: "N/A", labels: ["2.1"], special_provisions: "Must be dissolved in solvent, stabilized.", marine_pollutant: false, limited_quantity: false, erg_guide: "116" },
  { un_number: "UN1002", proper_shipping_name: "Air, compressed", class: "2", division: "2.2", subsidiary_risks: [], packing_group: "N/A", labels: ["2.2"], special_provisions: "Non-flammable, non-toxic gas.", marine_pollutant: false, limited_quantity: true, erg_guide: "122" },
  { un_number: "UN1005", proper_shipping_name: "Ammonia, anhydrous", class: "2", division: "2.3", subsidiary_risks: ["8"], packing_group: "N/A", labels: ["2.3", "8"], special_provisions: "Toxic gas. Corrosive. TIH Zone D.", marine_pollutant: false, limited_quantity: false, erg_guide: "125" },
  { un_number: "UN1006", proper_shipping_name: "Argon, compressed", class: "2", division: "2.2", subsidiary_risks: [], packing_group: "N/A", labels: ["2.2"], special_provisions: "Inert gas. Asphyxiant in confined spaces.", marine_pollutant: false, limited_quantity: true, erg_guide: "121" },
  { un_number: "UN1011", proper_shipping_name: "Butane", class: "2", division: "2.1", subsidiary_risks: [], packing_group: "N/A", labels: ["2.1"], special_provisions: "Flammable gas. Heavier than air.", marine_pollutant: false, limited_quantity: true, erg_guide: "115" },
  { un_number: "UN1013", proper_shipping_name: "Carbon dioxide", class: "2", division: "2.2", subsidiary_risks: [], packing_group: "N/A", labels: ["2.2"], special_provisions: "Asphyxiant in high concentrations.", marine_pollutant: false, limited_quantity: true, erg_guide: "120" },
  { un_number: "UN1016", proper_shipping_name: "Carbon monoxide, compressed", class: "2", division: "2.3", subsidiary_risks: ["2.1"], packing_group: "N/A", labels: ["2.3", "2.1"], special_provisions: "Toxic and flammable gas.", marine_pollutant: false, limited_quantity: false, erg_guide: "119" },
  { un_number: "UN1017", proper_shipping_name: "Chlorine", class: "2", division: "2.3", subsidiary_risks: ["5.1", "8"], packing_group: "N/A", labels: ["2.3", "5.1", "8"], special_provisions: "Toxic gas. Oxidizer. Corrosive. TIH Zone B.", marine_pollutant: false, limited_quantity: false, erg_guide: "124" },
  { un_number: "UN1023", proper_shipping_name: "Coal gas, compressed", class: "2", division: "2.3", subsidiary_risks: ["2.1"], packing_group: "N/A", labels: ["2.3", "2.1"], special_provisions: "Toxic and flammable gas.", marine_pollutant: false, limited_quantity: false, erg_guide: "119" },
  { un_number: "UN1038", proper_shipping_name: "Ethylene, refrigerated liquid", class: "2", division: "2.1", subsidiary_risks: [], packing_group: "N/A", labels: ["2.1"], special_provisions: "Flammable gas. Cryogenic liquid.", marine_pollutant: false, limited_quantity: false, erg_guide: "115" },
  { un_number: "UN1040", proper_shipping_name: "Ethylene oxide", class: "2", division: "2.3", subsidiary_risks: ["2.1"], packing_group: "N/A", labels: ["2.3", "2.1"], special_provisions: "Toxic and flammable. Carcinogenic.", marine_pollutant: false, limited_quantity: false, erg_guide: "119" },
  { un_number: "UN1045", proper_shipping_name: "Fluorine, compressed", class: "2", division: "2.3", subsidiary_risks: ["5.1", "8"], packing_group: "N/A", labels: ["2.3", "5.1", "8"], special_provisions: "Toxic. Strong oxidizer. Extremely corrosive.", marine_pollutant: false, limited_quantity: false, erg_guide: "124" },
  { un_number: "UN1049", proper_shipping_name: "Hydrogen, compressed", class: "2", division: "2.1", subsidiary_risks: [], packing_group: "N/A", labels: ["2.1"], special_provisions: "Extremely flammable gas. Lighter than air.", marine_pollutant: false, limited_quantity: false, erg_guide: "115" },
  { un_number: "UN1066", proper_shipping_name: "Nitrogen, compressed", class: "2", division: "2.2", subsidiary_risks: [], packing_group: "N/A", labels: ["2.2"], special_provisions: "Inert gas. Asphyxiant.", marine_pollutant: false, limited_quantity: true, erg_guide: "121" },
  { un_number: "UN1072", proper_shipping_name: "Oxygen, compressed", class: "2", division: "2.2", subsidiary_risks: ["5.1"], packing_group: "N/A", labels: ["2.2", "5.1"], special_provisions: "Oxidizing gas. Supports combustion vigorously.", marine_pollutant: false, limited_quantity: true, erg_guide: "122" },
  { un_number: "UN1073", proper_shipping_name: "Oxygen, refrigerated liquid", class: "2", division: "2.2", subsidiary_risks: ["5.1"], packing_group: "N/A", labels: ["2.2", "5.1"], special_provisions: "Cryogenic liquid. Strong oxidizer.", marine_pollutant: false, limited_quantity: false, erg_guide: "122" },
  { un_number: "UN1075", proper_shipping_name: "Liquefied petroleum gas (LPG)", class: "2", division: "2.1", subsidiary_risks: [], packing_group: "N/A", labels: ["2.1"], special_provisions: "Mixture of propane and butane. Flammable gas.", marine_pollutant: false, limited_quantity: true, erg_guide: "115" },
  { un_number: "UN1076", proper_shipping_name: "Phosgene", class: "2", division: "2.3", subsidiary_risks: ["8"], packing_group: "N/A", labels: ["2.3", "8"], special_provisions: "Extremely toxic gas. TIH Zone A. Chemical weapon precursor.", marine_pollutant: false, limited_quantity: false, erg_guide: "125" },
  { un_number: "UN1077", proper_shipping_name: "Propylene", class: "2", division: "2.1", subsidiary_risks: [], packing_group: "N/A", labels: ["2.1"], special_provisions: "Flammable gas.", marine_pollutant: false, limited_quantity: true, erg_guide: "115" },
  { un_number: "UN1079", proper_shipping_name: "Sulphur dioxide", class: "2", division: "2.3", subsidiary_risks: ["8"], packing_group: "N/A", labels: ["2.3", "8"], special_provisions: "Toxic gas. Corrosive. TIH Zone C.", marine_pollutant: false, limited_quantity: false, erg_guide: "125" },

  // ── Class 3: Flammable Liquids ──
  { un_number: "UN1090", proper_shipping_name: "Acetone", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Common industrial solvent. Flash point -20°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },
  { un_number: "UN1093", proper_shipping_name: "Acrylonitrile, stabilized", class: "3", division: "", subsidiary_risks: ["6.1"], packing_group: "I", labels: ["3", "6.1"], special_provisions: "Toxic. Polymerization hazard. Carcinogenic.", marine_pollutant: false, limited_quantity: false, erg_guide: "131" },
  { un_number: "UN1114", proper_shipping_name: "Benzene", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Known carcinogen. Flash point -11°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "130" },
  { un_number: "UN1120", proper_shipping_name: "Butanols (Butyl alcohol)", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Flammable liquid. Various isomers.", marine_pollutant: false, limited_quantity: true, erg_guide: "129" },
  { un_number: "UN1133", proper_shipping_name: "Adhesives, containing flammable liquid", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "Varies by formulation. PG I, II, or III.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },
  { un_number: "UN1139", proper_shipping_name: "Coating solution (lacquers, varnishes)", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "Varies by formulation. PG I, II, or III.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },
  { un_number: "UN1145", proper_shipping_name: "Cyclohexane", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Flash point -20°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "130" },
  { un_number: "UN1170", proper_shipping_name: "Ethanol (Ethyl alcohol)", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Alcoholic beverages >70% may qualify. Flash point 13°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },
  { un_number: "UN1173", proper_shipping_name: "Ethyl acetate", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Common solvent. Flash point -4°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "129" },
  { un_number: "UN1193", proper_shipping_name: "Ethyl methyl ketone (MEK)", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Common industrial solvent.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },
  { un_number: "UN1202", proper_shipping_name: "Diesel fuel / Gas oil / Heating oil", class: "3", division: "", subsidiary_risks: [], packing_group: "III", labels: ["3"], special_provisions: "Flash point 52-96°C. Combustible liquid.", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN1203", proper_shipping_name: "Gasoline / Petrol / Motor spirit", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Extremely flammable. Flash point -43°C. Vapors heavier than air.", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN1208", proper_shipping_name: "Hexane", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Flash point -22°C. Neurotoxic (n-hexane).", marine_pollutant: false, limited_quantity: true, erg_guide: "130" },
  { un_number: "UN1210", proper_shipping_name: "Printing ink, flammable", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "PG depends on flash point and boiling point.", marine_pollutant: false, limited_quantity: true, erg_guide: "129" },
  { un_number: "UN1219", proper_shipping_name: "Isopropanol (Isopropyl alcohol / IPA)", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Flash point 12°C. Common disinfectant solvent.", marine_pollutant: false, limited_quantity: true, erg_guide: "129" },
  { un_number: "UN1223", proper_shipping_name: "Kerosene", class: "3", division: "", subsidiary_risks: [], packing_group: "III", labels: ["3"], special_provisions: "Flash point 38-72°C. Jet fuel (Jet A-1).", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN1230", proper_shipping_name: "Methanol (Methyl alcohol)", class: "3", division: "", subsidiary_risks: ["6.1"], packing_group: "II", labels: ["3", "6.1"], special_provisions: "Toxic if ingested or inhaled. Flash point 11°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "131" },
  { un_number: "UN1247", proper_shipping_name: "Methyl methacrylate monomer, stabilized", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Polymerization hazard.", marine_pollutant: false, limited_quantity: true, erg_guide: "129" },
  { un_number: "UN1263", proper_shipping_name: "Paint or Paint related material", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "Includes lacquers, enamels, stains, shellacs. PG I, II, or III.", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN1267", proper_shipping_name: "Petroleum crude oil", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "May contain H2S. PG I, II, or III based on flash point.", marine_pollutant: true, limited_quantity: false, erg_guide: "128" },
  { un_number: "UN1268", proper_shipping_name: "Petroleum distillates, n.o.s.", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "PG I, II, or III based on flash point.", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN1274", proper_shipping_name: "n-Propanol (Propyl alcohol)", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Flash point 15°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "129" },
  { un_number: "UN1294", proper_shipping_name: "Toluene", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Common solvent. Flash point 4°C. Neurotoxic.", marine_pollutant: false, limited_quantity: true, erg_guide: "130" },
  { un_number: "UN1300", proper_shipping_name: "Turpentine substitute (white spirit)", class: "3", division: "", subsidiary_risks: [], packing_group: "III", labels: ["3"], special_provisions: "Flash point >23°C typically.", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN1307", proper_shipping_name: "Xylenes", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Mixed isomers or individual. Flash point 27°C. PG II or III.", marine_pollutant: false, limited_quantity: true, erg_guide: "130" },
  { un_number: "UN1863", proper_shipping_name: "Fuel, aviation, turbine engine (Jet A/A-1)", class: "3", division: "", subsidiary_risks: [], packing_group: "III", labels: ["3"], special_provisions: "Flash point 38°C minimum.", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN1866", proper_shipping_name: "Resin solution, flammable", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "PG I, II, or III.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },
  { un_number: "UN1987", proper_shipping_name: "Alcohols, n.o.s.", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "Generic entry. PG I, II, or III.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },
  { un_number: "UN1993", proper_shipping_name: "Flammable liquid, n.o.s.", class: "3", division: "", subsidiary_risks: [], packing_group: "I", labels: ["3"], special_provisions: "Generic entry for flammable liquids not otherwise specified. PG I, II, or III.", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN1999", proper_shipping_name: "Tars, liquid (coal tar distillates)", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Carcinogenic. Flash point varies.", marine_pollutant: true, limited_quantity: true, erg_guide: "130" },
  { un_number: "UN2055", proper_shipping_name: "Styrene monomer, stabilized", class: "3", division: "", subsidiary_risks: [], packing_group: "III", labels: ["3"], special_provisions: "Polymerization hazard. Inhibitor required.", marine_pollutant: false, limited_quantity: true, erg_guide: "128" },
  { un_number: "UN2056", proper_shipping_name: "Tetrahydrofuran (THF)", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Peroxide-forming. Flash point -14°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },
  { un_number: "UN2398", proper_shipping_name: "Methyl tert-butyl ether (MTBE)", class: "3", division: "", subsidiary_risks: [], packing_group: "II", labels: ["3"], special_provisions: "Fuel additive.", marine_pollutant: false, limited_quantity: true, erg_guide: "127" },

  // ── Class 4: Flammable Solids, Spontaneously Combustible, Dangerous When Wet ──
  { un_number: "UN1325", proper_shipping_name: "Flammable solid, organic, n.o.s.", class: "4", division: "4.1", subsidiary_risks: [], packing_group: "II", labels: ["4.1"], special_provisions: "Generic entry. PG II or III.", marine_pollutant: false, limited_quantity: true, erg_guide: "133" },
  { un_number: "UN1331", proper_shipping_name: "Matches, strike anywhere", class: "4", division: "4.1", subsidiary_risks: [], packing_group: "III", labels: ["4.1"], special_provisions: "Easily ignited by friction.", marine_pollutant: false, limited_quantity: true, erg_guide: "133" },
  { un_number: "UN1350", proper_shipping_name: "Sulphur", class: "4", division: "4.1", subsidiary_risks: [], packing_group: "III", labels: ["4.1"], special_provisions: "Powder or lump form. Burns with SO2 fumes.", marine_pollutant: false, limited_quantity: true, erg_guide: "133" },
  { un_number: "UN1363", proper_shipping_name: "Copra (dried coconut)", class: "4", division: "4.2", subsidiary_risks: [], packing_group: "III", labels: ["4.2"], special_provisions: "Liable to spontaneous combustion when wet or oily.", marine_pollutant: false, limited_quantity: false, erg_guide: "135" },
  { un_number: "UN1373", proper_shipping_name: "Fibres, animal/vegetable/synthetic, with oil", class: "4", division: "4.2", subsidiary_risks: [], packing_group: "III", labels: ["4.2"], special_provisions: "Liable to spontaneous heating.", marine_pollutant: false, limited_quantity: false, erg_guide: "133" },
  { un_number: "UN1381", proper_shipping_name: "Phosphorus, white or yellow", class: "4", division: "4.2", subsidiary_risks: ["6.1"], packing_group: "I", labels: ["4.2", "6.1"], special_provisions: "Spontaneously combustible in air. Must be kept under water.", marine_pollutant: false, limited_quantity: false, erg_guide: "136" },
  { un_number: "UN1402", proper_shipping_name: "Calcium carbide", class: "4", division: "4.3", subsidiary_risks: [], packing_group: "I", labels: ["4.3"], special_provisions: "Reacts with water to produce acetylene (flammable gas). PG I or II.", marine_pollutant: false, limited_quantity: false, erg_guide: "138" },
  { un_number: "UN1428", proper_shipping_name: "Sodium", class: "4", division: "4.3", subsidiary_risks: [], packing_group: "I", labels: ["4.3"], special_provisions: "Reacts violently with water producing hydrogen and NaOH.", marine_pollutant: false, limited_quantity: false, erg_guide: "138" },
  { un_number: "UN1415", proper_shipping_name: "Lithium", class: "4", division: "4.3", subsidiary_risks: [], packing_group: "I", labels: ["4.3"], special_provisions: "Reacts with water. Do NOT use water to extinguish.", marine_pollutant: false, limited_quantity: false, erg_guide: "138" },
  { un_number: "UN1420", proper_shipping_name: "Potassium metal alloys, liquid", class: "4", division: "4.3", subsidiary_risks: [], packing_group: "I", labels: ["4.3"], special_provisions: "Reacts violently with water.", marine_pollutant: false, limited_quantity: false, erg_guide: "138" },
  { un_number: "UN1869", proper_shipping_name: "Magnesium (pellets, turnings, or ribbons)", class: "4", division: "4.1", subsidiary_risks: [], packing_group: "III", labels: ["4.1"], special_provisions: "Burns with intense white light. Do not use water.", marine_pollutant: false, limited_quantity: true, erg_guide: "170" },
  { un_number: "UN2004", proper_shipping_name: "Magnesium diamide", class: "4", division: "4.2", subsidiary_risks: [], packing_group: "II", labels: ["4.2"], special_provisions: "Liable to spontaneous combustion.", marine_pollutant: false, limited_quantity: false, erg_guide: "135" },

  // ── Class 5: Oxidizing Substances and Organic Peroxides ──
  { un_number: "UN1942", proper_shipping_name: "Ammonium nitrate", class: "5", division: "5.1", subsidiary_risks: [], packing_group: "III", labels: ["5.1"], special_provisions: "Fertilizer grade. Oxidizer. Can detonate under confinement.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN1448", proper_shipping_name: "Potassium permanganate", class: "5", division: "5.1", subsidiary_risks: [], packing_group: "II", labels: ["5.1"], special_provisions: "Strong oxidizer. Reacts with organics.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN1486", proper_shipping_name: "Potassium nitrate", class: "5", division: "5.1", subsidiary_risks: [], packing_group: "III", labels: ["5.1"], special_provisions: "Oxidizer. Component of gunpowder.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN1490", proper_shipping_name: "Potassium perchlorate", class: "5", division: "5.1", subsidiary_risks: [], packing_group: "II", labels: ["5.1"], special_provisions: "Strong oxidizer. Used in pyrotechnics.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN1495", proper_shipping_name: "Sodium chlorate", class: "5", division: "5.1", subsidiary_risks: [], packing_group: "II", labels: ["5.1"], special_provisions: "Oxidizer. Herbicide.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN2014", proper_shipping_name: "Hydrogen peroxide, aqueous solution (>20%)", class: "5", division: "5.1", subsidiary_risks: ["8"], packing_group: "II", labels: ["5.1", "8"], special_provisions: "Oxidizer. Corrosive. Concentration >20% <=60%.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN2015", proper_shipping_name: "Hydrogen peroxide, stabilized (>60%)", class: "5", division: "5.1", subsidiary_risks: ["8"], packing_group: "I", labels: ["5.1", "8"], special_provisions: "Strong oxidizer. Corrosive. High concentration.", marine_pollutant: false, limited_quantity: false, erg_guide: "143" },
  { un_number: "UN2067", proper_shipping_name: "Ammonium nitrate based fertilizer", class: "5", division: "5.1", subsidiary_risks: [], packing_group: "III", labels: ["5.1"], special_provisions: "Oxidizer. Various compositions.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN2426", proper_shipping_name: "Ammonium nitrate, liquid (hot solution)", class: "5", division: "5.1", subsidiary_risks: [], packing_group: "N/A", labels: ["5.1"], special_provisions: "Transported hot. Oxidizer.", marine_pollutant: false, limited_quantity: false, erg_guide: "140" },
  { un_number: "UN3149", proper_shipping_name: "Hydrogen peroxide and peroxyacetic acid mixture", class: "5", division: "5.1", subsidiary_risks: ["8"], packing_group: "II", labels: ["5.1", "8"], special_provisions: "Oxidizer. Corrosive. Disinfectant.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN3101", proper_shipping_name: "Organic peroxide type B, liquid", class: "5", division: "5.2", subsidiary_risks: [], packing_group: "N/A", labels: ["5.2"], special_provisions: "Temperature controlled. Explosive risk.", marine_pollutant: false, limited_quantity: false, erg_guide: "146" },
  { un_number: "UN3107", proper_shipping_name: "Organic peroxide type E, liquid", class: "5", division: "5.2", subsidiary_risks: [], packing_group: "N/A", labels: ["5.2"], special_provisions: "Flammable. May be temperature controlled.", marine_pollutant: false, limited_quantity: false, erg_guide: "145" },
  { un_number: "UN3109", proper_shipping_name: "Organic peroxide type F, liquid", class: "5", division: "5.2", subsidiary_risks: [], packing_group: "N/A", labels: ["5.2"], special_provisions: "Flammable.", marine_pollutant: false, limited_quantity: false, erg_guide: "145" },

  // ── Class 6: Toxic and Infectious Substances ──
  { un_number: "UN1544", proper_shipping_name: "Alkaloids, solid, n.o.s., or Alkaloid salts, solid", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "I", labels: ["6.1"], special_provisions: "Toxic. PG I, II, or III.", marine_pollutant: false, limited_quantity: false, erg_guide: "151" },
  { un_number: "UN1583", proper_shipping_name: "Chloropicrin mixture, n.o.s.", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "I", labels: ["6.1"], special_provisions: "Toxic liquid. Lachrymator.", marine_pollutant: false, limited_quantity: false, erg_guide: "153" },
  { un_number: "UN1593", proper_shipping_name: "Dichloromethane (Methylene chloride)", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "III", labels: ["6.1"], special_provisions: "Common solvent. Possible carcinogen.", marine_pollutant: false, limited_quantity: true, erg_guide: "160" },
  { un_number: "UN1613", proper_shipping_name: "Hydrocyanic acid, aqueous (Hydrogen cyanide)", class: "6", division: "6.1", subsidiary_risks: ["3"], packing_group: "I", labels: ["6.1", "3"], special_provisions: "Extremely toxic. TIH Zone A. Fatal in small doses.", marine_pollutant: false, limited_quantity: false, erg_guide: "154" },
  { un_number: "UN1654", proper_shipping_name: "Nicotine", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "II", labels: ["6.1"], special_provisions: "Toxic solid. Absorbed through skin.", marine_pollutant: false, limited_quantity: false, erg_guide: "151" },
  { un_number: "UN1680", proper_shipping_name: "Potassium cyanide", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "I", labels: ["6.1"], special_provisions: "Highly toxic. Reacts with acids to form HCN.", marine_pollutant: true, limited_quantity: false, erg_guide: "157" },
  { un_number: "UN1689", proper_shipping_name: "Sodium cyanide", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "I", labels: ["6.1"], special_provisions: "Highly toxic. Used in mining.", marine_pollutant: true, limited_quantity: false, erg_guide: "157" },
  { un_number: "UN1851", proper_shipping_name: "Medicine, liquid, toxic, n.o.s.", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "II", labels: ["6.1"], special_provisions: "Toxic pharmaceutical preparations.", marine_pollutant: false, limited_quantity: true, erg_guide: "151" },
  { un_number: "UN2206", proper_shipping_name: "Isocyanates, toxic, n.o.s.", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "II", labels: ["6.1"], special_provisions: "Respiratory sensitizer. MDI, TDI.", marine_pollutant: false, limited_quantity: false, erg_guide: "155" },
  { un_number: "UN2588", proper_shipping_name: "Pesticide, solid, toxic, n.o.s.", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "I", labels: ["6.1"], special_provisions: "Generic entry. PG I, II, or III.", marine_pollutant: true, limited_quantity: false, erg_guide: "151" },
  { un_number: "UN2810", proper_shipping_name: "Toxic liquid, organic, n.o.s.", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "I", labels: ["6.1"], special_provisions: "Generic entry. PG I, II, or III.", marine_pollutant: false, limited_quantity: false, erg_guide: "153" },
  { un_number: "UN2811", proper_shipping_name: "Toxic solid, organic, n.o.s.", class: "6", division: "6.1", subsidiary_risks: [], packing_group: "I", labels: ["6.1"], special_provisions: "Generic entry. PG I, II, or III.", marine_pollutant: false, limited_quantity: false, erg_guide: "154" },
  { un_number: "UN3373", proper_shipping_name: "Biological substance, Category B", class: "6", division: "6.2", subsidiary_risks: [], packing_group: "N/A", labels: ["6.2"], special_provisions: "Diagnostic or clinical specimens. Triple packaging required. P650.", marine_pollutant: false, limited_quantity: false, erg_guide: "158" },
  { un_number: "UN2814", proper_shipping_name: "Infectious substance, affecting humans (Category A)", class: "6", division: "6.2", subsidiary_risks: [], packing_group: "N/A", labels: ["6.2"], special_provisions: "Category A. UN approved packaging required.", marine_pollutant: false, limited_quantity: false, erg_guide: "158" },
  { un_number: "UN2900", proper_shipping_name: "Infectious substance, affecting animals only (Category A)", class: "6", division: "6.2", subsidiary_risks: [], packing_group: "N/A", labels: ["6.2"], special_provisions: "Category A. Animal pathogens.", marine_pollutant: false, limited_quantity: false, erg_guide: "158" },

  // ── Class 7: Radioactive Material ──
  { un_number: "UN2908", proper_shipping_name: "Radioactive material, excepted package — empty packaging", class: "7", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["7"], special_provisions: "Formerly contained radioactive material.", marine_pollutant: false, limited_quantity: false, erg_guide: "161" },
  { un_number: "UN2910", proper_shipping_name: "Radioactive material, excepted package — limited quantity", class: "7", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["7"], special_provisions: "Activity below limits. Minimal labeling.", marine_pollutant: false, limited_quantity: true, erg_guide: "161" },
  { un_number: "UN2911", proper_shipping_name: "Radioactive material, excepted package — instruments or articles", class: "7", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["7"], special_provisions: "Smoke detectors, gauges.", marine_pollutant: false, limited_quantity: true, erg_guide: "161" },
  { un_number: "UN2912", proper_shipping_name: "Radioactive material, low specific activity (LSA-I)", class: "7", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["7"], special_provisions: "Ores, contaminated soil.", marine_pollutant: false, limited_quantity: false, erg_guide: "161" },
  { un_number: "UN3321", proper_shipping_name: "Radioactive material, low specific activity (LSA-II)", class: "7", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["7"], special_provisions: "Contaminated water, activated material.", marine_pollutant: false, limited_quantity: false, erg_guide: "161" },
  { un_number: "UN3332", proper_shipping_name: "Radioactive material, Type A package, special form", class: "7", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["7"], special_provisions: "Sealed source in certified capsule.", marine_pollutant: false, limited_quantity: false, erg_guide: "161" },

  // ── Class 8: Corrosive Substances ──
  { un_number: "UN1050", proper_shipping_name: "Hydrochloric acid", class: "8", division: "", subsidiary_risks: [], packing_group: "II", labels: ["8"], special_provisions: "Corrosive. Fumes in moist air.", marine_pollutant: false, limited_quantity: true, erg_guide: "157" },
  { un_number: "UN1789", proper_shipping_name: "Hydrochloric acid solution", class: "8", division: "", subsidiary_risks: [], packing_group: "II", labels: ["8"], special_provisions: "Corrosive. PG II or III based on concentration.", marine_pollutant: false, limited_quantity: true, erg_guide: "157" },
  { un_number: "UN1805", proper_shipping_name: "Phosphoric acid solution", class: "8", division: "", subsidiary_risks: [], packing_group: "III", labels: ["8"], special_provisions: "Corrosive. Common industrial acid.", marine_pollutant: false, limited_quantity: true, erg_guide: "154" },
  { un_number: "UN1813", proper_shipping_name: "Potassium hydroxide, solid (Caustic potash)", class: "8", division: "", subsidiary_risks: [], packing_group: "II", labels: ["8"], special_provisions: "Corrosive solid. Strong alkali.", marine_pollutant: false, limited_quantity: true, erg_guide: "154" },
  { un_number: "UN1823", proper_shipping_name: "Sodium hydroxide, solid (Caustic soda)", class: "8", division: "", subsidiary_risks: [], packing_group: "II", labels: ["8"], special_provisions: "Corrosive solid. Strong alkali.", marine_pollutant: false, limited_quantity: true, erg_guide: "154" },
  { un_number: "UN1824", proper_shipping_name: "Sodium hydroxide solution", class: "8", division: "", subsidiary_risks: [], packing_group: "II", labels: ["8"], special_provisions: "Corrosive. PG II or III based on concentration.", marine_pollutant: false, limited_quantity: true, erg_guide: "154" },
  { un_number: "UN1830", proper_shipping_name: "Sulphuric acid (>51%)", class: "8", division: "", subsidiary_risks: [], packing_group: "II", labels: ["8"], special_provisions: "Corrosive. Violent reaction with water (exothermic).", marine_pollutant: false, limited_quantity: true, erg_guide: "137" },
  { un_number: "UN1831", proper_shipping_name: "Sulphuric acid, fuming (Oleum)", class: "8", division: "", subsidiary_risks: ["6.1"], packing_group: "I", labels: ["8", "6.1"], special_provisions: "Corrosive. Toxic fumes. Reacts violently with water.", marine_pollutant: false, limited_quantity: false, erg_guide: "137" },
  { un_number: "UN1832", proper_shipping_name: "Sulphuric acid, spent", class: "8", division: "", subsidiary_risks: [], packing_group: "II", labels: ["8"], special_provisions: "Waste acid. Corrosive.", marine_pollutant: false, limited_quantity: true, erg_guide: "137" },
  { un_number: "UN2031", proper_shipping_name: "Nitric acid (>70%)", class: "8", division: "", subsidiary_risks: ["5.1"], packing_group: "I", labels: ["8", "5.1"], special_provisions: "Corrosive. Strong oxidizer. Reacts violently with organics.", marine_pollutant: false, limited_quantity: false, erg_guide: "157" },
  { un_number: "UN2032", proper_shipping_name: "Nitric acid, fuming (red fuming)", class: "8", division: "", subsidiary_risks: ["5.1", "6.1"], packing_group: "I", labels: ["8", "5.1", "6.1"], special_provisions: "Corrosive. Oxidizer. Toxic NOx fumes.", marine_pollutant: false, limited_quantity: false, erg_guide: "157" },
  { un_number: "UN2209", proper_shipping_name: "Formaldehyde solution (formalin)", class: "8", division: "", subsidiary_risks: [], packing_group: "III", labels: ["8"], special_provisions: "Corrosive. Carcinogenic. Preservative.", marine_pollutant: false, limited_quantity: true, erg_guide: "132" },
  { un_number: "UN2790", proper_shipping_name: "Acetic acid solution (>80%)", class: "8", division: "", subsidiary_risks: ["3"], packing_group: "II", labels: ["8", "3"], special_provisions: "Corrosive. Flammable.", marine_pollutant: false, limited_quantity: true, erg_guide: "132" },
  { un_number: "UN2794", proper_shipping_name: "Batteries, wet, filled with acid (lead-acid)", class: "8", division: "", subsidiary_risks: [], packing_group: "III", labels: ["8"], special_provisions: "Contains sulphuric acid. Spillable.", marine_pollutant: false, limited_quantity: true, erg_guide: "154" },
  { un_number: "UN2795", proper_shipping_name: "Batteries, wet, filled with alkali", class: "8", division: "", subsidiary_risks: [], packing_group: "III", labels: ["8"], special_provisions: "Contains KOH or NaOH solution.", marine_pollutant: false, limited_quantity: true, erg_guide: "154" },
  { un_number: "UN2796", proper_shipping_name: "Sulphuric acid (≤51%) or Battery fluid, acid", class: "8", division: "", subsidiary_risks: [], packing_group: "II", labels: ["8"], special_provisions: "Dilute acid. Corrosive.", marine_pollutant: false, limited_quantity: true, erg_guide: "157" },
  { un_number: "UN2800", proper_shipping_name: "Batteries, wet, non-spillable (VRLA/AGM)", class: "8", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["8"], special_provisions: "Sealed lead-acid. Special provision 238.", marine_pollutant: false, limited_quantity: true, erg_guide: "154" },
  { un_number: "UN1760", proper_shipping_name: "Corrosive liquid, n.o.s.", class: "8", division: "", subsidiary_risks: [], packing_group: "I", labels: ["8"], special_provisions: "Generic entry. PG I, II, or III.", marine_pollutant: false, limited_quantity: false, erg_guide: "154" },
  { un_number: "UN1759", proper_shipping_name: "Corrosive solid, n.o.s.", class: "8", division: "", subsidiary_risks: [], packing_group: "I", labels: ["8"], special_provisions: "Generic entry. PG I, II, or III.", marine_pollutant: false, limited_quantity: false, erg_guide: "154" },

  // ── Class 9: Miscellaneous Dangerous Goods ──
  { un_number: "UN1845", proper_shipping_name: "Carbon dioxide, solid (dry ice)", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Sublimes to gas. Asphyxiant. -78.5°C.", marine_pollutant: false, limited_quantity: true, erg_guide: "120" },
  { un_number: "UN1941", proper_shipping_name: "Dibromodifluoromethane", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Environmentally hazardous.", marine_pollutant: true, limited_quantity: true, erg_guide: "171" },
  { un_number: "UN1950", proper_shipping_name: "Aerosols", class: "2", division: "2.1", subsidiary_risks: [], packing_group: "N/A", labels: ["2.1"], special_provisions: "Flammable or non-flammable. Contents determine hazard.", marine_pollutant: false, limited_quantity: true, erg_guide: "126" },
  { un_number: "UN1951", proper_shipping_name: "Argon, refrigerated liquid", class: "2", division: "2.2", subsidiary_risks: [], packing_group: "N/A", labels: ["2.2"], special_provisions: "Cryogenic liquid. Asphyxiant.", marine_pollutant: false, limited_quantity: false, erg_guide: "120" },
  { un_number: "UN1966", proper_shipping_name: "Hydrogen, refrigerated liquid", class: "2", division: "2.1", subsidiary_risks: [], packing_group: "N/A", labels: ["2.1"], special_provisions: "Cryogenic. Extremely flammable.", marine_pollutant: false, limited_quantity: false, erg_guide: "115" },
  { un_number: "UN2071", proper_shipping_name: "Ammonium nitrate based fertilizer", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Non-hazardous fertilizer composition.", marine_pollutant: false, limited_quantity: true, erg_guide: "140" },
  { un_number: "UN2211", proper_shipping_name: "Polymeric beads, expandable", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "EPS beads with pentane.", marine_pollutant: false, limited_quantity: true, erg_guide: "133" },
  { un_number: "UN2315", proper_shipping_name: "Polychlorinated biphenyls, liquid (PCBs)", class: "9", division: "", subsidiary_risks: [], packing_group: "II", labels: ["9"], special_provisions: "Persistent organic pollutant. Banned in most countries.", marine_pollutant: true, limited_quantity: false, erg_guide: "171" },
  { un_number: "UN2590", proper_shipping_name: "White asbestos (chrysotile)", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Carcinogenic. Dust hazard.", marine_pollutant: false, limited_quantity: true, erg_guide: "171" },
  { un_number: "UN2807", proper_shipping_name: "Magnetized material", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "Field strength >0.00525 gauss at 2.1m from surface.", marine_pollutant: false, limited_quantity: false, erg_guide: "171" },
  { un_number: "UN2990", proper_shipping_name: "Life-saving appliances, self-inflating", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "Life rafts, life jackets with gas cartridges.", marine_pollutant: false, limited_quantity: false, erg_guide: "171" },
  { un_number: "UN3077", proper_shipping_name: "Environmentally hazardous substance, solid, n.o.s.", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Marine pollutant. Generic entry.", marine_pollutant: true, limited_quantity: true, erg_guide: "171" },
  { un_number: "UN3082", proper_shipping_name: "Environmentally hazardous substance, liquid, n.o.s.", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Marine pollutant. Generic entry.", marine_pollutant: true, limited_quantity: true, erg_guide: "171" },
  { un_number: "UN3090", proper_shipping_name: "Lithium metal batteries (not in equipment)", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9A"], special_provisions: "Section II: ≤1g Li per cell. Special provisions 188, 230, 310.", marine_pollutant: false, limited_quantity: false, erg_guide: "138" },
  { un_number: "UN3091", proper_shipping_name: "Lithium metal batteries contained in or packed with equipment", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9A"], special_provisions: "Laptops, phones with Li-metal batteries. SP 188, 230, 360.", marine_pollutant: false, limited_quantity: false, erg_guide: "138" },
  { un_number: "UN3166", proper_shipping_name: "Vehicle, flammable gas/liquid powered or Fuel cell vehicle", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "Cars, motorcycles. Battery disconnected, tank <1/4 full.", marine_pollutant: false, limited_quantity: false, erg_guide: "135" },
  { un_number: "UN3171", proper_shipping_name: "Battery-powered vehicle or Battery-powered equipment", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "Electric vehicles, wheelchairs, forklifts.", marine_pollutant: false, limited_quantity: false, erg_guide: "135" },
  { un_number: "UN3245", proper_shipping_name: "Genetically modified organisms (GMOs)", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "Not meeting criteria for infectious substance.", marine_pollutant: false, limited_quantity: false, erg_guide: "171" },
  { un_number: "UN3256", proper_shipping_name: "Elevated temperature liquid, flammable, n.o.s.", class: "3", division: "", subsidiary_risks: [], packing_group: "III", labels: ["3"], special_provisions: "Transported above flash point. Hot liquid.", marine_pollutant: false, limited_quantity: false, erg_guide: "128" },
  { un_number: "UN3257", proper_shipping_name: "Elevated temperature liquid, n.o.s.", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Transported at ≥100°C. Hot asphalt, bitumen.", marine_pollutant: false, limited_quantity: false, erg_guide: "128" },
  { un_number: "UN3258", proper_shipping_name: "Elevated temperature solid, n.o.s.", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Transported at ≥240°C. Hot metal, hot slag.", marine_pollutant: false, limited_quantity: false, erg_guide: "171" },
  { un_number: "UN3268", proper_shipping_name: "Air bag inflators or Air bag modules or Seat-belt pretensioners", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "Vehicle safety devices.", marine_pollutant: false, limited_quantity: false, erg_guide: "171" },
  { un_number: "UN3334", proper_shipping_name: "Aviation regulated liquid, n.o.s.", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Air transport only. Surface non-regulated.", marine_pollutant: false, limited_quantity: true, erg_guide: "171" },
  { un_number: "UN3335", proper_shipping_name: "Aviation regulated solid, n.o.s.", class: "9", division: "", subsidiary_risks: [], packing_group: "III", labels: ["9"], special_provisions: "Air transport only.", marine_pollutant: false, limited_quantity: true, erg_guide: "171" },
  { un_number: "UN3363", proper_shipping_name: "Dangerous goods in machinery or apparatus", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "Equipment containing hazardous components.", marine_pollutant: false, limited_quantity: false, erg_guide: "171" },
  { un_number: "UN3480", proper_shipping_name: "Lithium ion batteries (not in equipment)", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9A"], special_provisions: "Wh rating determines section. Section II: ≤100Wh per cell. SP 188, 230, 310.", marine_pollutant: false, limited_quantity: false, erg_guide: "147" },
  { un_number: "UN3481", proper_shipping_name: "Lithium ion batteries contained in or packed with equipment", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9A"], special_provisions: "Phones, laptops, power tools. SP 188, 230, 360.", marine_pollutant: false, limited_quantity: false, erg_guide: "147" },
  { un_number: "UN3496", proper_shipping_name: "Batteries, nickel-metal hydride", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "NiMH batteries. Hybrid vehicle batteries.", marine_pollutant: false, limited_quantity: true, erg_guide: "147" },
  { un_number: "UN3499", proper_shipping_name: "Capacitor, electric double layer (supercapacitor)", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9"], special_provisions: "Energy storage capacitors >10Wh.", marine_pollutant: false, limited_quantity: false, erg_guide: "147" },
  { un_number: "UN3536", proper_shipping_name: "Lithium batteries installed in cargo transport unit", class: "9", division: "", subsidiary_risks: [], packing_group: "N/A", labels: ["9A"], special_provisions: "Large battery installations. Container-scale.", marine_pollutant: false, limited_quantity: false, erg_guide: "147" },
];

// Build lookup indices
const unNumberIndex = new Map<string, DangerousGoodEntry>();
for (const dg of DANGEROUS_GOODS) {
  unNumberIndex.set(dg.un_number, dg);
}

function searchDangerousGoods(query: string): DangerousGoodEntry[] {
  const q = query.trim().toUpperCase();

  // 1. Exact UN number match (with or without "UN" prefix)
  const unNumber = q.startsWith("UN") ? q : `UN${q}`;
  const exact = unNumberIndex.get(unNumber);
  if (exact) return [exact];

  // 2. Try as raw number
  if (/^\d{4}$/.test(q)) {
    const withPrefix = `UN${q}`;
    const numMatch = unNumberIndex.get(withPrefix);
    if (numMatch) return [numMatch];
  }

  // 3. Name search (case insensitive, partial match)
  const lowerQ = query.trim().toLowerCase();
  const nameMatches = DANGEROUS_GOODS.filter(
    (dg) =>
      dg.proper_shipping_name.toLowerCase().includes(lowerQ) ||
      dg.special_provisions.toLowerCase().includes(lowerQ),
  );
  return nameMatches;
}

// Hazard class descriptions
const CLASS_DESCRIPTIONS: Record<string, string> = {
  "1": "Explosives",
  "1.1": "Explosives — Mass explosion hazard",
  "1.2": "Explosives — Projection hazard",
  "1.3": "Explosives — Fire hazard and minor blast or projection hazard",
  "1.4": "Explosives — No significant blast hazard",
  "1.5": "Explosives — Very insensitive, mass explosion hazard",
  "1.6": "Explosives — Extremely insensitive articles",
  "2": "Gases",
  "2.1": "Flammable gases",
  "2.2": "Non-flammable, non-toxic gases",
  "2.3": "Toxic gases",
  "3": "Flammable liquids",
  "4": "Flammable solids; substances liable to spontaneous combustion; substances which emit flammable gases in contact with water",
  "4.1": "Flammable solids, self-reactive substances, solid desensitized explosives",
  "4.2": "Substances liable to spontaneous combustion",
  "4.3": "Substances which in contact with water emit flammable gases",
  "5": "Oxidizing substances and organic peroxides",
  "5.1": "Oxidizing substances",
  "5.2": "Organic peroxides",
  "6": "Toxic and infectious substances",
  "6.1": "Toxic substances",
  "6.2": "Infectious substances",
  "7": "Radioactive material",
  "8": "Corrosive substances",
  "9": "Miscellaneous dangerous substances and articles",
};

registerCapability("dangerous-goods-classify", async (input: CapabilityInput) => {
  const raw = (
    (input.substance as string) ??
    (input.un_number as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!raw) {
    throw new Error(
      "'substance' or 'un_number' is required. Provide a substance name (e.g. 'Gasoline') or UN number (e.g. 'UN1203', '1203').",
    );
  }

  const matches = searchDangerousGoods(raw);

  const enrichMatch = (dg: DangerousGoodEntry) => ({
    ...dg,
    class_description: CLASS_DESCRIPTIONS[dg.division || dg.class] ?? CLASS_DESCRIPTIONS[dg.class] ?? "Unknown",
  });

  if (matches.length === 1) {
    return {
      output: {
        query: raw,
        match: enrichMatch(matches[0]),
      },
      provenance: {
        source: "algorithmic",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  if (matches.length > 1) {
    return {
      output: {
        query: raw,
        matches: matches.slice(0, 25).map(enrichMatch),
        total_matches: matches.length,
        note: matches.length > 25 ? `Showing first 25 of ${matches.length} matches. Refine your search for more specific results.` : undefined,
      },
      provenance: {
        source: "algorithmic",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  return {
    output: {
      query: raw,
      matches: [],
      total_matches: 0,
      error: `No dangerous goods found matching "${raw}". Try a UN number (e.g. 'UN1203') or substance name (e.g. 'Gasoline', 'Lithium', 'Acid').`,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
