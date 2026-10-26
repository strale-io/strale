// Site behaviour: theme switch, disclosures (mobile menu), tabs, copy buttons.
// Adapted from the Open Flow specimen script. Toggles classes and attributes; the only style values it sets
// are the pointer-position custom properties at the end of this file.
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

// Pointer micro-interactions (DEC-20261025-A). They set only component-local custom
// properties (--_mx/--_my, --_sx/--_sy) that site.css turns into motion; fine pointers
// only, and none under reduced motion.
const finePointer = matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
if (finePointer) {
  // Magnetic buttons lean a little towards the pointer.
  // The lean is at most --space-4 each way.
  const reach = 2 * (parseFloat(getComputedStyle(root).getPropertyValue("--space-4")) || 0);
  document.querySelectorAll<HTMLElement>("[data-magnet]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--_mx", `${((e.clientX - r.left) / r.width - 0.5) * reach}px`);
      el.style.setProperty("--_my", `${((e.clientY - r.top) / r.height - 0.5) * reach}px`);
    });
    el.addEventListener("pointerleave", () => { el.style.removeProperty("--_mx"); el.style.removeProperty("--_my"); });
  });
  // Cards light up where the pointer is.
  document.addEventListener("pointermove", (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>(".card-link, [data-spotlight]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--_sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--_sy", `${e.clientY - r.top}px`);
  }, { passive: true });
}

// Scroll reveals. Content is visible without script; only blocks that start below the fold wait,
// then rise in once as they arrive, siblings in a [data-reveal-group] a beat apart. Never under
// reduced motion. Timing and distance come from the motion and spacing tokens.
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!calm && "IntersectionObserver" in window) {
  const css = getComputedStyle(root);
  const ms = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
  const rise = `${ms("--space-24")}px`;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      io.unobserve(el);
      el.classList.remove("is-pending");
      el.animate([{ opacity: 0, translate: `0 ${rise}` }, { opacity: 1, translate: "0 0" }], {
        duration: 2 * ms("--duration-slow"),
        delay: Number(el.dataset.revealIndex ?? 0) * ms("--duration-fast"),
        easing: css.getPropertyValue("--ease-enter").trim() || "ease-out",
      });
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll<HTMLElement>("[data-reveal], [data-reveal-group] > *").forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) return;
    const group = el.parentElement?.hasAttribute("data-reveal-group") ? el.parentElement : null;
    if (group) el.dataset.revealIndex = String(Math.min(3, [...group.children].indexOf(el)));
    el.classList.add("is-pending");
    io.observe(el);
  });
}

// The bar turns translucent with a shadow once the page has scrolled under it.
const nav = document.querySelector<HTMLElement>(".site-nav");
if (nav) {
  const mark = () => nav.toggleAttribute("data-scrolled", scrollY > 4);
  mark();
  addEventListener("scroll", mark, { passive: true });
}

export {};
