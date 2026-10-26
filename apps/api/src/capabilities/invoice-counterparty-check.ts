import { registerCapability, getExecutor } from "./index.js";
import { isCircuitOpen } from "../lib/composite-breaker.js";
import { runInvoiceCounterpartyCheck } from "../lib/invoice-counterparty/compose.js";

// Underlying getExecutor calls do not bill or record breaker outcomes; the
// invoked slug alone is billed by routes/do.ts, only after successful execution.
registerCapability("invoice-counterparty-check", (input) =>
  runInvoiceCounterpartyCheck(input, { getExecutor, isCircuitOpen, now: () => new Date() }),
);
