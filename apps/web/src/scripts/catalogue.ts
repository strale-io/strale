// Catalogue filtering: search words, one job group, free/x402 toggles and a country.
// Reads and writes the query string so a filtered view can be linked (/tools?job=web&free=1).
// Toggles hidden and attributes only.
const root = document.querySelector<HTMLElement>("[data-catalogue]");
if (root) {
  const form = root.querySelector<HTMLFormElement>("[data-catalogue-form]")!;
  const q = form.querySelector<HTMLInputElement>("#q")!;
  const country = form.querySelector<HTMLSelectElement>("#country")!;
  const free = form.querySelector<HTMLInputElement>('input[name="free"]')!;
  const x402 = form.querySelector<HTMLInputElement>('input[name="x402"]')!;
  const chips = Array.from(form.querySelectorAll<HTMLButtonElement>("[data-job]"));
  const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-list] > li"));
  const count = root.querySelector<HTMLElement>("[data-count]")!;
  const empty = root.querySelector<HTMLElement>("[data-empty]")!;
  let job = "";

  const params = new URLSearchParams(location.search);
  q.value = params.get("q") ?? "";
  job = params.get("job") ?? "";
  free.checked = params.get("free") === "1";
  x402.checked = params.get("x402") === "1";
  country.value = params.get("country") ?? "";
  if (!chips.some((c) => c.dataset.job === job)) job = "";

  function apply() {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    for (const r of rows) {
      const ok =
        (!job || r.dataset.job === job) &&
        (!free.checked || r.dataset.free === "1") &&
        (!x402.checked || r.dataset.x402 === "1") &&
        (!country.value || r.dataset.country === country.value) &&
        words.every((w) => (r.dataset.search ?? "").includes(w));
      r.hidden = !ok;
      if (ok) n++;
    }
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.job === job)));
    count.textContent = `${n.toLocaleString("en-GB")} ${n === 1 ? "tool" : "tools"}${n === rows.length ? "" : ` of ${rows.length.toLocaleString("en-GB")}`}`;
    empty.hidden = n > 0;
    const next = new URLSearchParams();
    if (q.value.trim()) next.set("q", q.value.trim());
    if (job) next.set("job", job);
    if (free.checked) next.set("free", "1");
    if (x402.checked) next.set("x402", "1");
    if (country.value) next.set("country", country.value);
    const qs = next.toString();
    history.replaceState(null, "", qs ? `?${qs}${location.hash}` : `${location.pathname}${location.hash}`);
  }

  chips.forEach((c) => c.addEventListener("click", () => { job = c.dataset.job ?? ""; apply(); }));
  [free, x402, country].forEach((el) => el.addEventListener("change", apply));
  q.addEventListener("input", apply);
  form.addEventListener("submit", (e) => { e.preventDefault(); apply(); });
  root.querySelector("[data-clear]")?.addEventListener("click", () => {
    q.value = ""; job = ""; free.checked = false; x402.checked = false; country.value = "";
    apply();
    q.focus();
  });
  apply();
}
