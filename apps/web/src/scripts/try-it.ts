// "Try it" for free tools: sends the visitor's inputs to POST /v1/do with no key
// and shows the answer. The API accepts browser calls from strale.dev only, so on
// any other origin this reports that plainly instead of failing silently.
const form = document.querySelector<HTMLFormElement>("[data-try]");
if (form) {
  const status = form.querySelector<HTMLElement>("[data-try-status]")!;
  const out = form.querySelector<HTMLElement>("[data-try-output]")!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const field = form.querySelector<HTMLTextAreaElement>("textarea")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (button.getAttribute("aria-disabled") === "true") return;
    let inputs: unknown;
    try {
      inputs = JSON.parse(field.value);
    } catch {
      field.setAttribute("aria-invalid", "true");
      status.textContent = "The inputs are not valid JSON. Fix them and run again.";
      return;
    }
    field.removeAttribute("aria-invalid");
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-busy", "true");
    status.textContent = "Running…";
    out.hidden = true;
    try {
      const res = await fetch(`${form.dataset.api}/v1/do`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capability_slug: form.dataset.slug, inputs }),
      });
      const body = await res.json();
      out.textContent = JSON.stringify(body, null, 2);
      out.hidden = false;
      status.textContent = res.ok ? "Done. Nothing was charged." : `The API answered ${res.status}: ${body?.message ?? "see the response below"}. Nothing was charged.`;
    } catch {
      status.textContent = "This page could not reach the API from your browser. Copy the API call below and run it instead.";
    } finally {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("aria-busy");
    }
  });
}
