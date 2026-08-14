/**
 * Re-export shim: the canonical internal-account exclusion list lives in
 * src/lib/internal-accounts.ts (runtime consumers — quality floor — need it,
 * and scripts can import src but not vice versa). Update THAT file.
 */
export { EXCLUDED_INTERNAL_EMAILS, EXCLUDED_INTERNAL_EMAILS as EXCLUDED_EMAILS } from "../../src/lib/internal-accounts.js";
