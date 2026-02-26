import { registerCapability, type CapabilityInput } from "./index.js";

type ConversionTable = Record<string, Record<string, number | ((v: number) => number)>>;

// Base unit conversion factors (multiply source value to get base, divide to get target)
const CONVERSIONS: Record<string, ConversionTable> = {
  length: {
    m: { m: 1, km: 0.001, cm: 100, mm: 1000, in: 39.3701, ft: 3.28084, yd: 1.09361, mi: 0.000621371, nm: 0.000539957 },
    km: { m: 1000 }, cm: { m: 0.01 }, mm: { m: 0.001 },
    in: { m: 0.0254 }, ft: { m: 0.3048 }, yd: { m: 0.9144 }, mi: { m: 1609.344 },
    nm: { m: 1852 }, nmi: { m: 1852 },
  },
  weight: {
    kg: { kg: 1, g: 1000, mg: 1e6, lb: 2.20462, oz: 35.274, t: 0.001, st: 0.157473 },
    g: { kg: 0.001 }, mg: { kg: 1e-6 }, lb: { kg: 0.453592 },
    oz: { kg: 0.0283495 }, t: { kg: 1000 }, st: { kg: 6.35029 },
  },
  volume: {
    l: { l: 1, ml: 1000, cl: 100, gal: 0.264172, qt: 1.05669, pt: 2.11338, cup: 4.22675, floz: 33.814, tbsp: 67.628, tsp: 202.884 },
    ml: { l: 0.001 }, cl: { l: 0.01 }, gal: { l: 3.78541 }, qt: { l: 0.946353 },
    pt: { l: 0.473176 }, cup: { l: 0.236588 }, floz: { l: 0.0295735 },
    tbsp: { l: 0.0147868 }, tsp: { l: 0.00492892 },
  },
  area: {
    sqm: { sqm: 1, sqkm: 1e-6, sqft: 10.7639, sqyd: 1.19599, sqmi: 3.861e-7, acre: 0.000247105, ha: 1e-4 },
    sqkm: { sqm: 1e6 }, sqft: { sqm: 0.092903 }, sqyd: { sqm: 0.836127 },
    sqmi: { sqm: 2.59e6 }, acre: { sqm: 4046.86 }, ha: { sqm: 10000 },
  },
  speed: {
    mps: { mps: 1, kph: 3.6, mph: 2.23694, knot: 1.94384, fps: 3.28084 },
    kph: { mps: 0.277778 }, mph: { mps: 0.44704 }, knot: { mps: 0.514444 }, fps: { mps: 0.3048 },
  },
  data: {
    b: { b: 1, kb: 1/1024, mb: 1/(1024**2), gb: 1/(1024**3), tb: 1/(1024**4), bit: 8 },
    kb: { b: 1024 }, mb: { b: 1024**2 }, gb: { b: 1024**3 }, tb: { b: 1024**4 }, bit: { b: 1/8 },
  },
};

// Temperature is special — not multiplicative
const TEMP_CONVERSIONS: Record<string, Record<string, (v: number) => number>> = {
  c: { f: (v) => v * 9/5 + 32, k: (v) => v + 273.15, c: (v) => v },
  f: { c: (v) => (v - 32) * 5/9, k: (v) => (v - 32) * 5/9 + 273.15, f: (v) => v },
  k: { c: (v) => v - 273.15, f: (v) => (v - 273.15) * 9/5 + 32, k: (v) => v },
};

