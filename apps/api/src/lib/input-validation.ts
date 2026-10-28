/** Dispatch validation: report by default; never log input values or Ajv messages. */
import { Ajv, type ValidateFunction } from "ajv";
import { default as formats } from "ajv-formats";
import { logWarn } from "./log.js";
import { apiError } from "./errors.js";

const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: true });
(formats as unknown as (a: Ajv) => void)(ajv);
const validators = new Map<string, ValidateFunction | null>();
const MAX_SCHEMAS = 2048;

export function validateDispatchInput(slug: string, rail: string, schema: unknown, inputs: unknown) {
  if (!schema || typeof schema !== "object") return undefined;
  const key = JSON.stringify(schema);
  let validate = validators.get(key);
  try {
    if (!validators.has(key)) {
      if (validators.size >= MAX_SCHEMAS) {
        const oldest = validators.keys().next().value!;
        const previous = validators.get(oldest);
        if (previous) ajv.removeSchema(previous.schema);
        validators.delete(oldest);
      }
      // Cache failure before compiling so malformed schemas never recompile per request.
      validators.set(key, null);
      try {
        validate = ajv.compile(schema);
        validators.set(key, validate);
      } catch (err) {
        logWarn("input-schema-compile-failed", "Capability input schema could not be compiled", { slug, rail });
        return unavailable();
      }
    }
    if (!validate) return unavailable();
    if (validate(inputs)) return undefined;
  } catch (err) {
    validators.set(key, null);
    logWarn("input-schema-compile-failed", "Capability input schema could not be validated", { slug, rail });
    return unavailable();
  }
  // instancePath is a JSON pointer; Ajv message/params may include caller values.
  const paths = [...new Set((validate.errors ?? []).map(e => e.instancePath))];
  logWarn("input-schema-mismatch", "Inputs do not match the capability schema", { slug, rail, paths });
  if (process.env.INPUT_VALIDATION_MODE !== "enforce") return undefined;
  return apiError("invalid_input", "Inputs do not match the capability input schema.", {
    fix: "Check the tool's input_schema in the catalogue and correct the fields at the reported JSON-pointer paths.",
    paths, retryable: false,
  });
}

function unavailable() {
  if (process.env.INPUT_VALIDATION_MODE !== "enforce") return undefined;
  return apiError("capability_unavailable", "The capability input schema is unavailable.", {
    fix: "Try another tool or contact support with the tool slug so its input schema can be repaired.",
    retryable: false,
  });
}
