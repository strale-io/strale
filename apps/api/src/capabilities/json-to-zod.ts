import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("json-to-zod", async (input: CapabilityInput) => {
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

  const rootName = ((input.root_name as string) ?? (input.schema_name as string) ?? "root").trim();
  const schemas: string[] = [];
  const seen = new Map<string, number>();

  function safeName(base: string): string {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}${n}`;
  }

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/[^a-zA-Z0-9]/g, "");
  }

  function camel(s: string): string {
    return s.charAt(0).toLowerCase() + s.slice(1).replace(/[^a-zA-Z0-9]/g, "");
  }

  function zodType(val: unknown, hint: string): string {
    if (val === null) return "z.null()";
    if (val === undefined) return "z.unknown()";
    if (typeof val === "string") {
      if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(val)) return "z.string().datetime()";
      if (/^[^@]+@[^@]+\.[^@]+$/.test(val)) return "z.string().email()";
      if (/^https?:\/\//.test(val)) return "z.string().url()";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return "z.string().uuid()";
      return "z.string()";
    }
    if (typeof val === "number") return Number.isInteger(val) ? "z.number().int()" : "z.number()";
    if (typeof val === "boolean") return "z.boolean()";
    if (Array.isArray(val)) {
      if (val.length === 0) return "z.array(z.unknown())";
      return `z.array(${zodType(val[0], hint)})`;
    }
    if (typeof val === "object") {
      const name = safeName(camel(hint) + "Schema");
      buildSchema(val as Record<string, unknown>, name);
      return name;
    }
    return "z.unknown()";
  }

  function buildSchema(obj: Record<string, unknown>, name: string): void {
    const fields = Object.entries(obj).map(([k, v]) => {
      return `  ${k}: ${zodType(v, cap(k))},`;
    });
    schemas.push(`const ${name} = z.object({\n${fields.join("\n")}\n});`);
  }

  let rootType: string;
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
      const name = safeName(camel(rootName) + "Schema");
      buildSchema(data[0] as Record<string, unknown>, name);
      rootType = `z.array(${name})`;
    } else {
      rootType = data.length > 0 ? `z.array(${zodType(data[0], rootName)})` : "z.array(z.unknown())";
    }
  } else if (typeof data === "object" && data !== null) {
    const name = safeName(camel(rootName) + "Schema");
    buildSchema(data as Record<string, unknown>, name);
    rootType = name;
  } else {
    rootType = zodType(data, rootName);
  }

  const importLine = 'import { z } from "zod";';
  const code = `${importLine}\n\n${schemas.reverse().join("\n\n")}`;

  return {
    output: {
      zod_schema: code,
      root_schema: rootType,
      schema_count: schemas.length,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
