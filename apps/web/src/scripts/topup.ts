// /topup: a vanilla port of strale-frontend's TopUp.tsx. The state, the effects and the
// stale-response guards are the old page's, in the same order:
//   - the key is held in sessionStorage under "strale_topup_api_key" (this tab only), never
//     localStorage, never a cookie, never sent anywhere but the Strale API;
//   - every wallet request captures the key it was made with and is discarded if another key
//     became active meanwhile, and one counter per kind of request means only the newest
//     request may touch its data, its error or its loading flag (latest request wins);
//   - a superseded request's 401 never drops a key a newer request has validated;
//   - after Stripe returns with ?status=success the balance and activity are polled five times,
//     two seconds apart, skipping a tick while one is in flight.
import {
  ActiveKey,
  RequestGate,
  TRANSACTION_LABEL,
  centsToEur,
  checkoutRedirect,
  currentGuard,
  friendlyError,
  isCredit,
  parseCustomEuros,
  validateAmount,
  type ApiErrorBody,
  type WalletBalance,
  type WalletTransaction,
} from "../lib/wallet.ts";

const SESSION_KEY = "strale_topup_api_key";

const root = document.querySelector<HTMLElement>("[data-topup]");
if (root) {
  const API = root.dataset.api!;
  const MIN_CENTS = Number(root.dataset.min);
  const MAX_CENTS = Number(root.dataset.max);
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  const searchParams = new URLSearchParams(location.search);
  const stripeStatus = searchParams.get("status"); // "success" | "cancelled" | null

  // ---------- state (the old component's useState values) ----------
  const s = {
    apiKey: "",
    checkingKey: false,
    keyError: "",
    balance: null as WalletBalance | null,
    balanceLoading: false,
    balanceError: "",
    transactions: [] as WalletTransaction[],
    transactionsLoading: false,
    transactionsError: "",
    selectedAmount: Number($<HTMLButtonElement>('[data-amount][aria-pressed="true"]').dataset.amount) as number | "custom",
    customEuros: "",
    amountValidationError: "",
    submitting: false,
    submitError: "",
    returnBanner: (stripeStatus === "success" || stripeStatus === "cancelled" ? stripeStatus : null) as "success" | "cancelled" | null,
  };
  // The old page's refs.
  const activeKey = new ActiveKey();
  const balanceGate = new RequestGate();
  const transactionsGate = new RequestGate();
  const applyGate = new RequestGate();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollAttempts = 0;
  let pollInFlight = false;

  const keyInput = $<HTMLInputElement>("#topup-key");
  const customInput = $<HTMLInputElement>("#custom-amount");

  // ---------- render: the old JSX, as DOM updates ----------
  const setMessage = (el: HTMLElement, msg: string) => {
    el.querySelector("span")!.textContent = msg;
    el.hidden = !msg;
  };
  const setBusy = (button: HTMLButtonElement, busy: boolean, idle: string, working: string) => {
    button.disabled = busy;
    button.toggleAttribute("aria-busy", busy);
    button.querySelector<HTMLElement>("[data-spinner]")!.hidden = !busy;
    button.querySelector<HTMLElement>("[data-label]")!.textContent = busy ? working : idle;
  };
  const rowTemplate = document.querySelector<HTMLTemplateElement>("#activity-row")!;

  function render() {
    // Return banner. It deliberately does not say the payment succeeded: anyone can type the
    // address. The balance updating (through the webhook) is the real confirmation.
    const banner = $("[data-banner]");
    banner.hidden = !s.returnBanner;
    if (s.returnBanner) {
      const ok = s.returnBanner === "success";
      banner.classList.toggle("notice-success", ok);
      banner.querySelector("use")!.setAttribute("href", ok ? "#i-success" : "#i-info");
      $("[data-banner-title]").textContent = ok ? "Checkout finished" : "Payment cancelled";
      $("[data-banner-body]").textContent = ok
        ? `If your payment completed, your balance updates automatically within a few seconds${s.apiKey ? "" : " once you paste your API key below"}. Stripe also emails you a receipt. If no receipt arrives and the balance doesn’t change, the payment didn’t go through, and it’s safe to try again.`
        : "No charge was made. You can start a new top-up any time below.";
    }

    // Key entry, or the active key's balance.
    $("[data-key-entry]").hidden = !!s.apiKey;
    $("[data-key-active]").hidden = !s.apiKey;
    setBusy($<HTMLButtonElement>("[data-key-form] button"), s.checkingKey, "Check balance", "Checking…");
    setMessage($("[data-key-error]"), s.keyError);
    keyInput.toggleAttribute("aria-invalid", !!s.keyError);

    const showSkeleton = s.balanceLoading && !s.balance;
    $("[data-balance-skeleton]").hidden = !showSkeleton;
    $("[data-balance-value]").hidden = showSkeleton || !s.balance;
    if (s.balance) $("[data-balance-amount]").textContent = `€${(s.balance.balance_cents / 100).toFixed(2)}`;
    $("[data-balance-spinner]").hidden = !s.balanceLoading;
    const unavailable = $("[data-balance-unavailable]");
    unavailable.hidden = showSkeleton || !!s.balance;
    unavailable.textContent = s.balanceError || "Balance unavailable";
    setMessage($("[data-balance-error]"), s.balanceError && s.balance === null ? s.balanceError : "");

    // Amount and checkout, only with a key.
    $("[data-amount-card]").hidden = !s.apiKey;
    root!.querySelectorAll<HTMLButtonElement>("[data-amount]").forEach((b) => b.setAttribute("aria-pressed", String(s.selectedAmount === Number(b.dataset.amount))));
    setMessage($("[data-amount-error]"), s.amountValidationError);
    setMessage($("[data-submit-error]"), s.submitError);
    setBusy($<HTMLButtonElement>("[data-continue]"), s.submitting, "Continue to payment", "Redirecting to Stripe…");

    // Recent activity.
    $("[data-activity-card]").hidden = !s.apiKey;
    $("[data-activity-loading]").hidden = !s.transactionsLoading;
    setMessage($("[data-activity-error]"), !s.transactionsLoading ? s.transactionsError : "");
    $("[data-activity-empty]").hidden = s.transactionsLoading || !!s.transactionsError || s.transactions.length > 0;
    const list = $("[data-activity-list]");
    list.hidden = s.transactionsLoading || !!s.transactionsError || s.transactions.length === 0;
    list.replaceChildren(
      ...s.transactions.slice(0, 20).map((tx) => {
        const li = (rowTemplate.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
        const credit = isCredit(tx.type);
        li.classList.add(credit ? "is-credit" : "is-debit");
        li.querySelector(".activity-desc")!.textContent = tx.description || TRANSACTION_LABEL[tx.type];
        const date = new Date(tx.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        li.querySelector(".activity-meta")!.textContent = `${TRANSACTION_LABEL[tx.type] ?? tx.type} · ${date}`;
        li.querySelector(".activity-amount")!.textContent = `${credit ? "+" : "−"}${centsToEur(tx.amount_cents)}`;
        return li;
      }),
    );
  }

  function update(patch: Partial<typeof s>) {
    const before = { apiKey: s.apiKey, returnBanner: s.returnBanner };
    Object.assign(s, patch);
    render();
    if (s.apiKey !== before.apiKey) onApiKeyChange();
    if (s.apiKey !== before.apiKey || s.returnBanner !== before.returnBanner) restartPoll();
  }

  async function parseJsonSafe(res: Response): Promise<ApiErrorBody | null> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  // Result contract (as before): callers read the return value, not state. `stale` means a newer
  // request superseded this one, so no decision (like dropping the key on 401) may be made from it.
  interface BalanceResult {
    ok: boolean;
    stale: boolean;
    message?: string;
    unauthorized?: boolean;
  }

  async function fetchBalance(key: string): Promise<BalanceResult> {
    const { ticket, isCurrent } = currentGuard(balanceGate, activeKey, key);
    update({ balanceLoading: true, balanceError: "" });
    try {
      const res = await fetch(`${API}/v1/wallet/balance`, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) {
        const body = await parseJsonSafe(res);
        if (res.status === 401) {
          const err = new Error(friendlyError(body, "That API key was rejected. Double-check it and try again.")) as Error & { unauthorized?: boolean };
          err.unauthorized = true;
          throw err;
        }
        throw new Error(friendlyError(body, `Could not load balance (status ${res.status}).`));
      }
      const data: WalletBalance = await res.json();
      if (isCurrent()) update({ balance: data });
      return { ok: true, stale: !isCurrent() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not reach the server. Please try again.";
      const unauthorized = e instanceof Error && (e as Error & { unauthorized?: boolean }).unauthorized === true;
      if (isCurrent()) update({ balanceError: msg, balance: null });
      return { ok: false, stale: !isCurrent(), message: msg, unauthorized };
    } finally {
      // Only the newest request may clear the loading flag.
      if (balanceGate.isLatest(ticket)) update({ balanceLoading: false });
    }
  }

  async function fetchTransactions(key: string) {
    const { ticket, isCurrent } = currentGuard(transactionsGate, activeKey, key);
    update({ transactionsLoading: true, transactionsError: "" });
    try {
      const res = await fetch(`${API}/v1/wallet/transactions`, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) {
        const body = await parseJsonSafe(res);
        throw new Error(friendlyError(body, "Could not load recent activity."));
      }
      const data = await res.json();
      if (isCurrent()) update({ transactions: Array.isArray(data.transactions) ? data.transactions : [] });
    } catch (e) {
      if (isCurrent()) update({ transactionsError: e instanceof Error ? e.message : "Could not load recent activity." });
    } finally {
      if (transactionsGate.isLatest(ticket)) update({ transactionsLoading: false });
    }
  }

  async function applyKey(key: string) {
    const trimmed = key.trim();
    if (!trimmed) {
      update({ keyError: "Paste your API key first." });
      return;
    }
    const ticket = applyGate.begin();
    // The key active when this call started (the old closure's `apiKey`).
    const previous = s.apiKey;
    update({ checkingKey: true, keyError: "" });
    activeKey.value = trimmed;
    const result = await fetchBalance(trimmed);
    // Superseded by a newer applyKey: that call owns the page now.
    if (!applyGate.isLatest(ticket)) return;
    update({ checkingKey: false });
    if (result.ok) {
      // The apiKey change re-fetches balance and transactions for this key.
      update({ apiKey: trimmed });
      try {
        sessionStorage.setItem(SESSION_KEY, trimmed);
      } catch {
        // storage unavailable: the page still works for this visit, it just won't remember the key
      }
    } else {
      // Keep the ref a strict mirror of the active key, so a later answer for the rejected
      // candidate cannot pass the guards.
      activeKey.value = previous;
      update({ keyError: result.message ?? "That API key was rejected. Double-check it and try again." });
    }
  }

  function clearKey() {
    activeKey.value = "";
    keyInput.value = "";
    update({ apiKey: "", balance: null, transactions: [], keyError: "", balanceError: "" });
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }

  // Once there is a key, load balance and transactions. A key restored from sessionStorage that
  // turns out to be revoked (401) drops back to key entry rather than leaving a dead key in place.
  function onApiKeyChange() {
    const apiKey = s.apiKey;
    if (!apiKey) return;
    activeKey.value = apiKey;
    void (async () => {
      const result = await fetchBalance(apiKey);
      if (activeKey.value !== apiKey) return;
      if (!result.ok && !result.stale && result.unauthorized) {
        clearKey();
        update({ keyError: "Your saved API key is no longer valid. Paste a current one to continue." });
        return;
      }
      void fetchTransactions(apiKey);
    })();
  }

  // After returning from Stripe, poll a few times: the webhook that credits the wallet can lag
  // the redirect by a second or two.
  function restartPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (s.returnBanner !== "success" || !s.apiKey) return;
    const apiKey = s.apiKey;
    pollAttempts = 0;
    const timer = setInterval(async () => {
      if (pollInFlight) return;
      pollAttempts += 1;
      pollInFlight = true;
      try {
        await fetchBalance(apiKey);
        await fetchTransactions(apiKey);
      } finally {
        pollInFlight = false;
      }
      if (pollAttempts >= 5) clearInterval(timer);
    }, 2000);
    pollTimer = timer;
  }

  function amountCents(): number | null {
    if (s.selectedAmount !== "custom") return s.selectedAmount;
    return parseCustomEuros(s.customEuros);
  }

  async function handleContinue() {
    const cents = amountCents();
    const err = validateAmount(cents, { custom: s.selectedAmount === "custom", raw: s.customEuros, min: MIN_CENTS, max: MAX_CENTS });
    if (err) {
      update({ amountValidationError: err });
      return;
    }
    if (!s.apiKey || cents === null) return;
    update({ submitting: true, submitError: "" });
    try {
      const res = await fetch(`${API}/v1/wallet/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` },
        body: JSON.stringify({ amount_cents: cents }),
      });
      if (!res.ok) {
        const body = await parseJsonSafe(res);
        throw new Error(friendlyError(body, `Could not start checkout (status ${res.status}).`));
      }
      const target = checkoutRedirect(await res.json());
      if ("error" in target) throw new Error(target.error);
      location.href = target.url;
    } catch (e) {
      update({ submitError: e instanceof Error ? e.message : "Could not reach the server. Please try again.", submitting: false });
    }
  }

  // ---------- events ----------
  $<HTMLFormElement>("[data-key-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!s.checkingKey) void applyKey(keyInput.value);
  });
  $("[data-clear-key]").addEventListener("click", clearKey);
  $("[data-balance-retry]").addEventListener("click", () => void fetchBalance(s.apiKey));
  root.querySelectorAll<HTMLButtonElement>("[data-amount]").forEach((b) =>
    b.addEventListener("click", () => update({ selectedAmount: Number(b.dataset.amount), amountValidationError: "" })),
  );
  customInput.addEventListener("input", () => update({ customEuros: customInput.value, selectedAmount: "custom", amountValidationError: "" }));
  $("[data-continue]").addEventListener("click", () => void handleContinue());
  $("[data-banner-dismiss]").addEventListener("click", () => update({ returnBanner: null }));

  // ---------- mount ----------
  render();
  // Strip ?status= and &session_id= once read, so a refresh does not replay the banner or the poll.
  if (stripeStatus) {
    const next = new URLSearchParams(searchParams);
    next.delete("status");
    next.delete("session_id");
    const qs = next.toString();
    history.replaceState(history.state, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  }
  // Restore the key kept for this tab.
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      keyInput.value = stored;
      update({ apiKey: stored });
    }
  } catch {
    // storage unavailable (private mode): the key is entered on each visit
  }
}

export {};
