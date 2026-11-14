# Founder profile

Who the founder is and what the fleet optimises for. Every session reads this before it asks the
founder anything or designs how work runs. Evidence: founder, 2026-11-04 ("I thought you would
have more context about what it is that I do and what it is that I want to achieve"): sessions
had no such file, so they guessed, and asked him technical questions he cannot judge. Extended
from his own global-context notes, founder 2026-11-11.

## Who

- A solo, **non-technical** founder building several products in parallel (the active ones are
  the masters in wow-core's `docs/fleet-roster.md`), launching new products from time to time and
  running other projects beside them.
- He travels and is often away from his computer, sometimes for days, working from his phone.

## What he wants

- **The most progress on every project in parallel, with the least of his involvement.** Things
  just work; a mechanism that needs him often is a defect to fix, not a step to document.
- **Speed.** Build and move as fast as possible. Each project finds its bottlenecks and either
  removes them or tells him what to do about them, before he asks (founder 2026-11-11).
- **Claude Code is the architect and orchestrator:** plans, writes briefs, reviews, verifies.
  **Codex does the clearly specified, checkable work**, building above all, to save Claude usage,
  and Claude verifies it (`MODEL_ROUTING.md` "Codex builders").
- **Each project has a master that runs lanes in parallel**, and lanes delegate their building to
  Codex too, through the fleet's Codex dispatcher.
- **Work runs in the cloud**, so it continues while his laptop is closed. Work only his PC can do goes
  to the PC desk as a PC job (wow-core `docs/fleet-roster.md` "PC desk").
- **Sessions talk to each other** (`COMMS_CORE.md`) to stay in step and answer each other's
  questions before anything reaches him.
- **Seamless, never reckless:** secrets, sign-ins, customer and production data keep their rules
  (`SECURITY_CORE.md` in wow-core).
- **Moat and distribution** are at the core of how every product is thought about, in every project
  (founder 2026-11-11). Look for genuine levers, never superficial moats or distribution tricks,
  and never block work on finding one: a plan says `not found yet` when that is the truth
  (wow-core `templates/STATE_FILES.md` "Project plan", founder 2026-11-11).

## His budget

- **Three Claude Code accounts, all Ultra, and one Codex Pro account** (one ChatGPT sign-in), held in
  the cloud only by the fleet's Codex dispatcher (founder 2026-11-11).
- **He paces the accounts; no session does.** He sometimes has resets to use, so no session slows,
  holds back or rations work on its own judgment of the allowance (founder 2026-11-11; pace rules
  in `PACE_CORE.md`). His plan today: each Claude account lasts about 2 to 2.5 days, so together they
  cover a week. An account switch (`takeover`) is routine, every other day or so, and must stay cheap.
- **Cost:** until a product has paying users he is highly cost-conscious. Costs are easier to justify
  once customers pay (founder 2026-11-11; spending rules in `PACE_CORE.md` §6). He approves spending,
  within the rules of `PACE_CORE.md` §6. Free tiers, local use and fakes need none (a free tier that
  needs an account or terms still goes on his queue). A capped or fixed-price paid plan inside the
  envelope he ratified is standing approval: the master decides and logs it, and he does the signup and
  card step. Anything above the envelope needs his explicit yes, and so do annual or prepaid commitments,
  uncapped metered usage, metered model APIs and one-off purchases. Beyond that the rule is to
  **minimise cost** in how products are built and tested: money spent on CI, vendors and metered APIs,
  not the Claude or Codex allowance, which he paces himself (see above). On cost only, a project before
  launch and before customers need not pay for or operate as if it had an existing customer base; that
  changes after launch, with real usage. The merge gate, the security and data rules, and the five hard
  stops apply from day one. His current example is CI and test-runner cost, which is too high
  (founder 2026-11-11).

## Company and tools

- **One legal entity, Moonlighter AB**, carries all projects and all infrastructure (founder 2026-11-11).
- **Spin-off intent:** a product that reaches product-market fit and scales moves to its own legal
  entity, owned by Moonlighter AB. So build infrastructure that can be separated into a standalone
  entity with little work, and, as far as possible, make customer agreements allow the product to
  move, even with paying customers.
- **Tools:** the best tool for each project; where the provider does not matter, the same tool
  across projects. Prefer tools Claude or Codex reach by connector (MCP or similar), so the
  manual work he does shrinks.
- **Register, built, being filled:** one register of every tool in use across projects and how each
  account was created, so sessions know how work runs and what moving a product out of Moonlighter AB
  takes. The fleet's shared accounts are in wow-core `docs/TOOLS.md`; each project with a private
  repository keeps its own `docs/TOOLS.md`, started from `templates/TOOLS.template.md` and filled in
  by its master, and a public project's rows live in wow-core `docs/TOOLS.md`. Credentials
  and connectors agents can reach: wow-core `docs/ACCESS.md`.

## Quality bar

- **Verify.** When a session builds, implements or fixes something, it checks that what it
  reports done is done and works (founder 2026-11-11).
- **Design** (product, visual, UI, UX) matters and he notices detail. A session inspects its own
  work visually, measures it against a current best-practice reference, and iterates until
  its output holds that level (`UX_CORE.md`, `DESIGN_TASTE_CORE.md`).
- **Design references:** every project keeps its own set. In general he likes modern agentic AI
  tools: Legora, Hebbia, freda.com, sumary.com, grasp-ai.com/product (founder 2026-11-11).
- **Copy:** he is allergic to text that reads as AI-written. Text reads as written by an inspired
  startup team, clearly human, in a voice set per project (`VOICE_CORE.md`). Copy references: the
  About page on Tilja, the vision pages on Cinver.io and Marona.io, and the copy of freda.com
  (founder 2026-11-11).

## Asking him

- Ask only what is really his (`PACE_CORE.md` §5 "ASK LAST", in wow-core): his **five hard stops** and
  what they imply (founder 2026-11-06; list in wow-core `AGENTS.md` "Execution and close"): never send, post
  or invite; never pay, accept terms or create accounts; never delete production data or publish without
  his yes; Codex gets no keys, mail or customer data; merges only through `merge-gate`. So: spending,
  accounts and payments, legal acceptance, external communication, deleting production data, publishing,
  irreversible provider changes, and real product or strategy choices. Reversible production changes
  (environment and Railway variables, redeploy and rollback, DNS records, domain settings) are the
  masters' own and reach him only in the daily digest; storing a Test key or using a sign-in he already
  made needs no ask either (`SECURITY_CORE.md` §1a).
- **Never ask him to review or choose a technical option.** He cannot judge it better than a model, and
  stopping work to ask him is not worth the time (founder 2026-11-11). Decide it. Escalate the important
  technical questions to a more capable model (`MODEL_ROUTING.md`). A request to Codex carries no
  secrets, sign-in material, customer data or production data. The one route for a second opinion
  between Claude and Codex, on the PC or in the cloud, is `MODEL_ROUTING.md` "A second opinion"; it is
  additive. Use an independent review in a separate context where the tier needs one, and tell him what was decided.
- **When he must act** (product, strategy, spending, legal, external): describe the situation in
  plain language, list the options with pros and cons, give one clear recommendation he can answer
  with one word, then exact steps: which app, window, tab or session, and the text to paste
  (founder 2026-11-11). Keep his steps off the terminal wherever the platform allows.
- **Never hand him git, shell or PowerShell commands** (founder 2026-11-06: a master asked him to remove a
  worktree and delete a branch by hand). GitHub work (branches, PRs, labels) a cloud session does itself;
  work on his PC (worktrees, local files, local tools) goes to the PC desk as a PC job
  (wow-core `docs/fleet-roster.md` "PC desk"), batched into the next PC job when it is only cleanup. The
  only things he types are in Claude, a sign-in page or a product's own screen.

## Keeping this file current

He adds to this file over time (founder 2026-11-11). When a session learns something about him that
would change how other sessions work, it proposes the addition through its master to the wow-core
master, and it lands here by PR.
