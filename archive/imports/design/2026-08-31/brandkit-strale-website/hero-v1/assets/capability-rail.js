(() => {
  const section = document.querySelector(".capability-stories");
  const track = section?.querySelector(".capability-track");
  const sourceSet = section?.querySelector(".capability-set");
  const viewport = section?.querySelector(".capability-viewport");
  const toggle = section?.querySelector(".capability-motion-toggle");
  const toggleLabel = toggle?.querySelector(".capability-motion-toggle-label");
  if (!section || !track || !sourceSet || !viewport || !toggle || !toggleLabel) return;

  const queryParams = new URLSearchParams(window.location.search);
  const prototypeMode = queryParams.get("capabilityLayout") !== "legacy";
  section.classList.toggle("capability-stories--prototype", prototypeMode);

  // Mix categories into an editorial reading order. The cards share a quiet
  // frame and a small set of product primitives, while every capability gets
  // an illustration composed for the job it actually performs.
  const editorialOrder = [
    0, 1, 2, 3, 4, 8,
    6, 12, 11, 24, 18, 13,
    20, 21, 7, 17, 14, 22,
    9, 19, 25, 26, 23, 16,
    27, 28, 5, 15, 10, 29,
  ];
  const sourceCards = Array.from(sourceSet.children);

  const surfaceClasses = [
    "capability-story--mulberry",
    "capability-story--cobalt",
    "capability-story--mineral",
    "capability-story--dusk",
    "capability-story--midnight",
    "capability-story--frost",
    "capability-story--mint",
    "capability-story--warm",
  ];

  // Raster illustrations are deliberately kept separate from the card shell.
  // HTML owns the heading, category and slug; the image owns only the visual
  // explanation. This keeps every card typographically exact and responsive.
  const generatedAssets = {
    "google-search": "assets/capability-illustrations/v2/google-search.png",
    "google-news-search": "assets/capability-illustrations/v2/google-news-search.png",
    "company-news": "assets/capability-illustrations/v2/company-news.png",
    "patent-search": "assets/capability-illustrations/v2/patent-search.png",
    "job-board-search": "assets/capability-illustrations/v2/job-board-search.png",
    "eu-regulation-search": "assets/capability-illustrations/eu-regulation-search.webp",
    "swedish-company-data": "assets/capability-illustrations/swedish-company-data.webp",
    "uk-company-data": "assets/capability-illustrations/uk-company-data.webp",
    "us-company-data": "assets/capability-illustrations/v2/us-company-data.png",
    "beneficial-ownership-lookup": "assets/capability-illustrations/beneficial-ownership-lookup.webp",
    "officer-search": "assets/capability-illustrations/officer-search.webp",
    "company-enrich": "assets/capability-illustrations/company-enrich.webp",
    "email-validate": "assets/capability-illustrations/email-validate.webp",
    "phone-validate": "assets/capability-illustrations/phone-validate.webp",
  };

  // Generated canvases contain different amounts of transparent breathing
  // room. Normalize their *visible* mass here so every illustration occupies
  // the same optical bay without baking card-coloured backplates into images.
  const generatedAssetScales = {
    "google-search": 1.16,
    "google-news-search": 1.08,
    "company-news": 1.02,
    "patent-search": 1.12,
    "job-board-search": 1.11,
    "us-company-data": 1.02,
  };

  const illustrations = {
    "google-search": {
      label: "Live web search", icon: "#pi-globe", tone: "cobalt",
      body: `<div class="viz-query">Stripe payment processing</div><div class="viz-results"><div><strong>stripe.com</strong><span>Official site</span></div><div><strong>docs.stripe.com</strong><span>Documentation</span></div><div><strong>7 results</strong><span>0.8s</span></div></div>`,
    },
    "google-news-search": {
      label: "Company news search", icon: "#pi-file", tone: "mineral",
      body: `<div class="viz-query">Company + topic</div><div class="viz-feed"><div><strong>Bloomberg</strong><span>2h ago</span></div><div><strong>Reuters</strong><span>5h ago</span></div><div><strong>Financial Times</strong><span>1d ago</span></div></div>`,
    },
    "company-news": {
      label: "Coverage monitor", icon: "#pi-file", tone: "violet",
      body: `<div class="viz-timeline"><div><i></i><strong>Product launch</strong><span>Today · 4 sources</span></div><div><i></i><strong>Funding mention</strong><span>Yesterday · 2 sources</span></div><div><i></i><strong>Market update</strong><span>12 Aug · grouped</span></div></div>`,
    },
    "patent-search": {
      label: "Patent search", icon: "#pi-file", tone: "cobalt",
      body: `<div class="viz-doc-stack"><article><span>EP</span><strong>4 281 024</strong><small>AI inference routing</small></article><article><span>WO</span><strong>2026 / 18422</strong><small>Acme AB · Pending</small></article></div>`,
    },
    "job-board-search": {
      label: "Open-role search", icon: "#pi-user", tone: "coral",
      body: `<div class="viz-feed viz-feed--cards"><div><strong>Data engineer</strong><span>Stockholm · LinkedIn</span></div><div><strong>Compliance lead</strong><span>London · Greenhouse</span></div><div><strong>ML platform</strong><span>Remote · Lever</span></div></div>`,
    },
    "eu-regulation-search": {
      label: "EU regulation", icon: "#pi-file", tone: "violet",
      body: `<div class="viz-document"><span>REGULATION (EU)</span><strong>2024 / 1689</strong><p>Artificial Intelligence Act</p><div><em>In force</em><small>CELEX 32024R1689</small></div></div>`,
    },
    "swedish-company-data": {
      label: "Swedish company data", icon: "#pi-building", tone: "cobalt",
      body: `<div class="viz-record"><b>SE</b><div><strong>Acme AB</strong><span>556703-7485</span></div></div><div class="viz-facts"><div><span>Status</span><strong>Active</strong></div><div><span>Type</span><strong>AB</strong></div><div><span>Source</span><strong>Bolagsverket</strong></div></div>`,
    },
    "uk-company-data": {
      label: "UK company data", icon: "#pi-building", tone: "violet",
      body: `<div class="viz-record"><b>UK</b><div><strong>ACME LIMITED</strong><span>Company no. 11882214</span></div></div><div class="viz-facts"><div><span>Standing</span><strong>Active</strong></div><div><span>Filed</span><strong>Current</strong></div><div><span>Office</span><strong>London</strong></div></div>`,
    },
    "us-company-data": {
      label: "US company data", icon: "#pi-building", tone: "navy",
      body: `<div class="viz-record"><b>US</b><div><strong>Acme, Inc.</strong><span>Delaware · 7281941</span></div></div><div class="viz-facts"><div><span>Entity</span><strong>Matched</strong></div><div><span>State</span><strong>Good standing</strong></div><div><span>Registry</span><strong>Official</strong></div></div>`,
    },
    "beneficial-ownership-lookup": {
      label: "Ownership lookup", icon: "#pi-network", tone: "mineral",
      body: `<div class="viz-network"><div class="viz-node viz-node--root">Acme AB</div><div class="viz-branches"><div><i>62%</i><strong>J. Andersson</strong></div><div><i>38%</i><strong>North HoldCo</strong></div></div></div><div class="viz-caption"><span>Control resolved</span><strong>2 owners</strong></div>`,
    },
    "officer-search": {
      label: "Company officers", icon: "#pi-user", tone: "coral",
      body: `<div class="viz-people"><div><i>JA</i><span><strong>J. Andersson</strong><small>Director · Active</small></span></div><div><i>EL</i><span><strong>E. Lind</strong><small>Chair · Active</small></span></div><div><i>MS</i><span><strong>M. Sjöberg</strong><small>Deputy · Former</small></span></div></div>`,
    },
    "company-enrich": {
      label: "Company profile", icon: "#pi-building", tone: "cobalt",
      body: `<div class="viz-profile"><div class="viz-avatar">A</div><div><strong>Acme AB</strong><span>Software · Stockholm</span></div></div><div class="viz-stat-grid"><div><span>Employees</span><strong>48</strong></div><div><span>Revenue</span><strong>€8.2m</strong></div><div><span>Founded</span><strong>2019</strong></div><div><span>Domain</span><strong>acme.se</strong></div></div>`,
    },
    "email-validate": {
      label: "Email validation", icon: "#pi-check", tone: "mineral",
      body: `<div class="viz-input">alex@example.com</div><div class="viz-checks"><div><i></i><span>Format</span><strong>Valid</strong></div><div><i></i><span>MX records</span><strong>Found</strong></div><div><i></i><span>Disposable</span><strong>No</strong></div></div>`,
    },
    "phone-validate": {
      label: "Phone validation", icon: "#pi-check", tone: "cobalt",
      body: `<div class="viz-phone"><span>SE</span><strong>+46 70 123 45 67</strong></div><div class="viz-facts"><div><span>Type</span><strong>Mobile</strong></div><div><span>Operator</span><strong>Telia</strong></div><div><span>Reachable</span><strong>Yes</strong></div></div>`,
    },
    "address-validate": {
      label: "Address validation", icon: "#pi-check", tone: "mineral",
      body: `<div class="viz-address"><i></i><div><strong>Sveavägen 1</strong><span>111 57 Stockholm · SE</span></div></div><div class="viz-compare"><span>Original</span><i></i><strong>Normalized</strong></div><div class="viz-caption"><span>Confidence</span><strong>99%</strong></div>`,
    },
    "vat-validate": {
      label: "VAT validation", icon: "#pi-check", tone: "violet",
      body: `<div class="viz-vat"><span>SE</span><strong>556703748501</strong><i>✓</i></div><div class="viz-facts"><div><span>Entity</span><strong>Acme AB</strong></div><div><span>Country</span><strong>Sweden</strong></div><div><span>Status</span><strong>Valid</strong></div></div>`,
    },
    "iban-validate": {
      label: "IBAN validation", icon: "#pi-wallet", tone: "cobalt",
      body: `<div class="viz-iban"><span>SE35</span><span>5000</span><span>0000</span><span>0549</span></div><div class="viz-facts"><div><span>Checksum</span><strong>Passed</strong></div><div><span>Bank</span><strong>SEB</strong></div><div><span>Country</span><strong>Sweden</strong></div></div>`,
    },
    "company-name-match": {
      label: "Company-name match", icon: "#pi-target", tone: "coral",
      body: `<div class="viz-match"><div><span>Input</span><strong>ACME Sweden</strong></div><i>→</i><div><span>Registry match</span><strong>Acme AB</strong></div></div><div class="viz-confidence"><span>Match confidence</span><strong>96%</strong><i></i></div>`,
    },
    "sanctions-check": {
      label: "Sanctions screening", icon: "#pi-shield", tone: "mineral",
      body: `<div class="viz-checks"><div><i></i><span>Global lists</span><strong>Checked</strong></div><div><i></i><span>Aliases</span><strong>Screened</strong></div><div><i></i><span>Matches</span><strong>0</strong></div></div><div class="viz-clear"><i>✓</i><span><strong>Clear</strong><small>12 watchlists</small></span></div>`,
    },
    "pep-check": {
      label: "PEP screening", icon: "#pi-user", tone: "violet",
      body: `<div class="viz-identity"><i>AL</i><div><strong>Anna Lind</strong><span>Sweden · Exact identity</span></div></div><div class="viz-facts"><div><span>Role</span><strong>No current office</strong></div><div><span>Former role</span><strong>Checked</strong></div><div><span>Outcome</span><strong>Clear</strong></div></div>`,
    },
    "adverse-media-check": {
      label: "Adverse media check", icon: "#pi-shield", tone: "coral",
      body: `<div class="viz-feed"><div><strong>Sources</strong><span>128 scanned</span></div><div class="is-review"><strong>Mentions</strong><span>3 review</span></div><div><strong>Context</strong><span>Returned</span></div></div><div class="viz-signal"><i></i><span>One relevant mention</span><strong>Review</strong></div>`,
    },
    "aml-risk-score": {
      label: "AML risk score", icon: "#pi-shield", tone: "navy",
      body: `<div class="viz-score"><div style="--score:78%"><strong>78</strong><span>Medium</span></div><ul><li>Ownership <b>Low</b></li><li>Jurisdiction <b>Medium</b></li><li>Adverse media <b>High</b></li></ul></div><div class="viz-caption"><span>Signals combined</span><strong>6</strong></div>`,
    },
    "insolvency-check": {
      label: "Insolvency records", icon: "#pi-file", tone: "coral",
      body: `<div class="viz-case"><div><span>Case status</span><strong>No open case</strong></div><b>Clear</b></div><div class="viz-timeline viz-timeline--compact"><div><i></i><strong>Registry searched</strong><span>Today</span></div><div><i></i><strong>Filings checked</strong><span>3 years</span></div></div>`,
    },
    "gdpr-website-check": {
      label: "GDPR website scan", icon: "#pi-shield", tone: "violet",
      body: `<div class="viz-browser"><div><i></i><i></i><i></i><span>acme.eu</span></div><section><b>74</b><span>Privacy score</span></section></div><div class="viz-checks viz-checks--dense"><div><i></i><span>Consent banner</span><strong>Found</strong></div><div><i></i><span>Policy</span><strong>Current</strong></div><div class="is-review"><i></i><span>Trackers</span><strong>2 review</strong></div></div>`,
    },
    "domain-reputation": {
      label: "Domain reputation", icon: "#pi-globe", tone: "cobalt",
      body: `<div class="viz-score viz-score--solo"><div style="--score:88%"><strong>88</strong><span>Trusted</span></div></div><div class="viz-facts"><div><span>Blacklists</span><strong>0</strong></div><div><span>Category</span><strong>Business</strong></div><div><span>Age</span><strong>8 years</strong></div></div>`,
    },
    "dns-lookup": {
      label: "DNS records", icon: "#pi-globe", tone: "navy",
      body: `<div class="viz-dns"><div><b>A</b><span>76.76.21.21</span></div><div><b>MX</b><span>mail.example.com</span></div><div><b>NS</b><span>ns1.cloudflare.com</span></div></div><div class="viz-caption"><span>Nameservers</span><strong>Authoritative</strong></div>`,
    },
    "ssl-check": {
      label: "SSL security", icon: "#pi-shield", tone: "mineral",
      body: `<div class="viz-certificate"><div><i>✓</i><span><strong>Certificate valid</strong><small>acme.com</small></span></div><dl><dt>Issuer</dt><dd>Let's Encrypt</dd><dt>Expires</dt><dd>84 days</dd><dt>Chain</dt><dd>Trusted</dd></dl></div>`,
    },
    "whois-lookup": {
      label: "Domain ownership", icon: "#pi-globe", tone: "violet",
      body: `<div class="viz-domain-card"><strong>acme.com</strong><span>Registered domain</span></div><div class="viz-timeline viz-timeline--compact"><div><i></i><strong>Created</strong><span>2018</span></div><div><i></i><strong>Updated</strong><span>2026</span></div><div><i></i><strong>Registrar</strong><span>Namecheap</span></div></div>`,
    },
    "tech-stack-detect": {
      label: "Technology stack", icon: "#pi-layers", tone: "cobalt",
      body: `<div class="viz-stack"><div><span>Frontend</span><strong>Next.js</strong><i>React</i></div><div><span>Analytics</span><strong>Plausible</strong><i>GTM</i></div><div><span>Infrastructure</span><strong>Vercel</strong><i>Cloudflare</i></div></div>`,
    },
    "seo-audit": {
      label: "SEO audit", icon: "#pi-target", tone: "coral",
      body: `<div class="viz-seo"><b>82</b><div><span>Technical</span><i style="--w:92%"></i><span>Content</span><i style="--w:76%"></i><span>Metadata</span><i style="--w:68%"></i></div></div><div class="viz-caption"><span>Issues found</span><strong>7 actionable</strong></div>`,
    },
  };

  const enhanceIllustration = (card) => {
    const visual = card.querySelector(".capability-story-visual");
    const slug = card.querySelector("code")?.textContent.trim();
    const config = illustrations[slug];
    if (!visual || !config) return;
    const heading = card.querySelector("h3");
    if (heading && !card.querySelector(".capability-story-icon")) {
      const icon = document.createElement("span");
      icon.className = `capability-story-icon capability-story-icon--${config.tone}`;
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = `<svg><use href="${config.icon}"></use></svg>`;
      card.insertBefore(icon, heading);
    }
    // Render the live cards as HTML rather than raster art. The generated
    // canvases have different amounts of transparent padding, which makes
    // their visible content vary in size and position. Native illustration
    // markup stays sharp, legible, and locked to the same optical stage.
    card.classList.remove("capability-story--generated");
    card.classList.add("capability-story--native");
    card.style.removeProperty("--cap-art-scale");
    visual.innerHTML = `<div class="capability-illustration capability-illustration--${config.tone}"><div class="capability-illustration-body">${config.body}</div></div>`;
  };

  if (prototypeMode) {
    const prototypeSlugs = [
      "google-search",
      "swedish-company-data",
      "sanctions-check",
      "ssl-check",
    ];
    const selectedCards = prototypeSlugs
      .map((slug) =>
        sourceCards.find(
          (card) => card.querySelector("code")?.textContent.trim() === slug,
        ),
      )
      .filter(Boolean);

    if (selectedCards.length === prototypeSlugs.length) {
      sourceSet.replaceChildren(...selectedCards);
    }
  } else if (sourceCards.length === editorialOrder.length) {
    editorialOrder.forEach((index) => sourceSet.appendChild(sourceCards[index]));
  }

  Array.from(sourceSet.children).forEach((card) => {
    card.classList.remove(...surfaceClasses);
    Array.from(card.classList)
      .filter((className) => className.startsWith("capability-story--motif-"))
      .forEach((className) => card.classList.remove(className));
    enhanceIllustration(card);
  });

  // Motion is part of the finished carousel experience. Keep an explicit
  // opt-out for review/accessibility checks instead of requiring a preview-only
  // query flag that disappears when the HTML file is opened directly.
  const motionRequested = queryParams.get("motion") !== "0";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pixelsPerSecond = 64;
  let paused = false;
  let clone;
  let frame;
  let lastFrameTime;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let pointerActive = false;
  let dragging = false;
  let touchMoved = false;
  let interactionHold = false;
  let interactionTimer;
  let autoPosition = viewport.scrollLeft;
  let railInView = false;
  let heroInView = true;
  const heroVisual = document.querySelector(".hero-visual");

  const getPauseReason = () => {
    if (!motionRequested) return "motion-disabled";
    if (reduceMotion.matches) return "reduced-motion";
    if (document.hidden) return "document-hidden";
    if (!railInView) return "offscreen";
    if (heroInView) return "hero-visible";
    if (paused) return "user-paused";
    if (dragging) return "dragging";
    if (interactionHold) return "manual-interaction";
    return "none";
  };

  const syncRuntimeState = () => {
    const pauseReason = getPauseReason();
    viewport.dataset.autoplay = pauseReason === "none" ? "running" : "paused";
    viewport.dataset.pauseReason = pauseReason;
  };

  const syncToggle = () => {
    section.dataset.paused = String(paused);
    toggleLabel.textContent = paused ? "Resume" : "Pause";
    toggle.setAttribute("aria-pressed", String(paused));
    const actionLabel = paused ? "Resume capability carousel" : "Pause capability carousel";
    toggle.setAttribute("aria-label", actionLabel);
    toggle.title = actionLabel;
    syncRuntimeState();
  };

  const shouldAutoScroll = () => (
    motionRequested
    && !reduceMotion.matches
    && !document.hidden
    && railInView
    && !heroInView
    && !paused
    && !interactionHold
    && !dragging
  );

  const stopTicker = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = undefined;
    lastFrameTime = undefined;
  };

  const tick = (time) => {
    frame = undefined;

    if (!shouldAutoScroll()) {
      lastFrameTime = undefined;
      syncRuntimeState();
      return;
    }

    const loopWidth = sourceSet.scrollWidth;

    if (lastFrameTime === undefined) {
      autoPosition = viewport.scrollLeft;
    } else if (loopWidth > 0) {
      const elapsed = Math.min(time - lastFrameTime, 50);
      autoPosition += elapsed * (pixelsPerSecond / 1000);
      if (autoPosition >= loopWidth) autoPosition %= loopWidth;
      viewport.scrollLeft = autoPosition;
    }

    lastFrameTime = time;
    syncRuntimeState();
    frame = requestAnimationFrame(tick);
  };

  const syncMotionState = () => {
    syncRuntimeState();
    if (shouldAutoScroll()) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      stopTicker();
    }
  };

  const holdForManualInteraction = (delay = 2200) => {
    if (!motionRequested) return;
    autoPosition = viewport.scrollLeft;
    interactionHold = true;
    clearTimeout(interactionTimer);
    syncMotionState();

    interactionTimer = window.setTimeout(() => {
      const loopWidth = sourceSet.scrollWidth;
      autoPosition = loopWidth > 0 ? viewport.scrollLeft % loopWidth : viewport.scrollLeft;
      if (loopWidth > 0 && viewport.scrollLeft >= loopWidth) viewport.scrollLeft = autoPosition;
      interactionHold = false;
      syncMotionState();
    }, delay);
  };

  const getCardStep = () => {
    const card = sourceSet.querySelector(".capability-story");
    const styles = getComputedStyle(sourceSet);
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
    return card ? card.getBoundingClientRect().width + gap : 272;
  };

  const stepRail = (direction) => {
    holdForManualInteraction();
    viewport.scrollBy({
      left: (direction === "previous" ? -1 : 1) * getCardStep(),
      behavior: "smooth",
    });
  };

  const enableMotion = () => {
    if (!motionRequested || reduceMotion.matches) {
      toggle.hidden = true;
      syncMotionState();
      return;
    }

    if (!clone) {
      clone = sourceSet.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
    }

    section.classList.add("is-motion-enabled");
    toggle.hidden = false;
    syncToggle();
    syncMotionState();
  };

  const disableMotion = () => {
    stopTicker();
    section.classList.remove("is-motion-enabled");
    toggle.hidden = true;
    syncRuntimeState();

    if (clone) {
      clone.remove();
      clone = undefined;
    }
  };

  toggle.addEventListener("click", () => {
    paused = !paused;
    syncToggle();
    syncMotionState();
  });

  viewport.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    stepRail(event.key === "ArrowLeft" ? "previous" : "next");
  });

  viewport.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    holdForManualInteraction();
  }, { passive: true });
  viewport.addEventListener("touchstart", () => {
    touchMoved = false;
  }, { passive: true });
  viewport.addEventListener("touchmove", () => {
    touchMoved = true;
    holdForManualInteraction();
  }, { passive: true });
  viewport.addEventListener("touchend", () => {
    if (touchMoved) holdForManualInteraction();
    touchMoved = false;
  }, { passive: true });
  viewport.addEventListener("scrollend", () => {
    if (interactionHold) holdForManualInteraction(900);
  });
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    pointerActive = true;
    dragStartX = event.clientX;
    dragStartScroll = viewport.scrollLeft;
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!pointerActive) return;
    const delta = event.clientX - dragStartX;

    if (!dragging && Math.abs(delta) < 5) return;
    if (!dragging) {
      dragging = true;
      holdForManualInteraction();
      section.classList.add("is-user-scrolling");
    }

    viewport.scrollLeft = dragStartScroll - delta;
  });

  const endDrag = (event) => {
    if (!pointerActive) return;
    const wasDragging = dragging;
    pointerActive = false;
    dragging = false;
    section.classList.remove("is-user-scrolling");
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (wasDragging) holdForManualInteraction();
  };

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  const railObserver = new IntersectionObserver(([entry]) => {
    railInView = entry.intersectionRatio >= 0.12;
    syncMotionState();
  }, { threshold: [0, 0.12] });
  railObserver.observe(viewport);

  if (heroVisual) {
    const heroObserver = new IntersectionObserver(([entry]) => {
      heroInView = entry.intersectionRatio >= 0.12;
      syncMotionState();
    }, { threshold: [0, 0.12] });
    heroObserver.observe(heroVisual);
  } else {
    heroInView = false;
  }

  document.addEventListener("visibilitychange", syncMotionState);

  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) disableMotion();
    else enableMotion();
  });
  enableMotion();
})();
