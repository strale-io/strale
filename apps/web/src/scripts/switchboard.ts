// Home hero "Switchboard" behaviour. The page is server-rendered with one call complete; this
// draws the circuit lines from measured positions and cycles the example calls.
// - Timing and easing come from the motion tokens (--duration-*, --ease-*), so reduced motion
//   (every duration 0) shows the current call still and never advances on its own; choosing a
//   tool still swaps it.
// - The automatic cycle is silent to screen readers (aria-live="off"); a call the visitor chose is
//   announced. It holds while the pointer or keyboard focus is on a tool, and the Pause button stops
//   it until pressed again (WCAG 2.2.2).
// - From 1280px it fits the board to the space the hero leaves (--_s on the board wrap: the console and
//   tiles scale together) and places each tile's label clear of the console (--_dx on the label).
//   Every line, dot and label is computed in one pass from the same numbers the CSS places the tiles
//   with (a tile's centre is x·width, y·height of the board), so they cannot drift apart; the pass
//   reruns whenever the board field or the console changes size.
// Sets those two custom properties and SVG geometry attributes, and toggles classes; the Web
// Animations it runs are the line draw, the packet, and the progress bar.
interface PortData { slug: string; x: number; y: number; ask: string; input: Record<string, unknown>; out: Record<string, unknown>; src: string; price: string; charged: string }

const NS = "http://www.w3.org/2000/svg";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tint = (o: Record<string, unknown>) =>
  esc(JSON.stringify(o, null, 1).replace(/\n\s*/g, " "))
    .replace(/"([^"]+)":/g, '<span class="tk-p">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="tk-s">"$1"</span>')
    .replace(/: (true|false|[\d.]+)/g, ': <span class="tk-n">$1</span>');

/** Easing function for a CSS cubic-bezier() token, so the packet follows the line's easing. */
function bezier(css: string): (t: number) => number {
  const m = css.match(/cubic-bezier\(([^)]+)\)/);
  if (!m) return (t) => t;
  const [x1, y1, x2, y2] = m[1].split(",").map(Number);
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => {
    let lo = 0, hi = 1;
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (at(x1, x2, mid) < x) lo = mid; else hi = mid; }
    return at(y1, y2, (lo + hi) / 2);
  };
}

