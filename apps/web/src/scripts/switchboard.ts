// Home hero "Switchboard" behaviour. The page is server-rendered with one call complete; this
// draws the circuit lines from measured positions and cycles the example calls. Timing comes
// from the motion tokens (--duration-*), so reduced motion (every duration 0) shows the
// current call still and never advances on its own; choosing a tool still swaps it.
// Sets SVG geometry attributes and toggles classes; never sets style values.
interface PortData { slug: string; x: number; y: number; ask: string; input: Record<string, unknown>; out: Record<string, unknown>; src: string; price: string }

const NS = "http://www.w3.org/2000/svg";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tint = (o: Record<string, unknown>) =>
  esc(JSON.stringify(o, null, 1).replace(/\n\s*/g, " "))
    .replace(/"([^"]+)":/g, '<span class="tk-p">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="tk-s">"$1"</span>')
    .replace(/: (true|false|[\d.]+)/g, ': <span class="tk-n">$1</span>');

for (const root of document.querySelectorAll<HTMLElement>("[data-switchboard]")) {
  const wrap = root.querySelector<HTMLElement>("[data-ports]");
  const board = root.querySelector<HTMLElement>(".sb-board");
  const svg = root.querySelector<SVGSVGElement>(".sb-lines");
  const desk = root.querySelector<HTMLElement>(".sb-desk");
  if (!wrap || !board || !svg || !desk) continue;
  const data = JSON.parse(wrap.dataset.ports ?? "[]") as PortData[];
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-port]"));
  const rows = { ask: desk.querySelector<HTMLElement>('[data-row="ask"]')!, call: desk.querySelector<HTMLElement>('[data-row="call"]')!, out: desk.querySelector<HTMLElement>('[data-row="out"]')! };
  const bar = desk.querySelector<HTMLElement>(".sb-progress i")!;
  const fPrice = desk.querySelector<HTMLElement>('[data-f="price"]')!;
  const fSrc = desk.querySelector<HTMLElement>('[data-f="src"]')!;

  const ms = (name: string) => {
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return v.endsWith("ms") ? parseFloat(v) : v.endsWith("s") ? parseFloat(v) * 1000 : 0;
  };
  const T = { draw: ms("--duration-reveal-signature"), step: ms("--duration-slow") * 3, cycle: ms("--duration-ambient") };

  const mk = (tag: string, attrs: Record<string, string>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return svg.appendChild(e) as SVGGeometryElement;
  };
  const restIn = data.map(() => mk("path", { class: "rest" }));
  const restOut = data.map(() => mk("path", { class: "rest out" }));
  const nodes = data.map(() => mk("circle", { class: "node", r: "3.5" }));
  const live = mk("path", { class: "live" }) as SVGPathElement;
  const packet = mk("circle", { class: "packet", r: "4", opacity: "0" });

  const R = 12;
  const left = (i: number) => data[i].x < 0.5;
  const drawn = () => getComputedStyle(svg).display !== "none";
  // Orthogonal route with rounded corners: out of the port, along to a bus column, up or down, into the console.
  function route(i: number) {
    const b = board!.getBoundingClientRect(), d = desk!.getBoundingClientRect(), btn = buttons[i].getBoundingClientRect();
    const px = btn.left + btn.width / 2 - b.left, py = btn.top + btn.height / 2 - b.top, half = btn.width / 2;
    const L = left(i), k = data.filter((p, j) => (p.x < 0.5) === L && j < i).length;
    const sx = L ? px + half : px - half;
    const ex = (L ? d.left : d.right) - b.left, ey = d.top - b.top + d.height * (0.32 + k * 0.18);
    const bus = L ? ex - 34 - k * 14 : ex + 34 + k * 14, dir = L ? 1 : -1, v = Math.sign(ey - py);
    const out = `M${L ? px - half : px + half} ${py} H ${L ? -40 : b.width + 40}`;
    if (Math.abs(ey - py) < R * 3) return { d: `M${sx} ${py} H ${ex}`, node: [bus, py], out };
    return { d: `M${sx} ${py} H ${bus - dir * R} Q ${bus} ${py} ${bus} ${py + v * R} V ${ey - v * R} Q ${bus} ${ey} ${bus + dir * R} ${ey} H ${ex}`, node: [bus, py], out };
  }
  let cur = buttons.findIndex((b) => b.classList.contains("on"));
  if (cur < 0) cur = 0;
  function layout() {
    if (!drawn()) return;
    data.forEach((_, i) => {
      const r = route(i);
      restIn[i].setAttribute("d", r.d);
      restOut[i].setAttribute("d", r.out);
      nodes[i].setAttribute("cx", String(r.node[0]));
      nodes[i].setAttribute("cy", String(r.node[1]));
      if (i === cur) live.setAttribute("d", r.d);
    });
  }
  new ResizeObserver(layout).observe(board);

  let token = 0, hovering = false, visible = true;
  const wait = (t: number, tk: number) => new Promise<boolean>((r) => setTimeout(() => r(tk === token), t));
  const show = (row: HTMLElement, html: string) => { row.querySelector("pre")!.innerHTML = html; row.classList.add("show"); };

  async function play(i: number, animate = true) {
    const tk = ++token;
    cur = i;
    const p = data[i];
    buttons.forEach((b, j) => { b.classList.toggle("on", j === i); b.setAttribute("aria-pressed", String(j === i)); });
    if (drawn()) {
      const r = route(i);
      live.setAttribute("d", r.d);
      const len = live.getTotalLength();
      live.setAttribute("stroke-dasharray", String(len));
      if (animate && T.draw > 0) {
        live.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: T.draw * 0.6, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" });
        packet.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: T.draw * 0.6, fill: "forwards" });
        const t0 = performance.now();
        const move = (now: number) => {
          const u = Math.min(1, (now - t0) / (T.draw * 0.6));
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          const pt = live.getPointAtLength(len * e);
          packet.setAttribute("cx", String(pt.x));
          packet.setAttribute("cy", String(pt.y));
          if (u < 1 && tk === token) requestAnimationFrame(move);
        };
        requestAnimationFrame(move);
      } else live.setAttribute("stroke-dashoffset", "0");
    }
    const call = `<span class="tk-s">${esc(p.slug)}</span> · ${esc(p.price)}\n${tint(p.input)}`;
    if (!animate || T.step === 0) {
      show(rows.ask, esc(p.ask)); show(rows.call, call); show(rows.out, tint(p.out));
      fPrice.textContent = p.price; fSrc.textContent = p.src;
      return;
    }
    Object.values(rows).forEach((r) => { r.classList.remove("show"); r.querySelector("pre")!.textContent = ""; });
    fPrice.textContent = "–"; fSrc.textContent = "–";
    if (T.cycle > 0) bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: T.cycle, easing: "linear", fill: "forwards" });
    show(rows.ask, esc(p.ask));
    if (!(await wait(T.step, tk))) return;
    show(rows.call, call);
    if (!(await wait(T.step, tk))) return;
    show(rows.out, tint(p.out));
    fPrice.textContent = p.price; fSrc.textContent = p.src;
    if (T.cycle === 0) return;
    if (!(await wait(T.cycle - 2 * T.step, tk))) return;
    if (!hovering && visible) play((i + 1) % data.length);
  }

  buttons.forEach((b, i) => {
    b.addEventListener("pointerenter", (e) => { if ((e as PointerEvent).pointerType !== "mouse") return; hovering = true; if (cur !== i) play(i); });
    b.addEventListener("pointerleave", () => {
      hovering = false;
      const tk = token;
      setTimeout(() => { if (tk === token && !hovering && visible && T.cycle > 0) play((cur + 1) % data.length); }, T.cycle / 3);
    });
    b.addEventListener("focus", () => { if (cur !== i) play(i); });
    b.addEventListener("click", () => play(i));
  });

  // Run only while the hero is on screen; resume where it was.
  new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting;
    if (visible && !was && T.cycle > 0) play(cur);
    if (!visible) token++;
  }).observe(root);

  layout();
  if (T.cycle > 0) play(cur);
}
