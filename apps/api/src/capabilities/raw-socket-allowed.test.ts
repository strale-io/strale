/**
 * WP12 batch 2 (CR-11): the positive side of the connect-time guard. The
 * refusal tests alone would pass a guard that refused every connection, so
 * here 127.0.0.1 is treated as an allowed address and the helpers and the
 * capabilities must actually connect to local servers: a TCP listener and a
 * TLS server with a throwaway self-signed certificate made in-test.
 *
 * Only 127.0.0.1 and the test hostname are allowed, and only in this file;
 * every other address is judged by the real isBlockedIp. Nothing leaves the
 * machine.
 */
import crypto from "node:crypto";
import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const ALLOWED_HOST = "allowed.strale-test.example";

vi.mock("../lib/url-validator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/url-validator.js")>();
  return {
    ...actual,
    isBlockedIp: (addr: string) => (addr === "127.0.0.1" ? false : actual.isBlockedIp(addr)),
    validateHost: async (host: string) =>
      host === "127.0.0.1" || host === ALLOWED_HOST ? undefined : actual.validateHost(host),
  };
});

const { connectTcpVetted, connectTlsVetted } = await import("../lib/vetted-connect.js");
const { getExecutor } = await import("./index.js");
await import("./port-check.js");
await import("./ssl-check.js");
await import("./ssl-certificate-chain.js");

// ─── A self-signed certificate, built in DER by hand ─────────────────────────
// Node has no certificate generator and the repo carries no x509 library, so
// this assembles a minimal X.509 v1 certificate (CN=<cn>, ECDSA P-256,
// SHA-256) and signs it with node:crypto.

function der(tag: number, body: Buffer): Buffer {
  const n = body.length;
  const len = n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 0xff]);
  return Buffer.concat([Buffer.from([tag]), len, body]);
}
const seq = (...parts: Buffer[]) => der(0x30, Buffer.concat(parts));
const ECDSA_SHA256 = seq(Buffer.from("06082a8648ce3d040302", "hex"));
const utcTime = (d: Date) =>
  der(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z", "ascii"));
const cnName = (cn: string) =>
  seq(der(0x31, seq(Buffer.from("0603550403", "hex"), der(0x0c, Buffer.from(cn, "utf8")))));

function selfSignedCert(cn: string): { key: string; cert: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const now = Date.now();
  const tbs = seq(
    der(0x02, Buffer.from([0x01])), // serial
    ECDSA_SHA256,
    cnName(cn), // issuer
    seq(utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 30 * 86_400_000))),
    cnName(cn), // subject
    publicKey.export({ type: "spki", format: "der" }),
  );
  const signature = crypto.sign("sha256", tbs, privateKey);
  const certDer = seq(tbs, ECDSA_SHA256, der(0x03, Buffer.concat([Buffer.from([0]), signature])));
  const b64 = certDer.toString("base64").match(/.{1,64}/g)!.join("\n");
  return {
    key: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    cert: `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`,
  };
}

// ─── Local servers ───────────────────────────────────────────────────────────

let tcpServer: net.Server;
let tlsServer: tls.Server;
let tcpPort = 0;
let tlsPort = 0;


