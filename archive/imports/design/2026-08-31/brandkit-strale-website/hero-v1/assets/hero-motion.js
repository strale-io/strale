(() => {
  // Motion is part of the default website experience. Keep an explicit
  // opt-out for review and accessibility checks instead of requiring a
  // preview-only query flag that disappears when the file is opened directly.
  if (new URLSearchParams(window.location.search).get("motion") === "0") {
    document.documentElement.dataset.heroMotion = "disabled";
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) {
    document.documentElement.dataset.heroMotion = "reduced";
    return;
  }

  const scenarios = [
    {
      prompt: "Search the web for Stripe payment processing.",
      tool: "google-search",
      rows: [
        ["Results", "7 results"],
        ["Top result", "stripe.com"],
        ["Source", "Serper.dev"],
      ],
    },
    {
      prompt: "Look up Spotify AB using 556703-7485.",
      tool: "swedish-company-data",
      rows: [
        ["Company", "Spotify AB"],
        ["Status", "Active"],
        ["Source", "Bolagsverket"],
      ],
    },
    {
      prompt: "Validate test@google.com without sending an email.",
      tool: "email-validate",
      rows: [
        ["Format", "Valid"],
        ["MX records", "Found"],
        ["Disposable", "No"],
      ],
    },
  ];

  const prompt = document.querySelector(".request-prompt p");
  const tool = document.querySelector(".route code");
  const rows = [...document.querySelectorAll(".result-row")];
  const status = document.querySelector(".routing-status");
  const card = document.querySelector(".request-card");
  const visual = document.querySelector(".hero-visual");
  const workflows = document.querySelector(".workflows");

  if (!prompt || !tool || rows.length !== 3 || !status || !card || !visual) return;

  document.documentElement.dataset.heroMotion = "enabled";

  card.setAttribute("aria-label", "Rotating examples of Strale requests and tool responses");

  const style = document.createElement("style");
  style.textContent = `
    .motion-value {
      transition:
        opacity 180ms cubic-bezier(.2, .7, .2, 1),
        transform 180ms cubic-bezier(.2, .7, .2, 1);
    }

    .motion-value[data-motion-state="out"] {
      opacity: 0;
      transform: translateY(6px);
    }

    .motion-caret::after {
      content: "";
      width: 1px;
      height: 1.05em;
      margin-left: 3px;
      display: inline-block;
      background: currentColor;
      vertical-align: -0.11em;
      animation: motion-caret 720ms steps(1) infinite;
    }

    .motion-toggle {
      padding: 0;
      border: 0;
      color: #4f514d;
      background: transparent;
      cursor: pointer;
      text-transform: none;
    }

    .motion-toggle:hover { color: var(--ink); }

    .motion-toggle[data-motion-phase="completed"]::before {
      background: var(--success);
    }

    .motion-workflows .workflow-chain::before {
      transform: scaleY(0);
      transform-origin: top;
      transition: transform 1200ms cubic-bezier(.16, 1, .3, 1);
    }

    .motion-workflows .workflow-chain li {
      opacity: .32;
      transform: translateY(6px);
      transition:
        opacity 420ms cubic-bezier(.16, 1, .3, 1),
        transform 420ms cubic-bezier(.16, 1, .3, 1);
    }

    .motion-workflows .workflow-chain li::before {
      transition:
        border-color 420ms ease,
        box-shadow 420ms ease,
        background-color 420ms ease;
    }

    .motion-workflows .workflow-result {
      opacity: 0;
      transform: translateY(8px);
      transition:
        opacity 500ms cubic-bezier(.16, 1, .3, 1),
        transform 500ms cubic-bezier(.16, 1, .3, 1);
    }

    .motion-workflows.is-running .workflow-chain::before {
      transform: scaleY(1);
    }

    .motion-workflows .workflow-chain li.is-revealed {
      opacity: 1;
      transform: translateY(0);
    }

    .motion-workflows .workflow-chain li.is-revealed::before {
      border-color: var(--success);
      background: var(--canvas);
      box-shadow: inset 0 0 0 6px var(--canvas), inset 0 0 0 8px var(--success);
    }

    .motion-workflows .workflow-result.is-revealed {
      opacity: 1;
      transform: translateY(0);
    }

    @keyframes motion-caret {
      0%, 46% { opacity: 1; }
      47%, 100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  prompt.classList.add("motion-value");
  tool.classList.add("motion-value");
  rows.forEach((row) => {
    row.querySelector("span").classList.add("motion-value");
    row.querySelector("strong").classList.add("motion-value");
  });

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "routing-status motion-toggle";
  status.replaceWith(toggle);

  let paused = false;
  let heroInView = true;
  let workflowInView = false;
  let workflowRunning = false;
  let workflowCompleted = false;
  let workflowExitedAfterCompletion = false;
  let scenarioIndex = 0;
  let phase = "Completed";
  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  function syncToggle() {
    toggle.textContent = phase;
    toggle.dataset.motionPhase = phase.toLowerCase();
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute(
      "aria-label",
      `${paused ? "Play" : "Pause"} rotating examples. Current status: ${phase}`,
    );
    toggle.title = paused ? "Play rotating examples" : "Pause rotating examples";
  }

  function setPhase(nextPhase) {
    phase = nextPhase;
    syncToggle();
  }

  function setElementState(element, state) {
    element.dataset.motionState = state;
  }

  function setRowsState(state) {
    rows.flatMap((row) => [row.querySelector("span"), row.querySelector("strong")])
      .forEach((element) => setElementState(element, state));
  }

  function updateTool(scenario) {
    tool.textContent = scenario.tool;
  }

  function updateRows(scenario) {
    rows.forEach((row, index) => {
      row.querySelector("span").textContent = scenario.rows[index][0];
      row.querySelector("strong").textContent = scenario.rows[index][1];
    });
  }

  async function waitUntilHeroPlaying() {
    while (paused || document.hidden || !heroInView) await wait(120);
  }

  async function waitHeroDuration(milliseconds) {
    let elapsed = 0;
    while (elapsed < milliseconds) {
      await waitUntilHeroPlaying();
      const interval = Math.min(100, milliseconds - elapsed);
      await wait(interval);
      elapsed += interval;
    }
  }

  async function typePrompt(text) {
    prompt.textContent = "";
    setElementState(prompt, "in");
    prompt.classList.add("motion-caret");

    for (const character of text) {
      await waitUntilHeroPlaying();
      prompt.classList.add("motion-caret");
      prompt.textContent += character;
      await wait(character === " " ? 18 : 28);
    }

    prompt.classList.remove("motion-caret");
  }

  async function revealScenario(scenario) {
    setPhase("Listening");
    setElementState(prompt, "out");
    setElementState(tool, "out");
    setRowsState("out");
    await waitHeroDuration(200);

    await typePrompt(scenario.prompt);
    await waitHeroDuration(180);

    setPhase("Routing");
    updateTool(scenario);
    setElementState(tool, "in");
    await waitHeroDuration(420);

    updateRows(scenario);
    for (const row of rows) {
      row.querySelectorAll("span, strong").forEach((element) => setElementState(element, "in"));
      await waitHeroDuration(110);
    }

    setPhase("Completed");
  }

  async function runHero() {
    syncToggle();
    await waitHeroDuration(2800);

    while (true) {
      scenarioIndex = (scenarioIndex + 1) % scenarios.length;
      await revealScenario(scenarios[scenarioIndex]);
      await waitHeroDuration(3400);
    }
  }

  async function waitUntilWorkflowVisible() {
    while (document.hidden || !workflowInView) await wait(120);
  }

  async function waitWorkflowDuration(milliseconds) {
    let elapsed = 0;
    while (elapsed < milliseconds) {
      await waitUntilWorkflowVisible();
      const interval = Math.min(100, milliseconds - elapsed);
      await wait(interval);
      elapsed += interval;
    }
  }

  async function runWorkflowReveal() {
    if (!workflows || workflowRunning) return;
    workflowRunning = true;
    workflows.dataset.motionState = "running";

    const cards = [...workflows.querySelectorAll(".workflow-card")];
    const chains = cards.map((workflowCard) => [...workflowCard.querySelectorAll(".workflow-chain li")]);
    const results = cards.map((workflowCard) => workflowCard.querySelector(".workflow-result"));
    const longestChain = Math.max(...chains.map((chain) => chain.length));

    workflows.classList.remove("is-running");
    chains.flat().forEach((node) => node.classList.remove("is-revealed"));
    results.forEach((result) => result?.classList.remove("is-revealed"));

    await waitUntilWorkflowVisible();
    await waitWorkflowDuration(650);
    workflows.classList.add("is-running");

    for (let index = 0; index < longestChain; index += 1) {
      await waitUntilWorkflowVisible();
      chains.forEach((chain) => chain[index]?.classList.add("is-revealed"));
      await waitWorkflowDuration(480);
    }

    await waitUntilWorkflowVisible();
    await waitWorkflowDuration(650);
    results.forEach((result) => result?.classList.add("is-revealed"));
    workflowCompleted = true;
    workflowRunning = false;
    workflows.dataset.motionState = "complete";
  }

  toggle.addEventListener("click", () => {
    paused = !paused;
    prompt.classList.remove("motion-caret");
    syncToggle();
  });

  new IntersectionObserver(([entry]) => {
    heroInView = entry.isIntersecting;
  }, { threshold: 0.2 }).observe(visual);

  if (workflows) {
    workflows.classList.add("motion-workflows");
    workflows.dataset.motionState = "idle";
    new IntersectionObserver(([entry]) => {
      workflowInView = entry.intersectionRatio >= 0.18;

      if (!workflowInView && workflowCompleted) {
        workflowExitedAfterCompletion = true;
      }

      if (
        workflowInView
        && !workflowRunning
        && (!workflowCompleted || workflowExitedAfterCompletion)
      ) {
        workflowExitedAfterCompletion = false;
        runWorkflowReveal();
      }
    }, { threshold: [0, 0.18] }).observe(workflows);
  }

  runHero();
})();
