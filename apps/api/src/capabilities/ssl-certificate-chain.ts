import { registerCapability, type CapabilityInput } from "./index.js";
import * as tls from "tls";

registerCapability("ssl-certificate-chain", async (input: CapabilityInput) => {
  let host = ((input.host as string) ?? (input.domain as string) ?? (input.url as string) ?? (input.task as string) ?? "").trim();
  if (!host) throw new Error("'host' (hostname or domain) is required.");

  // Strip protocol/path
  host = host.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  const port = Number(input.port ?? 443);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("TLS connection timed out after 10s."));
    }, 10000);

    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      clearTimeout(timeout);

      const cert = socket.getPeerCertificate(true);
      const authorized = socket.authorized;
      const protocol = socket.getProtocol();
      const cipher = socket.getCipher();

      // Build certificate chain
      const chain: any[] = [];
      let current: any = cert;
      const seen = new Set<string>();

      while (current && !seen.has(current.fingerprint256)) {
        seen.add(current.fingerprint256);
        chain.push({
          subject: current.subject ? formatDN(current.subject) : null,
          issuer: current.issuer ? formatDN(current.issuer) : null,
          valid_from: current.valid_from,
          valid_to: current.valid_to,
          serial_number: current.serialNumber,
          fingerprint_sha256: current.fingerprint256,
          bits: current.bits,
          subject_alt_names: current.subjectaltname?.split(", ") ?? [],
        });
        current = current.issuerCertificate;
        if (current === cert) break; // Self-signed loop
      }

      const leafCert = chain[0];
      const now = new Date();
      const validTo = leafCert ? new Date(leafCert.valid_to) : null;
      const validFrom = leafCert ? new Date(leafCert.valid_from) : null;
      const daysUntilExpiry = validTo ? Math.floor((validTo.getTime() - now.getTime()) / 86400000) : null;

      // Issues detection
      const issues: string[] = [];
      if (!authorized) issues.push("Certificate not trusted by system CA store");
      if (daysUntilExpiry !== null && daysUntilExpiry < 0) issues.push("Certificate has expired");
      else if (daysUntilExpiry !== null && daysUntilExpiry < 30) issues.push(`Certificate expires in ${daysUntilExpiry} days`);
      if (leafCert?.bits && leafCert.bits < 2048) issues.push(`Weak key size: ${leafCert.bits} bits`);
      if (protocol === "TLSv1" || protocol === "TLSv1.1") issues.push(`Outdated TLS version: ${protocol}`);

      socket.destroy();

      resolve({
        output: {
          host,
          port,
          tls_version: protocol,
          cipher_suite: cipher?.name ?? null,
          authorized,
          chain_length: chain.length,
          certificate_chain: chain,
          leaf_certificate: {
            common_name: cert.subject?.CN ?? null,
            organization: cert.subject?.O ?? null,
            valid_from: validFrom?.toISOString() ?? null,
            valid_to: validTo?.toISOString() ?? null,
            days_until_expiry: daysUntilExpiry,
            is_expired: daysUntilExpiry !== null && daysUntilExpiry < 0,
            san_count: leafCert?.subject_alt_names?.length ?? 0,
          },
          issues,
        },
        provenance: { source: "tls-connect", fetched_at: new Date().toISOString() },
      });
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`TLS connection failed: ${err.message}`));
    });
  });
});

function formatDN(obj: Record<string, string>): string {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join(", ");
}
