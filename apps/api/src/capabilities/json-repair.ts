import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("json-repair", async (input: CapabilityInput) => {
  const raw = ((input.json as string) ?? (input.data as string) ?? (input.text as string) ?? (input.task as string) ?? "").trim();
  if (!raw) throw new Error("'json' is required. Provide a broken JSON string to repair.");

  const fixes: string[] = [];
  let repaired = raw;

  // 1. Extract JSON from markdown code blocks
  const codeBlockMatch = repaired.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    repaired = codeBlockMatch[1].trim();
    fixes.push("Extracted JSON from markdown code block");
  }

  // 2. Strip leading/trailing non-JSON text
  const firstBrace = Math.min(
    repaired.indexOf("{") === -1 ? Infinity : repaired.indexOf("{"),
    repaired.indexOf("[") === -1 ? Infinity : repaired.indexOf("["),
  );
  const lastBrace = Math.max(repaired.lastIndexOf("}"), repaired.lastIndexOf("]"));

  if (firstBrace !== Infinity && lastBrace > firstBrace) {
    const stripped = repaired.slice(firstBrace, lastBrace + 1);
    if (stripped !== repaired) {
      repaired = stripped;
      fixes.push("Stripped non-JSON text before/after");
    }
  }

  // 3. Remove comments (// and /* */)
  const beforeComments = repaired;
  repaired = removeComments(repaired);
  if (repaired !== beforeComments) fixes.push("Removed comments");

  // 4. Replace single quotes with double quotes (outside of already-double-quoted strings)
  const beforeQuotes = repaired;
  repaired = fixQuotes(repaired);
  if (repaired !== beforeQuotes) fixes.push("Fixed quote style (single → double)");

  // 5. Add quotes to unquoted keys
  const beforeKeys = repaired;
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  if (repaired !== beforeKeys) fixes.push("Quoted unquoted keys");

  // 6. Remove trailing commas
  const beforeTrailing = repaired;
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  if (repaired !== beforeTrailing) fixes.push("Removed trailing commas");

  // 7. Fix truncated JSON — add missing closing brackets/braces
  const beforeClose = repaired;
  repaired = closeBrackets(repaired);
  if (repaired !== beforeClose) fixes.push("Added missing closing brackets/braces");

  // 8. Replace undefined/NaN with null
  const beforeNull = repaired;
  repaired = repaired.replace(/:\s*undefined\b/g, ": null");
  repaired = repaired.replace(/:\s*NaN\b/g, ": null");
  if (repaired !== beforeNull) fixes.push("Replaced undefined/NaN with null");

  // Try parsing
  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch (e) {
    // Last resort: try eval (safely construct)
    throw new Error(`Could not repair JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    output: {
      json: JSON.stringify(parsed, null, 2),
      parsed,
      valid: true,
      fixes_applied: fixes,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function removeComments(s: string): string {
  let result = "";
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < s.length; i++) {
    if (inString) {
      result += s[i];
      if (s[i] === stringChar && s[i - 1] !== "\\") inString = false;
    } else if (s[i] === '"') {
      result += s[i];
      inString = true;
      stringChar = '"';
    } else if (s[i] === "/" && s[i + 1] === "/") {
      // Skip to end of line
      while (i < s.length && s[i] !== "\n") i++;
      result += "\n";
    } else if (s[i] === "/" && s[i + 1] === "*") {
      // Skip to */
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i++; // Skip past /
    } else {
      result += s[i];
    }
  }
  return result;
}

function fixQuotes(s: string): string {
  let result = "";
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < s.length; i++) {
    if (inDouble) {
      result += s[i];
      if (s[i] === '"' && s[i - 1] !== "\\") inDouble = false;
    } else if (inSingle) {
      if (s[i] === "'") {
        result += '"';
        inSingle = false;
      } else if (s[i] === '"') {
        result += '\\"';
      } else {
        result += s[i];
      }
    } else if (s[i] === '"') {
      result += '"';
      inDouble = true;
    } else if (s[i] === "'") {
      result += '"';
      inSingle = true;
    } else {
      result += s[i];
    }
  }
  return result;
}

function closeBrackets(s: string): string {
  const stack: string[] = [];
  let inString = false;

  for (let i = 0; i < s.length; i++) {
    if (inString) {
      if (s[i] === '"' && s[i - 1] !== "\\") inString = false;
    } else if (s[i] === '"') {
      inString = true;
    } else if (s[i] === "{") {
      stack.push("}");
    } else if (s[i] === "[") {
      stack.push("]");
    } else if (s[i] === "}" || s[i] === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === s[i]) {
        stack.pop();
      }
    }
  }

  // Add missing closers
  while (stack.length > 0) {
    s += stack.pop();
  }
  return s;
}