for (const root of document.querySelectorAll<HTMLElement>("[data-switchboard]")) {
  const wrap = root.querySelector<HTMLElement>("[data-ports]");
  const board = root.querySelector<HTMLElement>(".sb-board");
  const svg = root.querySelector<SVGSVGElement>(".sb-lines");
  const desk = root.querySelector<HTMLElement>(".sb-desk");
  if (!wrap || !board || !svg || !desk) continue;
  const data = JSON.parse(wrap.dataset.ports ?? "[]") as PortData[];
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-port]"));
  const live = desk.querySelector<HTMLElement>("[data-live]")!;
  const rows = { ask: desk.querySelector<HTMLElement>('[data-row="ask"]')!, call: desk.querySelector<HTMLElement>('[data-row="call"]')!, out: desk.querySelector<HTMLElement>('[data-row="out"]')! };
  const bar = desk.querySelector<HTMLElement>(".sb-progress i")!;
  const pauseBtn = desk.querySelector<HTMLButtonElement>("[data-pause]")!;
  const fPrice = desk.querySelector<HTMLElement>('[data-f="price"]')!;
  const fSrc = desk.querySelector<HTMLElement>('[data-f="src"]')!;

  const css = getComputedStyle(root);
  const ms = (name: string) => {
    const v = css.getPropertyValue(name).trim();
    return v.endsWith("ms") ? parseFloat(v) : v.endsWith("s") ? parseFloat(v) * 1000 : 0;
  };
  const T = { draw: ms("--duration-reveal-signature") * 0.6, step: ms("--duration-slow") * 3, cycle: ms("--duration-ambient") };
  const EASE = css.getPropertyValue("--ease-reveal").trim() || "ease-in-out";

  const mk = (tag: string, attrs: Record<string, string>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return svg.appendChild(e) as SVGGeometryElement;
  };
  const restIn = data.map(() => mk("path", { class: "rest" }));
  const restOut = data.map(() => mk("path", { class: "rest out" }));
  const nodes = data.map(() => mk("circle", { class: "node", r: "3.5" }));
  const wire = mk("path", { class: "live" }) as SVGPathElement;
  const packet = mk("circle", { class: "packet", r: "4", opacity: "0" });
  const tags = buttons.map((b) => b.querySelector<HTMLElement>(".sb-tag"));

  const drawn = () => getComputedStyle(svg).display !== "none";
  const px = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
  // Board units, before scaling: the tile size, the corner radius, the bus offset from the console and the
  // spacing between buses, the clear gap a label keeps from the console, and the design console height.
  const U = { tile: px("--space-48") + px("--space-8"), r: px("--space-12"), bus: px("--space-32") + px("--space-2"), step: px("--space-12") + px("--space-2"), gap: px("--space-12"), pad: px("--space-24"), wide: px("--container-wide") };
  // Where each side's routes enter the console, as fractions of its height, top to bottom.
  const ENTRY = [0.32, 0.5, 0.68];
  let scale = 1;
  let routes: { d: string; out: string; node: [number, number]; rise: number | null }[] = [];

  // Fit: the console and tiles scale with the height the hero leaves for the board, and with the width (so the
  // buses between the inner tiles and the console always fit), between 0.8 and 1.6.
  function fit() {
    const fieldH = wrap!.clientHeight, fieldW = wrap!.clientWidth, deskH = desk!.offsetHeight;
    const s = Math.min((fieldH - 2 * U.pad) / deskH, fieldW / (U.wide + 2 * U.pad));
    scale = Math.round(Math.max(0.8, Math.min(1.6, s)) * 100) / 100;
    wrap!.style.setProperty("--_s", String(scale));
  }
  // Orthogonal route with rounded corners: out of the tile, along to its bus column, up or down, into the console.
  // The dot sits on the route where the run from the tile meets its bus.
  function route(i: number, W: number, H: number, d: { left: number; right: number; top: number; height: number }) {
    const s = scale, R = U.r * s, half = (U.tile * s) / 2;
    const cx = data[i].x * W, cy = data[i].y * H;
    const L = data[i].x < 0.5, k = data.filter((p, j) => (p.x < 0.5) === L && j < i).length, dir = L ? 1 : -1;
    const sx = cx + dir * half, ex = L ? d.left : d.right, ey = d.top + d.height * ENTRY[Math.min(k, ENTRY.length - 1)];
    const bus = ex - dir * (U.bus + k * U.step) * s, v = Math.sign(ey - cy);
    const node: [number, number] = [bus - dir * R, cy];
    // The decorative run outward goes to the edge of the field, not just the board.
    const wb = wrap!.getBoundingClientRect(), bb = board!.getBoundingClientRect();
    const out = `M${cx - dir * half} ${cy} H ${L ? wb.left - bb.left : wb.right - bb.left}`;
    if (Math.abs(ey - cy) < R * 2) return { d: `M${sx} ${cy} H ${ex}`, node, out, rise: null };
    // rise: the x of a route that climbs past the label's height on its way to the console, which the label must not cover.
    return { d: `M${sx} ${cy} H ${bus - dir * R} Q ${bus} ${cy} ${bus} ${cy + v * R} V ${ey - v * R} Q ${bus} ${ey} ${bus + dir * R} ${ey} H ${ex}`, node, out, rise: v < 0 ? bus - dir * R : null };
  }
  // A label sits above its tile, centred on it where it can be, shifted outward just enough to stay clear of
  // the console, of its own route where that climbs past it, and inside the field.
  function placeTag(i: number, W: number, d: { left: number; right: number }) {
    const tag = tags[i];
    if (!tag) return;
    const s = scale, w = tag.offsetWidth * s, cx = data[i].x * W, L = data[i].x < 0.5;
    const bb = board!.getBoundingClientRect(), wb = wrap!.getBoundingClientRect();
    const rise = routes[i]?.rise ?? null;
    let lo = L ? wb.left - bb.left + U.gap : d.right + U.gap * s, hi = L ? d.left - U.gap * s : wb.right - bb.left - U.gap;
    if (rise !== null) { if (L) hi = Math.min(hi, rise - U.gap * s); else lo = Math.max(lo, rise + U.gap * s); }
    const left = Math.min(Math.max(cx - w / 2, lo), hi - w);
    tag.style.setProperty("--_dx", `${(left + w / 2 - cx) / s}px`);
  }
  let cur = Math.max(0, buttons.findIndex((b) => b.classList.contains("on")));
  function setWire(i: number) {
    wire.setAttribute("d", routes[i]?.d ?? "");
    const len = wire.getTotalLength();
    wire.setAttribute("stroke-dasharray", String(len));
    return len;
  }
  function layout() {
    if (!drawn()) { wrap!.style.removeProperty("--_s"); tags.forEach((t) => t?.style.removeProperty("--_dx")); return; }
    fit();
    const b = board!.getBoundingClientRect(), dr = desk!.getBoundingClientRect();
    const W = b.width, H = b.height, d = { left: dr.left - b.left, right: dr.right - b.left, top: dr.top - b.top, height: dr.height };
    routes = data.map((_, i) => route(i, W, H, d));
    routes.forEach((r, i) => {
      restIn[i].setAttribute("d", r.d);
      restOut[i].setAttribute("d", r.out);
      nodes[i].setAttribute("cx", String(r.node[0]));
      nodes[i].setAttribute("cy", String(r.node[1]));
      placeTag(i, W, d);
      nodes[i].classList.toggle("on", i === cur);
    });
    setWire(cur);
  }
  // The field changes with the window; the console with its fonts. Scaling changes neither, so this cannot loop.
  const ro = new ResizeObserver(() => layout());
  ro.observe(wrap);
  ro.observe(desk);

  // Two tokens: a new play cancels the previous play's reveal; a new cycle timer cancels the previous
  // timer. Holding, releasing or scrolling never cancels a reveal that is under way.
  let playTk = 0, cycleTk = 0, held = false, paused = false, visible = true, revealing = false;
  const running = () => T.cycle > 0 && !held && !paused && visible;
  const sleep = (t: number) => new Promise<void>((r) => setTimeout(r, t));
  const show = (row: HTMLElement, html: string) => { row.querySelector("pre")!.innerHTML = html; row.classList.add("show"); };
  const ease = bezier(EASE);

  async function play(i: number, chosen: boolean) {
    const tk = ++playTk;
    ++cycleTk;
    cur = i;
    const p = data[i];
    buttons.forEach((b, j) => { b.classList.toggle("on", j === i); b.setAttribute("aria-pressed", String(j === i)); });
    nodes.forEach((n, j) => n.classList.toggle("on", j === i));
    if (drawn()) {
      const len = setWire(i);
      if (T.draw > 0) {
        wire.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: T.draw, easing: EASE, fill: "forwards" });
        packet.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: T.draw, fill: "forwards" });
        const t0 = performance.now();
        const move = (now: number) => {
          const u = Math.min(1, (now - t0) / T.draw);
          const pt = wire.getPointAtLength(len * ease(u));
          packet.setAttribute("cx", String(pt.x));
          packet.setAttribute("cy", String(pt.y));
          if (u < 1 && tk === playTk) requestAnimationFrame(move);
        };
        requestAnimationFrame(move);
      } else wire.setAttribute("stroke-dashoffset", "0");
    }
    const call = `<span class="tk-s">${esc(p.slug)}</span> · ${esc(p.price)}\n${tint(p.input)}`;
    // Announce only calls the visitor chose; switch the live region on a frame before the first write.
    live.setAttribute("aria-live", chosen ? "polite" : "off");
    await new Promise((r) => requestAnimationFrame(r));
    if (tk !== playTk) return;
    if (T.step === 0) {
      show(rows.ask, esc(p.ask)); show(rows.call, call); show(rows.out, tint(p.out));
      fPrice.textContent = p.charged; fSrc.textContent = p.src;
      return;
    }
    revealing = true;
    Object.values(rows).forEach((r) => { r.classList.remove("show"); r.querySelector("pre")!.textContent = ""; });
    fPrice.textContent = "–"; fSrc.textContent = "–";
    bar.getAnimations().forEach((a) => a.cancel());
    if (T.cycle > 0 && !paused) bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: T.cycle, fill: "forwards" });
    show(rows.ask, esc(p.ask));
    await sleep(T.step);
    if (tk !== playTk) return;
    show(rows.call, call);
    await sleep(T.step);
    if (tk !== playTk) return;
    show(rows.out, tint(p.out));
    fPrice.textContent = p.charged; fSrc.textContent = p.src;
    revealing = false;
    advanceLater(T.cycle - 2 * T.step);
  }
  // Move to the next tool after `after` ms, unless a newer timer, play, hold, pause or scroll intervenes.
  async function advanceLater(after: number) {
    if (T.cycle === 0) return;
    const ck = ++cycleTk;
    await sleep(after);
    if (ck === cycleTk && running()) play((cur + 1) % data.length, false);
  }
  // After a hold, pause or scroll ends: a reveal under way schedules its own next step.
  const resume = () => { if (running() && !revealing) advanceLater(T.cycle / 3); };

  buttons.forEach((b, i) => {
    b.addEventListener("click", () => play(i, true));
    b.addEventListener("focus", () => { if (cur !== i) play(i, true); });
    b.addEventListener("pointerenter", (e) => { if ((e as PointerEvent).pointerType === "mouse" && cur !== i) play(i, true); });
    // Hold the cycle while the pointer is on a tool or keyboard focus is on one.
    b.addEventListener("pointerenter", () => { held = true; });
    b.addEventListener("pointerleave", () => { held = false; resume(); });
    b.addEventListener("focusin", () => { held = true; });
    b.addEventListener("focusout", (e) => { if (!buttons.includes(e.relatedTarget as HTMLButtonElement)) { held = false; resume(); } });
  });

  if (T.cycle > 0) {
    pauseBtn.hidden = false;
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.setAttribute("aria-label", paused ? "Play the example" : "Pause the example");
      pauseBtn.querySelector("use")?.setAttribute("href", paused ? "#i-play" : "#i-pause");
      if (paused) { ++cycleTk; bar.getAnimations().forEach((a) => a.cancel()); }
      else play((cur + 1) % data.length, false);
    });
  }

  // Run only while the hero is on screen; resume where it was.
  new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting;
    if (visible && !was) resume();
  }).observe(root);

  layout();
  if (T.cycle > 0) play(cur, false);
}
