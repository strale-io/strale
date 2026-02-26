import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("json-to-typescript", async (input: CapabilityInput) => {
  const jsonInput = input.json ?? input.data ?? input.task;
  let data: unknown;

  if (typeof jsonInput === "string") {
    try { data = JSON.parse((jsonInput as string).trim()); }
    catch { throw new Error("Invalid JSON string."); }
  } else if (jsonInput != null) {
    data = jsonInput;
  } else {
    throw new Error("'json' (JSON string or object) is required.");
  }

  const rootName = ((input.root_name as string) ?? (input.interface_name as string) ?? "Root").trim();
  const useExport = input.export !== false;
  const interfaces: string[] = [];
  const seen = new Map<string, number>();

  function safeName(base: string): string {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}${n}`;
  }

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/[^a-zA-Z0-9]/g, "");
  }

  function tsType(val: unknown, hint: string): string {
    if (val === null || val === undefined) return "unknown";
    if (typeof val === "string") {
      if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(val)) return "string /* ISO date */";
      return "string";
    }
    if (typeof val === "number") return "number";
    if (typeof val === "boolean") return "boolean";
    if (Array.isArray(val)) {
      if (val.length === 0) return "unknown[]";
      return `${tsType(val[0], hint)}[]`;
    }
    if (typeof val === "object") {
      const name = safeName(hint);
      buildInterface(val as Record<string, unknown>, name);
      return name;
    }
    return "unknown";
  }

  function buildInterface(obj: Record<string, unknown>, name: string): void {
    const pfx = useExport ? "export " : "";
    const fields = Object.entries(obj).map(([k, v]) => {
      const prop = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `"${k}"`;
      return `  ${prop}: ${tsType(v, name + cap(k))};`;
    });
    interfaces.push(`${pfx}interface ${name} {\n${fields.join("\n")}\n}`);
  }

  let rootType: string;
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
      const name = safeName(rootName);
      buildInterface(data[0] as Record<string, unknown>, name);
      rootType = `${name}[]`;
    } else {
      rootType = data.length > 0 ? `${tsType(data[0], rootName)}[]` : "unknown[]";
    }
  } else if (typeof data === "object" && data !== null) {
    const name = safeName(rootName);
    buildInterface(data as Record<string, unknown>, name);
    rootType = name;
  } else {
    rootType = tsType(data, rootName);
  }

  return {
    output: {
      typescript: interfaces.reverse().join("\n\n"),
      root_type: rootType,
      interface_count: interfaces.length,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
