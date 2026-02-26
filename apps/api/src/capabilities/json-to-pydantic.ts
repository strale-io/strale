import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("json-to-pydantic", async (input: CapabilityInput) => {
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

  const rootName = ((input.root_name as string) ?? (input.class_name as string) ?? "Root").trim();
  const models: string[] = [];
  const seen = new Map<string, number>();

  function safeName(base: string): string {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}${n}`;
  }

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/[^a-zA-Z0-9]/g, "");
  }

  function pyType(val: unknown, hint: string): string {
    if (val === null || val === undefined) return "Any";
    if (typeof val === "string") return "str";
    if (typeof val === "number") return Number.isInteger(val) ? "int" : "float";
    if (typeof val === "boolean") return "bool";
    if (Array.isArray(val)) {
      if (val.length === 0) return "List[Any]";
      return `List[${pyType(val[0], hint)}]`;
    }
    if (typeof val === "object") {
      const name = safeName(cap(hint));
      buildModel(val as Record<string, unknown>, name);
      return name;
    }
    return "Any";
  }

  function buildModel(obj: Record<string, unknown>, name: string): void {
    const fields = Object.entries(obj).map(([k, v]) => {
      const t = pyType(v, name + cap(k));
      return v === null ? `    ${k}: Optional[${t}] = None` : `    ${k}: ${t}`;
    });
    models.push(`class ${name}(BaseModel):\n${fields.join("\n")}`);
  }

  let rootType: string;
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
      const name = safeName(cap(rootName));
      buildModel(data[0] as Record<string, unknown>, name);
      rootType = `List[${name}]`;
    } else {
      rootType = data.length > 0 ? `List[${pyType(data[0], rootName)}]` : "List[Any]";
    }
  } else if (typeof data === "object" && data !== null) {
    const name = safeName(cap(rootName));
    buildModel(data as Record<string, unknown>, name);
    rootType = name;
  } else {
    rootType = pyType(data, rootName);
  }

  const imports = "from pydantic import BaseModel\nfrom typing import Any, List, Optional";
  const code = `${imports}\n\n${models.reverse().join("\n\n")}`;

  return {
    output: {
      pydantic_model: code,
      root_type: rootType,
      model_count: models.length,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
