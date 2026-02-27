import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Incoterms 2020 — comprehensive algorithmic lookup ─────────────────────

interface IncotermData {
  code: string;
  full_name: string;
  description: string;
  seller_obligations: string[];
  buyer_obligations: string[];
  risk_transfer_point: string;
  cost_transfer_point: string;
  suitable_for: "any" | "sea_and_inland_waterway_only";
  insurance_required: boolean;
  common_use_cases: string[];
}

const INCOTERMS: Record<string, IncotermData> = {
  EXW: {
    code: "EXW",
    full_name: "Ex Works",
    description:
      "Seller makes goods available at their premises or another named place (works, factory, warehouse). " +
      "This is the minimum obligation for the seller. The buyer bears all costs and risks from the seller's premises to the final destination.",
    seller_obligations: [
      "Make goods available at the named place (seller's premises or other agreed location)",
      "Package and mark the goods as required for transport",
      "Provide commercial invoice and assist buyer with export formalities if requested",
      "Notify the buyer that goods are ready for collection",
      "Bear all costs until goods are placed at the buyer's disposal",
      "Provide any information the buyer needs for insurance or transport arrangements",
    ],
    buyer_obligations: [
      "Take delivery of goods at the named place",
      "Bear all costs from the point of delivery, including loading onto the collecting vehicle",
      "Arrange and pay for export clearance, transit, and import formalities",
      "Arrange and pay for all transport from the named place to the destination",
      "Bear all risks of loss or damage from the point of delivery",
      "Arrange and pay for any inspection required by export/import authorities",
      "Pay any duties, taxes, and charges related to export and import",
    ],
    risk_transfer_point: "When goods are placed at buyer's disposal at the named place (seller's premises)",
    cost_transfer_point: "At the named place (seller's premises); buyer bears all subsequent costs",
    suitable_for: "any",
    insurance_required: false,
    common_use_cases: [
      "Domestic transactions where buyer has strong logistics capabilities",
      "When buyer wants maximum control over the supply chain",
      "Collection from factory/warehouse by buyer's own transport",
      "Often used when buyer has preferential freight rates",
    ],
  },
  FCA: {
    code: "FCA",
    full_name: "Free Carrier",
    description:
      "Seller delivers the goods to the carrier or another person nominated by the buyer at the seller's premises " +
      "or another named place. Risk transfers to the buyer when goods are delivered to the carrier. " +
      "The seller clears goods for export. FCA is the most versatile and commonly recommended Incoterm.",
    seller_obligations: [
      "Deliver goods to the carrier at the named place",
      "Clear goods for export and pay export duties/taxes",
      "Bear all costs and risks until goods are delivered to the carrier",
      "Load goods onto the collecting vehicle if delivery is at seller's premises",
      "Provide transport document or assist buyer in obtaining one",
      "Provide commercial invoice and export documentation",
      "Notify buyer that goods have been delivered to the carrier",
    ],
    buyer_obligations: [
      "Nominate the carrier and notify the seller",
      "Arrange and pay for carriage from the named place to the destination",
      "Bear all risks of loss or damage from the point of delivery to the carrier",
      "Handle import clearance, duties, and taxes",
      "Receive delivery of goods at the named place",
      "Pay for any pre-shipment inspection required by import country",
      "Provide the seller with proof of delivery if requested",
    ],
    risk_transfer_point: "When goods are delivered to the carrier at the named place",
    cost_transfer_point: "At the named place of delivery to the carrier",
    suitable_for: "any",
    insurance_required: false,
    common_use_cases: [
      "Container shipments (preferred over FOB for containers)",
      "Air freight, road, rail, and multimodal transport",
      "When seller can efficiently handle export clearance",
      "Recommended replacement for FOB when goods are containerized",
      "Supply chain arrangements with third-party logistics providers",
    ],
  },
  CPT: {
    code: "CPT",
    full_name: "Carriage Paid To",
    description:
      "Seller pays for carriage to the named destination but risk transfers to the buyer when goods are " +
      "handed over to the first carrier. There are two critical points: risk transfer (first carrier) and " +
      "cost transfer (named destination). The seller clears goods for export.",
    seller_obligations: [
      "Deliver goods to the first carrier at the place of shipment",
      "Contract and pay for carriage to the named destination",
      "Clear goods for export and pay export duties",
      "Provide transport document covering carriage to the agreed destination",
      "Bear all costs until goods reach the named destination",
      "Provide commercial invoice and any required documentation",
      "Notify the buyer that goods have been delivered to the carrier",
    ],
    buyer_obligations: [
      "Accept delivery of goods at the named destination",
      "Bear all risks of loss or damage from the point of delivery to the first carrier",
      "Handle import clearance, duties, taxes, and formalities",
      "Pay any additional costs after arrival at the named destination (unloading, onward transport)",
      "Arrange and pay for insurance if desired (not obligatory)",
      "Receive the goods from the carrier at the named destination",
      "Pay for any pre-shipment inspection required by import country",
    ],
    risk_transfer_point: "When goods are handed over to the first carrier at the place of shipment",
    cost_transfer_point: "Named place of destination",
    suitable_for: "any",
    insurance_required: false,
    common_use_cases: [
      "International shipments where seller arranges freight but buyer assumes risk early",
      "Road and rail transport within continents",
      "Air freight shipments",
      "When seller has better freight rates than buyer",
    ],
  },
  CIP: {
    code: "CIP",
    full_name: "Carriage and Insurance Paid To",
    description:
      "Same as CPT, but the seller must also arrange and pay for insurance covering the buyer's risk during carriage. " +
      "Under Incoterms 2020, CIP requires Institute Cargo Clauses (A) — the highest level of coverage (all-risks). " +
      "Risk transfers when goods are handed to the first carrier.",
    seller_obligations: [
      "Deliver goods to the first carrier at the place of shipment",
      "Contract and pay for carriage to the named destination",
      "Obtain insurance at minimum Institute Cargo Clauses (A) — all-risks coverage",
      "Clear goods for export and pay export duties",
      "Provide transport document and insurance certificate to the buyer",
      "Bear all costs (carriage + insurance) until goods reach the named destination",
      "Notify the buyer that goods have been delivered to the carrier",
    ],
    buyer_obligations: [
      "Accept delivery of goods at the named destination",
      "Bear all risks of loss or damage from delivery to first carrier (covered by seller's insurance)",
      "Handle import clearance, duties, taxes, and formalities",
      "Pay any costs after arrival at the named destination",
      "File insurance claims if loss/damage occurs during transit",
      "Receive the goods from the carrier at the named destination",
      "Pay for any additional insurance coverage beyond ICC(A) if desired",
    ],
    risk_transfer_point: "When goods are handed over to the first carrier at the place of shipment",
    cost_transfer_point: "Named place of destination (including insurance)",
    suitable_for: "any",
    insurance_required: true,
    common_use_cases: [
      "High-value shipments requiring insurance coverage",
      "When buyer lacks ability to arrange insurance in the seller's country",
      "Letters of credit transactions requiring insurance documentation",
      "Multimodal transport of valuable goods",
      "Trade with developing countries where buyer has limited insurance access",
    ],
  },
  DAP: {
    code: "DAP",
    full_name: "Delivered at Place",
    description:
      "Seller delivers when goods are placed at the buyer's disposal on the arriving means of transport, " +
      "ready for unloading, at the named destination. The seller bears all risks and costs to the destination " +
      "but is NOT responsible for unloading or import clearance.",
    seller_obligations: [
      "Deliver goods on the arriving transport at the named destination, ready for unloading",
      "Arrange and pay for carriage to the named destination",
      "Clear goods for export and any transit formalities",
      "Bear all risks of loss or damage until goods arrive at the named destination",
      "Provide transport document enabling the buyer to take delivery",
      "Provide commercial invoice and documentation required for import (assist buyer)",
      "Notify the buyer of estimated arrival and delivery details",
    ],
    buyer_obligations: [
      "Take delivery of goods from the arriving transport at the named destination",
      "Unload the goods at own cost and risk",
      "Handle import clearance, duties, taxes, and formalities",
      "Bear all risks and costs after delivery at the named destination",
      "Pay for any pre-shipment inspection required by import country",
      "Provide the seller with any information needed for transport arrangements",
      "Arrange and pay for insurance if desired (not obligatory)",
    ],
    risk_transfer_point: "When goods are placed at buyer's disposal on arriving transport at named destination",
    cost_transfer_point: "Named place of destination (excluding unloading and import duties)",
    suitable_for: "any",
    insurance_required: false,
    common_use_cases: [
      "Door-to-door deliveries where buyer handles import clearance",
      "When seller wants to control the full transport chain",
      "E-commerce and direct-to-customer shipments",
      "Deliveries to free trade zones or bonded warehouses",
      "Commonly used in intra-EU trade",
    ],
  },
  DPU: {
    code: "DPU",
    full_name: "Delivered at Place Unloaded",
    description:
      "Seller delivers when goods are unloaded from the arriving means of transport at the named destination. " +
      "This is the only Incoterm that requires the seller to unload goods at destination. " +
      "Previously known as DAT (Delivered at Terminal) in Incoterms 2010, renamed to allow any place, not just terminals.",
    seller_obligations: [
      "Deliver and unload goods at the named place of destination",
      "Arrange and pay for carriage to the named destination",
      "Bear all risks of loss or damage until goods are unloaded at destination",
      "Clear goods for export and any transit formalities",
      "Pay for unloading at the named destination",
      "Provide transport document enabling the buyer to take delivery",
      "Notify the buyer of dispatch and expected arrival details",
    ],
    buyer_obligations: [
      "Take delivery of the unloaded goods at the named destination",
      "Handle import clearance, duties, taxes, and formalities",
      "Bear all risks and costs after goods are unloaded at the named destination",
      "Provide the seller with any information needed for transport",
      "Pay for any pre-shipment inspection required by import country",
      "Arrange and pay for onward transport from the named destination",
      "Arrange and pay for insurance if desired (not obligatory)",
    ],
    risk_transfer_point: "When goods are unloaded from the arriving transport at the named destination",
    cost_transfer_point: "Named place of destination (including unloading, excluding import duties)",
    suitable_for: "any",
    insurance_required: false,
    common_use_cases: [
      "Deliveries to container terminals, ports, or warehouse docks",
      "When buyer has no unloading facilities and seller can arrange unloading",
      "Bulk cargo deliveries",
      "Project cargo requiring specialized unloading equipment",
      "Terminal-to-terminal logistics arrangements",
    ],
  },
  DDP: {
    code: "DDP",
    full_name: "Delivered Duty Paid",
    description:
      "Maximum obligation for the seller. Seller delivers goods cleared for import at the named destination. " +
      "Seller bears all costs and risks including import duties, taxes (VAT/GST), and customs clearance. " +
      "The only cost not borne by seller is unloading at destination (unless agreed otherwise).",
    seller_obligations: [
      "Deliver goods at the named destination, cleared for import",
      "Arrange and pay for all carriage to the named destination",
      "Clear goods for export, transit, AND import",
      "Pay all import duties, taxes (including VAT/GST), and customs fees",
      "Bear all risks of loss or damage until goods are delivered at the named destination",
      "Provide transport document and all documentation for import clearance",
      "Notify the buyer of dispatch and delivery details",
    ],
    buyer_obligations: [
      "Take delivery of goods at the named destination",
      "Unload goods at own cost and risk (unless included in the contract)",
      "Provide the seller with information needed for import clearance",
      "Assist seller in obtaining import licenses or permits if needed",
      "Bear all risks and costs after delivery at the named destination",
      "Arrange and pay for insurance if desired (not obligatory)",
      "Provide import documentation access or power of attorney to seller",
    ],
    risk_transfer_point: "When goods are placed at buyer's disposal at the named destination",
    cost_transfer_point: "Named place of destination (including all import duties and taxes)",
    suitable_for: "any",
    insurance_required: false,
    common_use_cases: [
      "When seller wants to offer a complete landed-cost price",
      "E-commerce and B2C international sales",
      "When buyer cannot or does not want to handle import formalities",
      "Sales into countries where the seller has an import presence",
      "Turnkey project deliveries",
    ],
  },
  FAS: {
    code: "FAS",
    full_name: "Free Alongside Ship",
    description:
      "Seller delivers when goods are placed alongside the vessel (on the quay or barge) at the named port of shipment. " +
      "Risk of loss or damage transfers when goods are alongside the ship. " +
      "Only suitable for sea and inland waterway transport — NOT for containerized cargo.",
    seller_obligations: [
      "Deliver goods alongside the vessel at the named port of shipment",
      "Clear goods for export and pay export duties",
      "Bear all costs and risks until goods are placed alongside the vessel",
      "Provide proof of delivery alongside the vessel",
      "Provide commercial invoice and assist with export documentation",
      "Notify the buyer that goods have been delivered alongside the vessel",
    ],
    buyer_obligations: [
      "Nominate the vessel and notify the seller of vessel name, loading point, and delivery time",
      "Contract and pay for carriage from the port of shipment",
      "Bear all risks of loss or damage from the moment goods are alongside the vessel",
      "Handle import clearance, duties, taxes, and formalities",
      "Pay loading costs (loading onto the vessel)",
      "Arrange and pay for insurance if desired",
      "Pay for any pre-shipment inspection required by import country",
    ],
    risk_transfer_point: "When goods are placed alongside the vessel at the named port of shipment",
    cost_transfer_point: "At the named port of shipment (alongside the vessel)",
    suitable_for: "sea_and_inland_waterway_only",
    insurance_required: false,
    common_use_cases: [
      "Bulk cargo (grain, coal, minerals, timber)",
      "Heavy or oversized cargo loaded by port cranes",
      "When buyer has established shipping arrangements",
      "Breakbulk cargo",
    ],
  },
  FOB: {
    code: "FOB",
    full_name: "Free On Board",
    description:
      "Seller delivers goods on board the vessel at the named port of shipment. Risk transfers when goods are on board. " +
      "Only for sea and inland waterway transport. NOT recommended for containerized goods (use FCA instead) " +
      "because containers are typically handed to the carrier at a terminal before being loaded on the vessel.",
    seller_obligations: [
      "Deliver goods on board the vessel nominated by the buyer at the named port of shipment",
      "Clear goods for export and pay export duties",
      "Bear all costs and risks until goods are on board the vessel",
      "Pay loading costs at the port of shipment",
      "Provide proof of delivery on board (e.g. on-board bill of lading)",
      "Provide commercial invoice and export documentation",
      "Notify the buyer that goods have been loaded on board",
    ],
    buyer_obligations: [
      "Nominate the vessel and notify the seller of vessel name, loading point, and delivery time",
      "Contract and pay for carriage from the port of shipment to the destination",
      "Bear all risks of loss or damage from the moment goods are on board the vessel",
      "Handle import clearance, duties, taxes, and formalities",
      "Pay for any pre-shipment inspection required by import country",
      "Arrange and pay for insurance if desired",
      "Receive delivery of goods at the destination port",
    ],
    risk_transfer_point: "When goods are on board the vessel at the named port of shipment",
    cost_transfer_point: "At the named port of shipment (goods on board)",
    suitable_for: "sea_and_inland_waterway_only",
    insurance_required: false,
    common_use_cases: [
      "Bulk commodities (oil, grain, ore)",
      "Non-containerized ocean freight",
      "When buyer has their own shipping arrangements or freight contracts",
      "Traditional maritime trade",
      "Widely used (though FCA is technically preferred for containers)",
    ],
  },
  CFR: {
    code: "CFR",
    full_name: "Cost and Freight",
    description:
      "Seller pays for carriage to the named destination port, but risk transfers when goods are loaded on board " +
      "the vessel at the port of shipment. Two critical points: risk transfers at origin port, cost transfers at " +
      "destination port. Sea and inland waterway transport only.",
    seller_obligations: [
      "Deliver goods on board the vessel at the port of shipment",
      "Contract and pay for carriage to the named destination port",
      "Clear goods for export and pay export duties",
      "Bear costs until goods arrive at the named destination port",
      "Provide transport document (bill of lading) for the agreed destination",
      "Provide commercial invoice and export documentation",
      "Notify the buyer that goods have been loaded on board",
    ],
    buyer_obligations: [
      "Accept delivery of goods on board the vessel at the port of shipment (risk transfer)",
      "Receive goods at the named destination port",
      "Bear all risks of loss or damage from the moment goods are on board at the origin port",
      "Handle import clearance, duties, taxes, and formalities",
      "Pay unloading costs at the destination port (unless included in freight contract)",
      "Arrange and pay for insurance if desired (not obligatory)",
      "Pay for any pre-shipment inspection required by import country",
    ],
    risk_transfer_point: "When goods are on board the vessel at the port of shipment",
    cost_transfer_point: "Named port of destination",
    suitable_for: "sea_and_inland_waterway_only",
    insurance_required: false,
    common_use_cases: [
      "Commodity trading (oil, metals, agricultural products)",
      "When seller has better ocean freight rates",
      "Non-containerized ocean shipments",
      "When buyer does not want to arrange ocean carriage",
    ],
  },
  CIF: {
    code: "CIF",
    full_name: "Cost, Insurance and Freight",
    description:
      "Same as CFR, but seller must also arrange and pay for insurance. Under Incoterms 2020, CIF requires " +
      "minimum Institute Cargo Clauses (C) — note this is LESS coverage than CIP which requires ICC(A). " +
      "Risk transfers when goods are loaded on board at the origin port. Sea and inland waterway only.",
    seller_obligations: [
      "Deliver goods on board the vessel at the port of shipment",
      "Contract and pay for carriage to the named destination port",
      "Obtain insurance at minimum Institute Cargo Clauses (C) coverage",
      "Clear goods for export and pay export duties",
      "Bear costs (carriage + insurance) until goods arrive at the named destination port",
      "Provide transport document and insurance certificate to the buyer",
      "Notify the buyer that goods have been loaded on board",
    ],
    buyer_obligations: [
      "Accept delivery of goods on board the vessel at the port of shipment (risk transfer)",
      "Receive goods at the named destination port",
      "Bear all risks of loss or damage from the moment goods are on board (covered by seller's insurance at ICC(C) minimum)",
      "Handle import clearance, duties, taxes, and formalities",
      "Pay unloading costs at the destination port (unless included in freight contract)",
      "File insurance claims if loss/damage occurs during transit",
      "Arrange additional insurance coverage beyond ICC(C) if desired",
    ],
    risk_transfer_point: "When goods are on board the vessel at the port of shipment",
    cost_transfer_point: "Named port of destination (including insurance)",
    suitable_for: "sea_and_inland_waterway_only",
    insurance_required: true,
    common_use_cases: [
      "Letter of credit transactions (banks often require CIF)",
      "Commodity trading with insurance requirements",
      "When buyer needs proof of insurance for financing",
      "Traditional maritime trade for medium-to-high-value goods",
      "Ocean freight where buyer lacks insurance access at origin",
    ],
  },
};

