import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { computeQualityProfile } from "../src/lib/quality-profile.js";
import { computeReliabilityProfile } from "../src/lib/reliability-profile.js";
import { computeMatrixSQS } from "../src/lib/sqs-matrix.js";

console.log("Local timezone:", Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log("TZ env:", process.env.TZ);

const qp = await computeQualityProfile("iban-validate");
const rp = await computeReliabilityProfile("iban-validate");
const matrix = computeMatrixSQS(qp, rp);

console.log("QP:", qp.grade, "score:", qp.score, "pending:", qp.pending, "runs:", qp.runs_analyzed);
console.log("QP factors has_data:", Object.entries(qp.factors).map(([k, v]) => k + ":" + (v as any).has_data).join(", "));
console.log("RP:", rp.grade, "score:", rp.score, "pending:", rp.pending, "runs:", rp.runs_analyzed);
console.log("RP factors has_data:", Object.entries(rp.factors).map(([k, v]) => k + ":" + (v as any).has_data).join(", "));
console.log("Matrix:", matrix.score, matrix.label, "pending:", matrix.pending);

process.exit(0);
