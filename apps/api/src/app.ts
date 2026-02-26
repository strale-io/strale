import { Hono } from "hono";
import { logger } from "hono/logger";
import { versionMiddleware } from "./lib/versioning.js";
import { doRoute } from "./routes/do.js";
import { capabilitiesRoute } from "./routes/capabilities.js";
import { walletRoute } from "./routes/wallet.js";
import { transactionsRoute } from "./routes/transactions.js";
import { authRoute } from "./routes/auth.js";
import { webhookRoute } from "./routes/webhook.js";

// Register capability executors (side-effect imports)
import "./capabilities/vat-validate.js";
import "./capabilities/swedish-company-data.js";
import "./capabilities/invoice-extract.js";
import "./capabilities/web-extract.js";
import "./capabilities/annual-report-extract.js";
import "./capabilities/norwegian-company-data.js";
import "./capabilities/danish-company-data.js";
import "./capabilities/finnish-company-data.js";
import "./capabilities/iban-validate.js";
import "./capabilities/pii-redact.js";
import "./capabilities/pdf-extract.js";
import "./capabilities/company-enrich.js";
import "./capabilities/ted-procurement.js";
// ─── EU company registries ──────────────────────────────────────────────────
import "./capabilities/uk-company-data.js";
import "./capabilities/dutch-company-data.js";
import "./capabilities/german-company-data.js";
import "./capabilities/french-company-data.js";
import "./capabilities/belgian-company-data.js";
import "./capabilities/austrian-company-data.js";
import "./capabilities/irish-company-data.js";
import "./capabilities/polish-company-data.js";
import "./capabilities/estonian-company-data.js";
import "./capabilities/latvian-company-data.js";
import "./capabilities/lithuanian-company-data.js";
import "./capabilities/swiss-company-data.js";
import "./capabilities/spanish-company-data.js";
import "./capabilities/italian-company-data.js";
import "./capabilities/portuguese-company-data.js";
// ─── Validation / compliance utilities ──────────────────────────────────────
import "./capabilities/swift-validate.js";
import "./capabilities/lei-lookup.js";
import "./capabilities/eori-validate.js";
import "./capabilities/email-validate.js";
import "./capabilities/vat-format-validate.js";
import "./capabilities/isbn-validate.js";
import "./capabilities/company-id-detect.js";

export const app = new Hono();

app.use("*", logger());
app.use("*", versionMiddleware());

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Stripe webhook — must be before any body-parsing middleware
// Needs raw body for signature verification
app.route("/webhooks", webhookRoute);

// API v1 routes
app.route("/v1", doRoute);
app.route("/v1/capabilities", capabilitiesRoute);
app.route("/v1/wallet", walletRoute);
app.route("/v1/transactions", transactionsRoute);
app.route("/v1/auth", authRoute);
