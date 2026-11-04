// Catalogue filtering: search words, one job group, free/x402 toggles and a country.
// Reads and writes the query string so a filtered view can be linked (/tools?job=web&free=1).
// With no filter, each job group opens at its first few tools behind a "Show all" button; any
// filter shows every match. Toggles hidden and attributes only.
const root = document.querySelector<HTMLElement>("[data-catalogue]");
if (root) {
  const form = root.querySelector<HTMLFormElement>("[data-catalogue-form]")!;
  const q = form.querySelector<HTMLInputElement>("#q")!;
  const country = form.querySelector<HTMLSelectElement>("#country")!;
  const free = form.querySelector<HTMLInputElement>('input[name="free"]')!;
  const x402 = form.querySelector<HTMLInputElement>('input[name="x402"]')!;
  const jobs = Array.from(form.querySelectorAll<HTMLButtonElement>("[data-job]"));
  const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));
  const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-list] > li"));
  const count = root.querySelector<HTMLElement>("[data-count]")!;
  const empty = root.querySelector<HTMLElement>("[data-empty]")!;
  const clear = root.querySelector<HTMLButtonElement>("[data-clear]")!;
  const opened = new Set<string>();
  let job = "";

  const params = new URLSearchParams(location.search);
  q.value = params.get("q") ?? "";
  job = params.get("job") ?? "";
  free.checked = params.get("free") === "1";
  x402.checked = params.get("x402") === "1";
  country.value = params.get("country") ?? "";
  if (!jobs.some((c) => c.dataset.job === job)) job = "";

  function apply() {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtering = words.length > 0 || !!job || free.checked || x402.checked || !!country.value;
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
    for (const g of groups) {
      const shown = g.querySelectorAll("[data-list] > li:not([hidden])").length;
      g.hidden = shown === 0;
      const collapse = !filtering && !opened.has(g.dataset.group!);
      g.toggleAttribute("data-collapsed", collapse);
      const more = g.querySelector<HTMLButtonElement>("[data-more]");
      if (more) more.hidden = !collapse;
    }
    jobs.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.job === job)));
    count.textContent = `${n.toLocaleString("en-GB")} ${n === 1 ? "tool" : "tools"}${n === rows.length ? "" : ` of ${rows.length.toLocaleString("en-GB")}`}`;
    empty.hidden = n > 0;
    clear.hidden = !filtering;
    const next = new URLSearchParams();
    if (q.value.trim()) next.set("q", q.value.trim());
    if (job) next.set("job", job);
    if (free.checked) next.set("free", "1");
    if (x402.checked) next.set("x402", "1");
    if (country.value) next.set("country", country.value);
    const qs = next.toString();
    history.replaceState(null, "", qs ? `?${qs}${location.hash}` : `${location.pathname}${location.hash}`);
  }

  jobs.forEach((c) => c.addEventListener("click", () => { job = c.dataset.job ?? ""; apply(); }));
  groups.forEach((g) => g.querySelector("[data-more]")?.addEventListener("click", () => {
    opened.add(g.dataset.group!);
    apply();
    // Keep focus in the group: the first tool that was hidden.
    g.querySelector<HTMLElement>("[data-extra] a")?.focus();
  }));
  [free, x402, country].forEach((el) => el.addEventListener("change", apply));
  let timer: ReturnType<typeof setTimeout> | undefined;
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 250);
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); apply(); });
  clear.addEventListener("click", () => {
    q.value = ""; job = ""; free.checked = false; x402.checked = false; country.value = "";
    apply();
    q.focus();
  });
  apply();
}

export {};
