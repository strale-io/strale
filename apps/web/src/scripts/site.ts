// Site behaviour: theme switch, disclosures (mobile menu), tabs, copy buttons.
// Adapted from the Open Flow specimen script. Toggles classes and attributes only; never sets style values.
const root = document.documentElement;
const THEME_KEY = "strale-theme";

// Theme: system (no attribute) | light | dark. Stored per viewer; the page works without storage.
function applyTheme(choice: string | null) {
  if (choice === "light" || choice === "dark") root.setAttribute("data-theme", choice);
  else root.removeAttribute("data-theme");
  document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === (choice || "system"))));
  try {
    if (choice === "light" || choice === "dark") localStorage.setItem(THEME_KEY, choice);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}
applyTheme(root.getAttribute("data-theme"));
document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.themeChoice ?? null)));

// Disclosures: Escape closes and returns focus; an outside click closes.
const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-disclosure]"));
function setOpen(t: HTMLButtonElement, open: boolean) {
  const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
  t.setAttribute("aria-expanded", String(open));
  if (panel) panel.hidden = !open;
  const label = t.querySelector("[data-label]");
  if (label) label.textContent = open ? "Close" : "Menu";
}
triggers.forEach((t) => t.addEventListener("click", (e) => { e.stopPropagation(); setOpen(t, t.getAttribute("aria-expanded") !== "true"); }));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  triggers.forEach((t) => { if (t.getAttribute("aria-expanded") === "true") { setOpen(t, false); t.focus(); } });
});
document.addEventListener("click", (e) => {
  triggers.forEach((t) => {
    const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
    if (t.getAttribute("aria-expanded") === "true" && panel && !panel.contains(e.target as Node)) setOpen(t, false);
  });
});

// Tabs: roving tabindex, arrow keys, Home and End.
document.querySelectorAll<HTMLElement>("[data-tabs]").forEach((group) => {
  const tabs = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter((t) => !t.disabled);
  const select = (tab: HTMLButtonElement) => tabs.forEach((t) => {
    const on = t === tab;
    const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (panel) panel.hidden = !on;
  });
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const n = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key];
      if (n === undefined) return;
      e.preventDefault();
      const next = tabs[(n + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
});

// Copy: confirm in words (or say it failed), announce through a status region, then reset.
document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((b) => {
  b.addEventListener("click", () => {
    const block = b.closest(".code");
    if (!block) return;
    const status = block.querySelector("[data-copy-status]");
    const pre = block.querySelector('[role="tabpanel"]:not([hidden]) pre') ?? block.querySelector("pre");
    const label = b.querySelector("span");
    const icon = b.querySelector("use");
    const finish = (ok: boolean) => {
      b.classList.toggle("is-copied", ok);
      if (label) label.textContent = ok ? "Copied" : "Copy failed";
      icon?.setAttribute("href", ok ? "#i-check" : "#i-error");
      if (status) status.textContent = ok ? "Code copied to clipboard" : "Could not copy; select the code and copy it manually";
      setTimeout(() => {
        b.classList.remove("is-copied");
        if (label) label.textContent = "Copy";
        icon?.setAttribute("href", "#i-copy");
        if (status) status.textContent = "";
      }, 1800);
    };
    try {
      navigator.clipboard.writeText(pre?.textContent ?? "").then(() => finish(true), () => finish(false));
    } catch {
      finish(false);
    }
  });
});