beforeAll(async () => {
  tcpServer = net.createServer((sock) => sock.destroy());
  await new Promise<void>((r) => tcpServer.listen(0, "127.0.0.1", r));
  tcpPort = (tcpServer.address() as net.AddressInfo).port;

  tlsServer = tls.createServer(selfSignedCert(ALLOWED_HOST), (sock) => {

    sock.end();
  });
  tlsServer.on("tlsClientError", () => {});
  await new Promise<void>((r) => tlsServer.listen(0, "127.0.0.1", r));
  tlsPort = (tlsServer.address() as net.AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => tcpServer.close(() => r()));
  await new Promise<void>((r) => tlsServer.close(() => r()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Resolve ALLOWED_HOST to 127.0.0.1 at connect time, through vettedLookup. */
function resolveAllowedHostToLoopback() {
  return vi.spyOn(dns, "lookup").mockImplementation(((
    _host: string,
    _options: unknown,
    cb: (err: null, a: Array<{ address: string; family: number }>) => void,
  ) => {
    process.nextTick(() => cb(null, [{ address: "127.0.0.1", family: 4 }]));
  }) as never);
}

function exec(slug: string) {
  const fn = getExecutor(slug);
  if (!fn) throw new Error(`no executor registered for ${slug}`);
  return fn;
}

describe("the connect-time guard lets an allowed address through", () => {
  it("connectTcpVetted resolves for an allowed peer (IP literal)", async () => {
    const socket = await connectTcpVetted({ host: "127.0.0.1", port: tcpPort, timeoutMs: 2000 });
    expect(socket.remoteAddress).toBe("127.0.0.1");
    socket.destroy();
  });

  it("connectTcpVetted resolves for an allowed hostname, through vettedLookup", async () => {
    const lookup = resolveAllowedHostToLoopback();
    const socket = await connectTcpVetted({ host: ALLOWED_HOST, port: tcpPort, timeoutMs: 2000 });
    expect(socket.remoteAddress).toBe("127.0.0.1");
    expect(lookup).toHaveBeenCalled();
    socket.destroy();
  });

  it("connectTlsVetted completes a handshake with SNI and the certificate unchanged", async () => {
    resolveAllowedHostToLoopback();
    const serverSide = new Promise<string | false>((r) =>
      tlsServer.once("secureConnection", (s: tls.TLSSocket) => r(s.servername)),
    );
    let client: tls.TLSSocket | undefined;
    const peer = await new Promise<tls.PeerCertificate>((resolve, reject) => {
      client = connectTlsVetted(
        { host: ALLOWED_HOST, port: tlsPort, servername: ALLOWED_HOST, rejectUnauthorized: false },
        () => resolve(client!.getPeerCertificate()),
      );
      client.on("error", reject);
    });
    // Keep the client open until the server has finished its side of the handshake.
    const sni = await serverSide;
    client!.destroy();
    expect(peer.subject.CN).toBe(ALLOWED_HOST);
    expect(sni).toBe(ALLOWED_HOST); // the SNI the server received
  });
});

describe("the raw-socket capabilities still answer for an allowed host", () => {
  it("port-check reports the listening port open", async () => {
    const result = (await exec("port-check")({ host: "127.0.0.1", ports: [tcpPort], timeout_ms: 2000 })) as {
      output: { open_count: number; open_ports: Array<{ port: number }> };
    };
    expect(result.output.open_count).toBe(1);
    expect(result.output.open_ports[0].port).toBe(tcpPort);
  });

  it("ssl-check returns its full output shape from a real handshake", async () => {
    resolveAllowedHostToLoopback();
    const result = (await exec("ssl-check")({ domain: ALLOWED_HOST, port: tlsPort })) as {
      output: Record<string, unknown>;
    };
    expect(Object.keys(result.output).sort()).toEqual([
      "cipher_name", "cipher_version", "days_until_expiry", "domain", "fingerprint_sha256",
      "is_expired", "is_expiring_soon", "issuer", "protocol", "serial_number", "subject",
      "subject_alt_names", "valid", "valid_from", "valid_to",
    ]);
    expect(result.output.subject).toBe(ALLOWED_HOST);
    expect(result.output.domain).toBe(ALLOWED_HOST);
    expect(result.output.valid).toBe(false); // self-signed
    expect(result.output.is_expired).toBe(false);
  });

  it("ssl-certificate-chain returns its full output shape from a real handshake", async () => {
    resolveAllowedHostToLoopback();
    const result = (await exec("ssl-certificate-chain")({ host: ALLOWED_HOST, port: tlsPort })) as {
      output: Record<string, unknown> & { leaf_certificate: { common_name: string }; chain_length: number };
    };
    expect(Object.keys(result.output).sort()).toEqual([
      "authorized", "certificate_chain", "chain_length", "cipher_suite", "host", "issues",
      "leaf_certificate", "port", "tls_version",
    ]);
    expect(result.output.leaf_certificate.common_name).toBe(ALLOWED_HOST);
    expect(result.output.chain_length).toBe(1);
  });
});
