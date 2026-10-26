// Home hero "Switchboard" behaviour. The page is server-rendered with one call complete; this
// draws the circuit lines from measured positions and cycles the example calls.
// - Timing and easing come from the motion tokens (--duration-*, --ease-*), so reduced motion
//   (every duration 0) shows the current call still and never advances on its own; choosing a
//   tool still swaps it.
// - The automatic cycle is silent to screen readers (aria-live="off"); a call the visitor chose is
//   announced. It holds while the pointer or keyboard focus is on a tool, and the Pause button stops
//   it until pressed again (WCAG 2.2.2).
// Sets SVG geometry attributes and toggles classes; the Web Animations it runs are the line draw,
// the packet, and the progress bar.
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

  const R = 12;
  const drawn = () => getComputedStyle(svg).display !== "none";
  // Orthogonal route with rounded corners: out of the port, along to a bus column, up or down, into the console.
  function route(i: number) {
    const b = board!.getBoundingClientRect(), d = desk!.getBoundingClientRect(), btn = buttons[i].getBoundingClientRect();
    const px = btn.left + btn.width / 2 - b.left, py = btn.top + btn.height / 2 - b.top, half = btn.width / 2;
    const L = data[i].x < 0.5, k = data.filter((p, j) => (p.x < 0.5) === L && j < i).length;
    const sx = L ? px + half : px - half;
    const ex = (L ? d.left : d.right) - b.left, ey = d.top - b.top + d.height * (0.32 + k * 0.18);
    const bus = L ? ex - 34 - k * 14 : ex + 34 + k * 14, dir = L ? 1 : -1, v = Math.sign(ey - py);
    const out = `M${L ? px - half : px + half} ${py} H ${L ? -40 : b.width + 40}`;
    if (Math.abs(ey - py) < R * 3) return { d: `M${sx} ${py} H ${ex}`, node: [bus, py], out };
    return { d: `M${sx} ${py} H ${bus - dir * R} Q ${bus} ${py} ${bus} ${py + v * R} V ${ey - v * R} Q ${bus} ${ey} ${bus + dir * R} ${ey} H ${ex}`, node: [bus, py], out };
  }
  let cur = Math.max(0, buttons.findIndex((b) => b.classList.contains("on")));
  function setWire(i: number) {
    wire.setAttribute("d", route(i).d);
    const len = wire.getTotalLength();
    wire.setAttribute("stroke-dasharray", String(len));
    return len;
  }
  function layout() {
    if (!drawn()) return;
    data.forEach((_, i) => {
      const r = route(i);
      restIn[i].setAttribute("d", r.d);
      restOut[i].setAttribute("d", r.out);
      nodes[i].setAttribute("cx", String(r.node[0]));
      nodes[i].setAttribute("cy", String(r.node[1]));
    });
    setWire(cur);
  }
  new ResizeObserver(layout).observe(board);

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
