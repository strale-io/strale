import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("http-to-curl", async (input: CapabilityInput) => {
  const method = ((input.method as string) ?? "GET").trim().toUpperCase();
  const url = ((input.url as string) ?? "").trim();
  const headers = (input.headers as Record<string, string>) ?? {};
  const body = input.body;
  const auth = input.auth as { type: string; token?: string; username?: string; password?: string } | undefined;

  if (!url) throw new Error("'url' is required.");

  // Build curl command
  const curlParts: string[] = ["curl"];
  if (method !== "GET") curlParts.push(`-X ${method}`);
  curlParts.push(`'${url}'`);

  // Auth
  if (auth) {
    if (auth.type === "bearer" && auth.token) {
      headers["Authorization"] = `Bearer ${auth.token}`;
    } else if (auth.type === "basic" && auth.username) {
      curlParts.push(`-u '${auth.username}:${auth.password ?? ""}'`);
    }
  }

  // Headers
  for (const [key, value] of Object.entries(headers)) {
    curlParts.push(`-H '${key}: ${value}'`);
  }

  // Body
  let bodyStr = "";
  if (body) {
    bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    curlParts.push(`-d '${bodyStr.replace(/'/g, "'\\''")}'`);
  }

  const curlCommand = curlParts.join(" \\\n  ");

  // Build fetch equivalent
  const fetchOpts: string[] = [];
  if (method !== "GET") fetchOpts.push(`  method: "${method}",`);
  if (Object.keys(headers).length > 0) {
    fetchOpts.push(`  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, "\n  ")},`);
  }
  if (bodyStr) fetchOpts.push(`  body: ${typeof body === "string" ? `\`${bodyStr}\`` : `JSON.stringify(${JSON.stringify(body)})`},`);

  const fetchCode = fetchOpts.length > 0
    ? `const response = await fetch("${url}", {\n${fetchOpts.join("\n")}\n});`
    : `const response = await fetch("${url}");`;

  // Build axios equivalent
  const axiosOpts: string[] = [];
  if (Object.keys(headers).length > 0) axiosOpts.push(`  headers: ${JSON.stringify(headers)},`);
  if (bodyStr) axiosOpts.push(`  data: ${typeof body === "string" ? `\`${bodyStr}\`` : JSON.stringify(body)},`);

  const axiosCode = axiosOpts.length > 0
    ? `const response = await axios.${method.toLowerCase()}("${url}", {\n${axiosOpts.join("\n")}\n});`
    : `const response = await axios.${method.toLowerCase()}("${url}");`;

  return {
    output: {
      curl_command: curlCommand,
      equivalent_fetch: fetchCode,
      equivalent_axios: axiosCode,
      method,
      url,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