registerCapability("incoterms-explain", async (input: CapabilityInput) => {
  const raw = ((input.incoterm as string) ?? (input.code as string) ?? (input.task as string) ?? "").trim();
  if (!raw) {
    throw new Error(
      "'incoterm' or 'code' is required. Provide an Incoterms 2020 code (e.g. 'EXW', 'FOB', 'CIF').",
    );
  }

  const code = raw.toUpperCase().replace(/[^A-Z]/g, "");

  const match = INCOTERMS[code];

  if (match) {
    return {
      output: {
        incoterm: match,
        version: "Incoterms 2020",
        published_by: "International Chamber of Commerce (ICC)",
      },
      provenance: {
        source: "algorithmic",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  // Try partial/fuzzy match by full name
  const lowerRaw = raw.toLowerCase();
  const nameMatch = Object.values(INCOTERMS).find(
    (t) =>
      t.full_name.toLowerCase().includes(lowerRaw) ||
      lowerRaw.includes(t.full_name.toLowerCase()),
  );

  if (nameMatch) {
    return {
      output: {
        incoterm: nameMatch,
        version: "Incoterms 2020",
        published_by: "International Chamber of Commerce (ICC)",
      },
      provenance: {
        source: "algorithmic",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  // Not found — return available codes
  return {
    output: {
      error: `Unknown Incoterm: "${raw}". Must be one of the 11 Incoterms 2020 rules.`,
      available_codes: Object.keys(INCOTERMS),
      available_terms: Object.values(INCOTERMS).map((t) => ({
        code: t.code,
        full_name: t.full_name,
        suitable_for: t.suitable_for,
      })),
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
