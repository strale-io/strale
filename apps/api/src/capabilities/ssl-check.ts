import { registerCapability, type CapabilityInput } from "./index.js";
import { connect, type TLSSocket } from "node:tls";

registerCapability("ssl-check", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!domain) {
    throw new Error("'domain' is required. Provide a domain name (e.g. example.com).");
  }

  const cleaned = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const port = (input.port as number) ?? 443;

  const certInfo = await getCertInfo(cleaned, port);

  return {
    output: certInfo,
    provenance: { source: "tls-handshake", fetched_at: new Date().toISOString() },
  };
});

function getCertInfo(host: string, port: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TLS connection to ${host}:${port} timed out.`));
    }, 10000);

    const socket: TLSSocket = connect(
      { host, port, servername: host, rejectUnauthorized: false },
      () => {
        clearTimeout(timeout);

        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();

        if (!cert || !cert.subject) {
          socket.destroy();
          reject(new Error(`No certificate returned for ${host}.`));
          return;
        }

        const now = new Date();
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const result: Record<string, unknown> = {
          domain: host,
          valid: authorized,
          issuer: cert.issuer?.O ?? cert.issuer?.CN ?? null,
          subject: cert.subject?.CN ?? null,
          subject_alt_names: cert.subjectaltname
            ? cert.subjectaltname.split(", ").map((s: string) => s.replace("DNS:", ""))
            : [],
          valid_from: validFrom.toISOString(),
          valid_to: validTo.toISOString(),
          days_until_expiry: daysUntilExpiry,
          is_expired: daysUntilExpiry < 0,
          is_expiring_soon: daysUntilExpiry >= 0 && daysUntilExpiry <= 30,
          serial_number: cert.serialNumber ?? null,
          fingerprint_sha256: cert.fingerprint256 ?? null,
          protocol: protocol ?? null,
          cipher_name: cipher?.name ?? null,
          cipher_version: cipher?.version ?? null,
        };

        socket.destroy();
        resolve(result);
      }
    );

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`TLS connection failed for ${host}: ${err.message}`));
    });
  });
}
