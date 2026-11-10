// /signup: POST /v1/auth/register and show the new key once. The key lives only in this page's
// DOM: nothing is written to storage, a cookie or the address (as on strale-frontend's Signup.tsx).
import { openingBalance, registerBody, registerErrorMessage, type RegisterResponse } from "../lib/wallet.ts";
import { campaignFromUrl } from "../lib/campaign";
import { track } from "./analytics";
import { signupContinuation, type SignupTool } from "../lib/signup-continuation";

const root = document.querySelector<HTMLElement>("[data-signup]");
if (root) {
  const api = root.dataset.api!;
  const support = root.dataset.support!;
  const form = root.querySelector<HTMLFormElement>("[data-signup-form]")!;
  const email = form.querySelector<HTMLInputElement>("#signup-email")!;
  const name = form.querySelector<HTMLInputElement>("#signup-name")!;
  const error = form.querySelector<HTMLElement>("[data-signup-error]")!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const spinner = button.querySelector<HTMLElement>("[data-spinner]")!;
  const label = button.querySelector<HTMLElement>("[data-label]")!;
  const formView = root.querySelector<HTMLElement>("[data-signup-form-view]")!;
  const done = root.querySelector<HTMLElement>("[data-signup-done]")!;
  const keyEl = root.querySelector<HTMLElement>("[data-signup-key]")!;
  const balanceEl = root.querySelector<HTMLElement>("[data-signup-balance]")!;
  const withheld = root.querySelector<HTMLElement>("[data-signup-withheld]")!;
  const copy = root.querySelector<HTMLButtonElement>("[data-signup-copy]")!;
  const copyStatus = root.querySelector<HTMLElement>("[data-signup-copy-status]")!;
  let submitting = false;
  let apiKey = "";

  // Optional navigation context must never prevent account creation. The list comes from
  // the built catalogue, not the query string; assign textContent rather than HTML.
  try {
    const tools = JSON.parse(root.dataset.signupTools ?? "[]") as SignupTool[];
    const continuation = signupContinuation(location.href, tools);
    if (continuation) {
      const context = root.querySelector<HTMLElement>("[data-signup-tool-context]");
      const name = root.querySelector<HTMLElement>("[data-signup-tool-name]");
      const next = root.querySelector<HTMLElement>("[data-signup-continuation]");
      const link = root.querySelector<HTMLAnchorElement>("[data-signup-continue]");
      const general = root.querySelector<HTMLElement>("[data-signup-general-steps]");
      if (context && name && next && link && general) {
        name.textContent = continuation.name;
        link.textContent = `Continue with ${continuation.name}`;
        link.href = continuation.href;
        context.hidden = false;
        next.hidden = false; // Inside the success view, which stays hidden until signup succeeds.
        general.hidden = true;
      }
    }
  } catch { /* Missing or malformed context falls back to the ordinary quickstart. */ }

  // The browser's own required / type=email check runs before submit, as on the old page.
  const showError = (msg: string) => {
    error.querySelector("span")!.textContent = msg;
    error.hidden = !msg;
  };
  const setSubmitting = (on: boolean) => {
    submitting = on;
    button.disabled = on;
    button.toggleAttribute("aria-busy", on);
    spinner.hidden = !on;
    label.textContent = on ? "Creating account…" : "Get API key";
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    showError("");
    try {
      const res = await fetch(`${api}/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...registerBody(email.value, name.value), ...signupSource() }),
      });
      if (!res.ok) {
        await res.json().catch(() => null);
        showError(registerErrorMessage(res.status, support));
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as RegisterResponse;
      apiKey = data.api_key ?? "";
      if (apiKey) track("signup_completed");
      keyEl.textContent = apiKey;
      const balance = openingBalance(data);
      const grantWithheld = data.trial_credits?.granted === false;
      balanceEl.textContent = balance
        ? `Your API key is ready. Balance: ${balance}${grantWithheld ? "." : " in free credits."}`
        : "Your API key is ready.";
      if (grantWithheld && data.trial_credits?.message) {
        withheld.querySelector("p")!.textContent = data.trial_credits.message;
        withheld.hidden = false;
      }
      formView.hidden = true;
      done.hidden = false;
      done.focus();
    } catch {
      showError("Could not reach the server. Please try again.");
      setSubmitting(false);
    }
  });

  copy.addEventListener("click", async () => {
    const text = copy.querySelector("span")!;
    const icon = copy.querySelector("use")!;
    try {
      await navigator.clipboard.writeText(apiKey);
      text.textContent = "Copied";
      icon.setAttribute("href", "#i-check");
      copyStatus.textContent = "API key copied to clipboard";
    } catch {
      text.textContent = "Copy failed";
      icon.setAttribute("href", "#i-error");
      copyStatus.textContent = "Could not copy; select the key and copy it manually";
    }
    setTimeout(() => {
      text.textContent = "Copy";
      icon.setAttribute("href", "#i-copy");
      copyStatus.textContent = "";
    }, 2000);
  });
}

export {};

function signupSource(): { src?: string } {
  const source = campaignFromUrl(location.href).utm_source;
  return source ? { src: source } : {};
}
