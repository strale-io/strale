import { registerCapability, type CapabilityInput } from "./index.js";
import * as net from "net";

registerCapability("port-check", async (input: CapabilityInput) => {
  const host = ((input.host as string) ?? (input.hostname as string) ?? (input.task as string) ?? "").trim();
  if (!host) throw new Error("'host' (hostname or IP address) is required.");

  const portsInput = input.ports ?? input.port;
  let ports: number[];

  if (typeof portsInput === "string") {
    ports = portsInput.split(",").map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));
  } else if (typeof portsInput === "number") {
    ports = [portsInput];
  } else if (Array.isArray(portsInput)) {
    ports = (portsInput as any[]).map(p => Number(p)).filter(p => !isNaN(p));
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

  async function checkPort(port: number): Promise<{ port: number; open: boolean; service: string; latency_ms: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);

      socket.on("connect", () => {
        const latency = Date.now() - start;
        socket.destroy();
        resolve({ port, open: true, service: commonServices[port] ?? "unknown", latency_ms: latency });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({ port, open: false, service: commonServices[port] ?? "unknown", latency_ms: timeout });
      });

      socket.on("error", () => {
        resolve({ port, open: false, service: commonServices[port] ?? "unknown", latency_ms: Date.now() - start });
      });

      socket.connect(port, host);
    });
  }

  const results = await Promise.all(ports.map(checkPort));
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
