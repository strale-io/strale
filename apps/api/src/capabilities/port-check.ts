import { registerCapability, type CapabilityInput } from "./index.js";
import { validateHost } from "../lib/url-validator.js";
import { connectTcpVetted, portInput } from "../lib/vetted-connect.js";
import { targetUnavailable } from "../lib/upstream-result.js";

/**
 * What a failed connect says about the port (2026-11-06 swallowed-failures
 * audit, row 30). Before, every failure came back as a billed `open: false`,
 * including a host name that does not resolve and Strale's own SSRF refusal.
 *
 * - ECONNREFUSED: the host answered and refused the port. `closed`, billed.
 * - ETIMEDOUT: no answer within the caller's timeout. A firewall that drops
 *   probes looks like this, and reporting it is what a port check is for,
 *   so it is `filtered`, billed. A host that is down looks the same over
 *   TCP; the manifest says so.
 * - EHOSTUNREACH / EHOSTDOWN: an ICMP "unreachable". A firewall rejecting a
 *   port answers like this (`icmp-host-prohibited`), so it is `filtered`
 *   when another port on the host was open or refused. When none was,
 *   nothing shows the host was reached, and the call throws.
 * - Anything else (a name that does not resolve, no route from Strale's
 *   network, a reset) says nothing about the port and throws through
 *   `targetUnavailable`: unbilled, worded and marked as the caller's target
 *   failing. Our own SSRF refusal and our own defects keep their own class.
 */
const FILTERED_CODES = new Set(["ETIMEDOUT"]);
const UNREACHABLE_CODES = new Set(["EHOSTUNREACH", "EHOSTDOWN"]);

type PortState = "open" | "closed" | "filtered";
type PortResult = { port: number; open: boolean; state: PortState; service: string; latency_ms: number };
type Probe = PortResult | { port: number; unreachable: unknown; service: string; latency_ms: number };

registerCapability("port-check", async (input: CapabilityInput) => {
  const host = ((input.host as string) ?? (input.hostname as string) ?? (input.task as string) ?? "").trim();
  if (!host) throw new Error("'host' (hostname or IP address) is required.");
  await validateHost(host);

  const portsInput = input.ports ?? input.port;
  const portsField = input.ports !== undefined ? "ports" : "port";
  let ports: number[];

  // An out-of-range or non-integer port is refused, not reported "closed":
  // it was never a port, and some values make connect throw synchronously.
  if (typeof portsInput === "string") {
    ports = portsInput.split(",").map(p => p.trim()).filter(p => p !== "").map(p => portInput(p, portsField));
  } else if (typeof portsInput === "number") {
    ports = [portInput(portsInput, portsField)];
  } else if (Array.isArray(portsInput)) {
    ports = (portsInput as unknown[]).map(p => portInput(p, portsField));
  } else {
    // Default common ports
    ports = [80, 443, 22, 21, 25, 3306, 5432, 6379, 8080, 8443];
  }

  // Limit to 20 ports
  ports = ports.slice(0, 20);
  const timeout = Math.min(Number(input.timeout_ms ?? 3000), 10000);

  const commonServices: Record<number, string> = {
    21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
    80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS", 465: "SMTPS",
    587: "SMTP/TLS", 993: "IMAPS", 995: "POP3S", 3306: "MySQL",
    5432: "PostgreSQL", 6379: "Redis", 8080: "HTTP-Alt", 8443: "HTTPS-Alt",
    27017: "MongoDB", 9200: "Elasticsearch", 5672: "RabbitMQ",
  };

  const site = `host ${host}`;

  async function checkPort(port: number): Promise<Probe> {
    const start = Date.now();
    const service = commonServices[port] ?? "unknown";
    try {
      // CR-11: the connection goes only to an address checked at connect time.
      const socket = await connectTcpVetted({ host, port, timeoutMs: timeout });
      const latency = Date.now() - start;
      socket.destroy();
      return { port, open: true, state: "open", service, latency_ms: latency };
    } catch (err) {
      // degraded-ok: only a refusal (closed) and a silent port (filtered) are answers about the port; an ICMP unreachable is held for the host-level check below, and every other failure throws through targetUnavailable.
      const code = (err as NodeJS.ErrnoException | null)?.code ?? "";
      if (code === "ECONNREFUSED") return { port, open: false, state: "closed", service, latency_ms: Date.now() - start };
      if (FILTERED_CODES.has(code)) return { port, open: false, state: "filtered", service, latency_ms: timeout };
      if (UNREACHABLE_CODES.has(code)) return { port, unreachable: err, service, latency_ms: Date.now() - start };
      throw targetUnavailable(site, err);
    }
  }

  const probes = await Promise.all(ports.map(checkPort));
  // An ICMP "unreachable" is a firewall's answer only beside a port the host
  // did answer for (open or refused); on its own it is no answer at all.
  const hostAnswered = probes.some((p) => "state" in p && p.state !== "filtered");
  if (!hostAnswered) {
    for (const p of probes) {
      if ("unreachable" in p) throw targetUnavailable(site, p.unreachable);
    }
  }
  const results: PortResult[] = probes.map((p) =>
    "unreachable" in p ? { port: p.port, open: false, state: "filtered", service: p.service, latency_ms: p.latency_ms } : p,
  );
  const openPorts = results.filter(r => r.open);
  const closedPorts = results.filter(r => !r.open);

  return {
    output: {
      host,
      ports_scanned: ports.length,
      open_count: openPorts.length,
      closed_count: closedPorts.length,
      open_ports: openPorts,
      closed_ports: closedPorts,
      scan_timeout_ms: timeout,
    },
    provenance: { source: "tcp-connect", fetched_at: new Date().toISOString() },
  };
});
