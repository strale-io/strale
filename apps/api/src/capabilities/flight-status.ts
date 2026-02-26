import { registerCapability, type CapabilityInput } from "./index.js";

// AviationStack API — free tier (100 req/month), requires API key
// Alternative: algorithmic IATA validation when no key available
registerCapability("flight-status", async (input: CapabilityInput) => {
  const flight = ((input.flight as string) ?? (input.flight_number as string) ?? (input.task as string) ?? "").trim().toUpperCase();
  if (!flight) throw new Error("'flight' (flight number, e.g. 'LH400', 'BA117') is required.");

  // Parse flight number: airline code (2-3 chars) + number
  const match = flight.match(/^([A-Z]{2,3})(\d{1,4})$/);
  if (!match) throw new Error("Invalid flight number format. Expected airline code + number (e.g. 'LH400').");

  const airlineCode = match[1];
  const flightNumber = match[2];

  const aviationStackKey = process.env.AVIATIONSTACK_API_KEY;

  if (aviationStackKey) {
    // Use AviationStack API
    const url = `http://api.aviationstack.com/v1/flights?access_key=${aviationStackKey}&flight_iata=${airlineCode}${flightNumber}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) throw new Error(`AviationStack API returned HTTP ${response.status}`);
    const data = (await response.json()) as any;

    if (data.error) throw new Error(`AviationStack error: ${data.error.message ?? data.error.info}`);

    const flights = data.data ?? [];
    if (flights.length === 0) throw new Error(`No flight data found for ${flight}.`);

    const f = flights[0];
    return {
      output: {
        flight_number: `${airlineCode}${flightNumber}`,
        flight_date: f.flight_date,
        airline: { name: f.airline?.name, iata: f.airline?.iata, icao: f.airline?.icao },
        departure: {
          airport: f.departure?.airport,
          iata: f.departure?.iata,
          scheduled: f.departure?.scheduled,
          estimated: f.departure?.estimated,
          actual: f.departure?.actual,
          terminal: f.departure?.terminal,
          gate: f.departure?.gate,
          delay_minutes: f.departure?.delay,
        },
        arrival: {
          airport: f.arrival?.airport,
          iata: f.arrival?.iata,
          scheduled: f.arrival?.scheduled,
          estimated: f.arrival?.estimated,
          actual: f.arrival?.actual,
          terminal: f.arrival?.terminal,
          gate: f.arrival?.gate,
          delay_minutes: f.arrival?.delay,
        },
        status: f.flight_status,
        aircraft: f.aircraft ? { registration: f.aircraft.registration, iata: f.aircraft.iata } : null,
        live: f.live ? { latitude: f.live.latitude, longitude: f.live.longitude, altitude: f.live.altitude, speed: f.live.speed_horizontal } : null,
      },
      provenance: { source: "api.aviationstack.com", fetched_at: new Date().toISOString() },
    };
  }

  // Fallback: common airline lookup (no API key)
  const airlines: Record<string, string> = {
    LH: "Lufthansa", BA: "British Airways", AF: "Air France", KL: "KLM",
    SK: "SAS Scandinavian Airlines", AY: "Finnair", DY: "Norwegian Air",
    FR: "Ryanair", U2: "easyJet", W6: "Wizz Air", LX: "Swiss",
    OS: "Austrian Airlines", SN: "Brussels Airlines", EI: "Aer Lingus",
    IB: "Iberia", AZ: "ITA Airways", TP: "TAP Portugal", TK: "Turkish Airlines",
    AA: "American Airlines", UA: "United Airlines", DL: "Delta Air Lines",
    WN: "Southwest Airlines", AS: "Alaska Airlines", B6: "JetBlue",
    AC: "Air Canada", QF: "Qantas", SQ: "Singapore Airlines",
    EK: "Emirates", QR: "Qatar Airways", EY: "Etihad Airways",
    NH: "ANA", JL: "Japan Airlines", CX: "Cathay Pacific",
  };

  return {
    output: {
      flight_number: `${airlineCode}${flightNumber}`,
      airline_code: airlineCode,
      airline_name: airlines[airlineCode] ?? "Unknown airline",
      flight_num: flightNumber,
      note: "Set AVIATIONSTACK_API_KEY for live flight data. Showing airline identification only.",
      tracking_urls: [
        `https://www.flightradar24.com/${airlineCode}${flightNumber}`,
        `https://flightaware.com/live/flight/${airlineCode}${flightNumber}`,
        `https://www.google.com/search?q=${airlineCode}${flightNumber}+flight+status`,
      ],
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
