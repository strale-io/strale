import { registerCapability, type CapabilityInput } from "./index.js";

// ip-api.com — free for non-commercial use (45 req/min), no key required
registerCapability("ip-geolocation", async (input: CapabilityInput) => {
  const ip = ((input.ip as string) ?? (input.ip_address as string) ?? (input.task as string) ?? "").trim();
  if (!ip) throw new Error("'ip' (IP address) is required.");

  // Basic validation
  const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (!ipv4.test(ip) && !ipv6.test(ip)) throw new Error("Invalid IP address format.");

  const fields = "status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query";
  const response = await fetch(`http://ip-api.com/json/${ip}?fields=${fields}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`ip-api.com returned HTTP ${response.status}`);
  const data = (await response.json()) as any;

  if (data.status === "fail") throw new Error(`IP lookup failed: ${data.message}`);

  return {
    output: {
      ip: data.query,
      country: data.country,
      country_code: data.countryCode,
      region: data.regionName,
      region_code: data.region,
      city: data.city,
      zip: data.zip,
      coordinates: { latitude: data.lat, longitude: data.lon },
      timezone: data.timezone,
      isp: data.isp,
      organization: data.org,
      as_number: data.as,
      is_mobile: data.mobile,
      is_proxy: data.proxy,
      is_hosting: data.hosting,
    },
    provenance: { source: "ip-api.com", fetched_at: new Date().toISOString() },
  };
});