registerCapability("unit-convert", async (input: CapabilityInput) => {
  const value = Number(input.value);
  if (isNaN(value)) throw new Error("'value' must be a number.");

  const fromUnit = ((input.from_unit as string) ?? (input.from as string) ?? "").toLowerCase().trim();
  const toUnit = ((input.to_unit as string) ?? (input.to as string) ?? "").toLowerCase().trim();
  if (!fromUnit || !toUnit) throw new Error("'from_unit' and 'to_unit' are required.");

  // Check temperature
  const tempFrom = normalizeTemp(fromUnit);
  const tempTo = normalizeTemp(toUnit);
  if (tempFrom && tempTo) {
    const fn = TEMP_CONVERSIONS[tempFrom]?.[tempTo];
    if (!fn) throw new Error(`Cannot convert temperature from ${fromUnit} to ${toUnit}.`);
    const result = fn(value);
    return {
      output: {
        value, from_unit: fromUnit, to_unit: toUnit,
        result: Math.round(result * 1e6) / 1e6,
        formula: getTemperatureFormula(tempFrom, tempTo),
        category: "temperature",
      },
      provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
    };
  }

  // Find conversion category
  for (const [category, table] of Object.entries(CONVERSIONS)) {
    const normFrom = normalizeUnit(fromUnit);
    const normTo = normalizeUnit(toUnit);

    // Find base unit for source
    let baseUnit: string | null = null;
    let toBase = 1;

    if (table[normFrom]) {
      const directConversion = table[normFrom][normTo];
      if (typeof directConversion === "number") {
        const result = value * directConversion;
        return {
          output: {
            value, from_unit: fromUnit, to_unit: toUnit,
            result: Math.round(result * 1e6) / 1e6,
            formula: `${fromUnit} × ${directConversion}`,
            category,
          },
          provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
        };
      }
      // Convert to base unit first
      for (const [base, factor] of Object.entries(table[normFrom])) {
        if (typeof factor === "number" && table[base]?.[normTo]) {
          baseUnit = base;
          toBase = factor;
          break;
        }
      }
    }

    // Try reverse lookup: find a base that can convert both
    if (!baseUnit) {
      for (const [unit, conversions] of Object.entries(table)) {
        if (conversions[normFrom] !== undefined || unit === normFrom) {
          for (const [targetUnit, targetConversions] of Object.entries(table)) {
            if (targetConversions[normTo] !== undefined || targetUnit === normTo) {
              // Found a path
              break;
            }
          }
        }
      }
    }

    // Simple two-step: source → first base → target
    for (const [unit, conversions] of Object.entries(table)) {
      const fromFactor = unit === normFrom ? 1 : (typeof conversions[normFrom] === "number" ? undefined : undefined);
      // Check if this unit has a path to normFrom
      if (table[normFrom]?.[unit] !== undefined && typeof table[normFrom][unit] === "number") {
        const toMid = table[normFrom][unit] as number;
        if (table[unit]?.[normTo] !== undefined && typeof table[unit][normTo] === "number") {
          const toTarget = table[unit][normTo] as number;
          const result = value * toMid * toTarget;
          return {
            output: {
              value, from_unit: fromUnit, to_unit: toUnit,
              result: Math.round(result * 1e6) / 1e6,
              formula: `${fromUnit} → ${unit} → ${toUnit}`,
              category,
            },
            provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
          };
        }
      }
    }
  }

  throw new Error(`Cannot convert from '${fromUnit}' to '${toUnit}'. Supported categories: length, weight, volume, temperature, area, speed, data storage.`);
});

function normalizeUnit(u: string): string {
  const aliases: Record<string, string> = {
    meter: "m", meters: "m", metre: "m", metres: "m",
    kilometer: "km", kilometers: "km", kilometre: "km",
    centimeter: "cm", centimeters: "cm", millimeter: "mm", millimeters: "mm",
    inch: "in", inches: "in", foot: "ft", feet: "ft", yard: "yd", yards: "yd",
    mile: "mi", miles: "mi",
    kilogram: "kg", kilograms: "kg", gram: "g", grams: "g",
    milligram: "mg", milligrams: "mg", pound: "lb", pounds: "lb", lbs: "lb",
    ounce: "oz", ounces: "oz", ton: "t", tons: "t", tonne: "t", stone: "st",
    liter: "l", liters: "l", litre: "l", litres: "l",
    milliliter: "ml", milliliters: "ml", gallon: "gal", gallons: "gal",
    quart: "qt", pint: "pt", tablespoon: "tbsp", teaspoon: "tsp",
    byte: "b", bytes: "b", kilobyte: "kb", megabyte: "mb", gigabyte: "gb", terabyte: "tb",
    "sq m": "sqm", "sq km": "sqkm", "sq ft": "sqft", "sq yd": "sqyd", "sq mi": "sqmi",
    hectare: "ha", hectares: "ha",
    "m/s": "mps", "km/h": "kph", "kmh": "kph", "mph": "mph", knots: "knot", "ft/s": "fps",
  };
  return aliases[u] ?? u;
}

function normalizeTemp(u: string): string | null {
  const t = u.replace("°", "").toLowerCase();
  if (t === "c" || t === "celsius") return "c";
  if (t === "f" || t === "fahrenheit") return "f";
  if (t === "k" || t === "kelvin") return "k";
  return null;
}

function getTemperatureFormula(from: string, to: string): string {
  if (from === "c" && to === "f") return "°F = °C × 9/5 + 32";
  if (from === "f" && to === "c") return "°C = (°F − 32) × 5/9";
  if (from === "c" && to === "k") return "K = °C + 273.15";
  if (from === "k" && to === "c") return "°C = K − 273.15";
  if (from === "f" && to === "k") return "K = (°F − 32) × 5/9 + 273.15";
  if (from === "k" && to === "f") return "°F = (K − 273.15) × 9/5 + 32";
  return `${from} → ${to}`;
}
