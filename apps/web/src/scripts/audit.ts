// /audit/:transactionId: fetch one compliance record from the API and fill the page
// (strale-frontend's AuditRecord.tsx). The id comes from the address; the token stays in the
// address and is only ever sent to the Strale API.
import { auditOutcome, auditRequestUrl, entityPath, parseAuditLocation, type AuditRecord, type AuditStep } from "../lib/audit-record.ts";

const root = document.querySelector<HTMLElement>("[data-audit]");
if (root) {
  const api = root.dataset.api!;
  const loc = parseAuditLocation(location.pathname, location.search);

  const show = (name: string, body?: string | null) => {
    root.querySelectorAll<HTMLElement>("[data-state]").forEach((el) => (el.hidden = el.dataset.state !== name));
    if (body) {
      const p = root.querySelector<HTMLElement>(`[data-state="${name}"] [data-state-body]`);
      if (p) p.textContent = body;
    }
  };
  const fill = (field: string, text: string) => root.querySelectorAll<HTMLElement>(`[data-f="${field}"]`).forEach((el) => (el.textContent = text));
  const cell = (row: Element, name: string) => row.querySelector<HTMLElement>(`[data-c="${name}"]`)!;
  const latency = (s: AuditStep) => (typeof s.latency_ms === "number" ? `${s.latency_ms}ms` : "—");
  const pad = (n: number) => String(n).padStart(2, "0");
  const icon = (id: string, cls = "icon icon-sm") => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", cls);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", id);
    svg.append(use);
    return svg;
  };
  const tag = (text: string, cls: string) => {
    const t = document.createElement("span");
    t.className = `tag ${cls}`;
    t.textContent = text;
    return t;
  };

  function render(audit: AuditRecord) {
    const isCapability = audit.type === "capability";
    const entityLabel = isCapability ? "Capability" : "Solution";
    const aiStepCount = audit.steps.filter((s) => s.transparency === "llm_assisted").length;
    const algorithmicCount = audit.steps.length - aiStepCount;
    document.title = `Compliance Record — ${audit.transaction_id} · Strale`;

    fill("transaction_id", audit.transaction_id);
    fill("timestamp", audit.timestamp_start.replace("T", " ").replace("Z", " UTC"));
    fill("input_fingerprint", audit.input_fingerprint);
    fill("entity_label", entityLabel);
    const link = root!.querySelector<HTMLAnchorElement>('[data-f="entity_link"]')!;
    link.textContent = audit.entity_name;
    link.href = entityPath(audit);
    fill("steps_label", isCapability ? "Step" : "Steps executed");
    fill("total_steps", String(audit.total_steps));
    fill("latency", `${audit.latency_s}s`);
    fill("jurisdiction", audit.jurisdiction);
    fill("processing_location", audit.processing_location);
    fill("result", isCapability ? "Completed" : "All steps completed");

    // § 2 Data provenance: one card for a single tool, a table for a bundled check.
    root!.querySelector<HTMLElement>("[data-provenance-single]")!.hidden = !isCapability;
    root!.querySelector<HTMLElement>("[data-provenance-table]")!.hidden = isCapability;
    if (isCapability) {
      const step = audit.steps[0];
      fill("step_capability", step.capability);
      fill("step_source", step.data_source);
      const badge = root!.querySelector<HTMLElement>('[data-f="step_badge"]')!;
      const llm = step.transparency === "llm_assisted";
      badge.className = `tag ${llm ? "badge-warning" : "badge-success"}`;
      badge.textContent = llm ? "LLM" : "Deterministic";
      fill("step_classification", step.classification);
      fill("step_latency", latency(step));
      fill("step_schema", "Valid");
      fill("step_description", step.transparency_description);
    } else {
      const tpl = document.querySelector<HTMLTemplateElement>("#step-row")!;
      root!.querySelector("[data-steps]")!.replaceChildren(
        ...audit.steps.map((step) => {
          const tr = (tpl.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
          cell(tr, "n").textContent = pad(step.step);
          cell(tr, "capability").textContent = step.capability;
          cell(tr, "source-narrow").textContent = step.data_source;
          const src = cell(tr, "source");
          if (step.data_source_url) {
            const a = document.createElement("a");
            a.className = "link";
            a.href = step.data_source_url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = step.data_source;
            src.append(a);
          } else {
            src.textContent = step.data_source;
          }
          cell(tr, "classification").textContent = step.classification;
          if (step.transparency === "llm_assisted") cell(tr, "ai").append(tag("LLM", "badge-warning"));
          else cell(tr, "ai").append(icon("#i-minus", "icon icon-sm muted"));
          cell(tr, "latency").textContent = latency(step);
          // Branches on the real field: a failed schema shows a cross, not a tick (cert-audit RED-3).
          const schema = icon(step.schema_valid ? "#i-check" : "#i-x", `icon icon-sm ${step.schema_valid ? "ok" : "bad"}`);
          schema.setAttribute("aria-hidden", "false");
          schema.setAttribute("role", "img");
          schema.setAttribute("aria-label", step.schema_valid ? "Valid" : "Invalid");
          cell(tr, "schema").append(schema);
          return tr;
        }),
      );
    }

    // § 3 AI transparency.
    root!.querySelector<HTMLElement>("[data-ai-single]")!.hidden = !isCapability;
    root!.querySelector<HTMLElement>("[data-ai-multi]")!.hidden = isCapability;
    if (isCapability) {
      fill("ai_single_title", aiStepCount > 0 ? "This capability uses AI (LLM-assisted)" : "This capability is fully deterministic");
      fill("ai_single_desc", audit.steps[0].transparency_description);
    } else {
      root!.querySelector<HTMLElement>("[data-ratio-ai]")!.style.flexGrow = String(aiStepCount);
      root!.querySelector<HTMLElement>("[data-ratio-algo]")!.style.flexGrow = String(algorithmicCount);
      fill("ai_ratio", `${aiStepCount} of ${audit.total_steps} steps used AI`);
      const tpl = document.querySelector<HTMLTemplateElement>("#ai-step")!;
      root!.querySelector("[data-ai-steps]")!.replaceChildren(
        ...audit.steps.map((step) => {
          const li = (tpl.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
          cell(li, "n").textContent = pad(step.step);
          const llm = step.transparency === "llm_assisted";
          li.querySelector("svg")!.setAttribute("class", `icon icon-sm ${llm ? "warn" : "ok"}`);
          cell(li, "capability").textContent = step.capability;
          cell(li, "desc").textContent = ` — ${step.transparency_description}`;
          return li;
        }),
      );
    }

    // § 5 Data governance: personal data as the record declares it.
    fill(
      "personal_data",
      audit.personal_data_processed ? `Yes${audit.personal_data_categories?.length ? ` — ${audit.personal_data_categories.join(", ")}` : ""}` : "No",
    );

    // § 6 Schema validation.
    const schema = root!.querySelector<HTMLElement>('[data-f="schema"]')!;
    schema.classList.toggle("is-ok", audit.schema_validated);
    schema.classList.toggle("is-off", !audit.schema_validated);
    schema.querySelector("span")!.textContent = audit.schema_validated ? `${audit.schema_steps_passed}/${audit.total_steps} passed` : "Not validated";

    fill("generated", `Record ${audit.transaction_id} · Generated ${new Date().toISOString()}`);
    show("record");
  }

  // Copy URL (the address as shown, token included, as before) and print to PDF.
  const copyBtn = root.querySelector<HTMLButtonElement>("[data-copy-url]")!;
  const copyStatus = root.querySelector<HTMLElement>("[data-copy-status]")!;
  copyBtn.addEventListener("click", async () => {
    const label = copyBtn.querySelector("span")!;
    const use = copyBtn.querySelector("use")!;
    try {
      await navigator.clipboard.writeText(location.href);
      label.textContent = "Copied";
      use.setAttribute("href", "#i-check");
      copyStatus.textContent = "Link copied to clipboard";
    } catch {
      label.textContent = "Copy failed";
      copyStatus.textContent = "Could not copy; copy the address from the address bar";
    }
    setTimeout(() => {
      label.textContent = "Copy URL";
      use.setAttribute("href", "#i-copy");
      copyStatus.textContent = "";
    }, 2000);
  });
  root.querySelector<HTMLButtonElement>("[data-print]")!.addEventListener("click", () => window.print());

  if (!loc.token) {
    show("no-token");
  } else if (!loc.id) {
    show("not-found");
  } else {
    fetch(auditRequestUrl(api, loc))
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        const outcome = auditOutcome(res.status, body);
        if (outcome.kind === "record") render(outcome.audit);
        else if (outcome.kind === "expired") show("expired", outcome.message);
        else show(outcome.kind);
      })
      .catch(() => show("not-found"));
  }
}

export {};
