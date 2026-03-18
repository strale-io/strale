import { registerCapability, type CapabilityInput } from "./index.js";

// Known datacenter/cloud ASN ranges
const DATACENTER_ASNS = new Set([
  "13335", // Cloudflare
  "15169", "396982", // Google
  "16509", "14618", // Amazon/AWS
  "8075", // Microsoft/Azure
  "20940", // Akamai
  "63949", // Linode
  "14061", // DigitalOcean
  "24940", // Hetzner
  "16276", // OVH
  "51167", // Contabo
  "4134", "4837", // China Telecom/Unicom
  "9009", // M247
  "209", // CenturyLink
  "174", // Cogent
]);

// Known VPN provider ASNs
const VPN_ASNS = new Set([
  "9009", // M247 (NordVPN, Surfshark)
  "212238", // Datacamp
  "60068", // CDN77 (some VPN exit)
  "207137", // PacketHub
  "206092", // IPVanish
]);

// Well-known Tor exit node check (simplified — real impl would use Tor exit list)
// For now, we use the ip-api.com hosting/proxy detection
const GOOGLE_DNS = new Set(["8.8.8.8", "8.8.4.4"]);
const CLOUDFLARE_DNS = new Set(["1.1.1.1", "1.0.0.1"]);

registerCapability("ip-risk-score", async (input: CapabilityInput) => {
  const ip = ((input.ip as string) ?? (input.ip_address as string) ?? (input.task as string) ?? "").trim();
  if (!ip) throw new Error("'ip' is required.");

  // Validate IP format
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
  const ipv6 = ip.includes(":");
  if (!ipv4 && !ipv6) throw new Error("Invalid IP address format.");

  // Private/reserved IP check
  if (ipv4) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) || parts[0] === 127) {
      return {
        output: {
          ip, risk_score: 0, risk_level: "none",
          is_vpn: false, is_proxy: false, is_tor: false, is_datacenter: false, is_residential: false,
          note: "Private/reserved IP address — not routable on the public internet",
        },
        provenance: { source: "strale-ip-risk", fetched_at: new Date().toISOString() },
      };
    }
  }

  // Query ip-api.com for IP info
  const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,city,isp,org,as,proxy,hosting,mobile`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`IP lookup failed: HTTP ${res.status}`);

  const data = (await res.json()) as any;
  if (data.status === "fail") {
    throw new Error(`IP lookup failed: ${data.message}`);
  }

  const isHosting = data.hosting === true;
  const isProxy = data.proxy === true;
  const isMobile = data.mobile === true;
  const asn = (data.as ?? "").split(" ")[0]?.replace("AS", "") ?? "";
  const isDatacenter = isHosting || DATACENTER_ASNS.has(asn);
  const isVpn = VPN_ASNS.has(asn) || isProxy;
  const isTor = false; // Would need Tor exit node list
  const isResidential = !isDatacenter && !isProxy && !isMobile;

  // Calculate risk score
  let riskScore = 10; // Base
  const threats: string[] = [];

  if (isProxy) { riskScore += 30; threats.push("proxy_detected"); }
  if (isVpn) { riskScore += 25; threats.push("vpn_suspected"); }
  if (isTor) { riskScore += 40; threats.push("tor_exit_node"); }
  if (isDatacenter) { riskScore += 20; threats.push("datacenter_ip"); }
  if (GOOGLE_DNS.has(ip) || CLOUDFLARE_DNS.has(ip)) {
    riskScore = 5; threats.length = 0; threats.push("public_dns_resolver");
  }

  riskScore = Math.min(100, riskScore);

  let riskLevel: string;
  if (riskScore >= 60) riskLevel = "high";
  else if (riskScore >= 30) riskLevel = "medium";
  else riskLevel = "low";

  return {
    output: {
      ip,
      risk_score: riskScore,
      risk_level: riskLevel,
      is_vpn: isVpn,
      is_proxy: isProxy,
      is_tor: isTor,
      is_datacenter: isDatacenter,
      is_residential: isResidential,
      is_mobile: isMobile,
      asn: asn || null,
      isp: data.isp ?? null,
      org: data.org ?? null,
      country_code: data.countryCode ?? null,
      city: data.city ?? null,
      threats: threats.length > 0 ? threats : null,
    },
    provenance: { source: "ip-api.com+strale-risk", fetched_at: new Date().toISOString() },
  };
});
