const { version } = require("../package.json");
const BASE = "https://api.strale.io";
async function request(z, bundle, path, body, timeout = 25000) {
  const r = await z.request({
    url: `${BASE}${path}?src=zapier`,
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${bundle.authData.api_key}`,
      "X-Strale-Client": `zapier-strale/${version}`,
    },
    ...(body ? { body } : {}),
    skipThrowForStatus: true,
    timeout,
  });
  if (r.status >= 400) {
    let b;
    try {
      b = r.json;
    } catch {
      b = {};
    }
    b = b || {};
    const message = [
      b.message || "Strale could not complete this request.",
      b.details?.fix || b.details?.next_step,
    ]
      .filter(Boolean)
      .join(" ");
    if (
      r.status === 401 ||
      ["invalid_api_key", "invalid_key", "key_revoked", "key_expired"].includes(
        b.error_code
      )
    )
      throw new z.errors.ExpiredAuthError(
        `${message} Reconnect Strale with a valid API key.`
      );
    if (r.status === 429) {
      if (b.details?.retryable === false)
        throw new z.errors.HaltedError(
          [message, b.error_code].filter(Boolean).join(" ")
        );
      const delay = Number(
        b.details?.retry_after_seconds ??
          b.retry_after ??
          r.headers.get("retry-after")
      );
      throw new z.errors.ThrottledError(
        message,
        Number.isFinite(delay) && delay > 0 ? delay : 60
      );
    }
    if (
      (b.retryable ?? b.details?.retryable) === false ||
      (r.status < 500 && (b.retryable ?? b.details?.retryable) !== true)
    )
      throw new z.errors.HaltedError(message);
    throw new z.errors.Error(
      message,
      b.error_code || "StraleUnavailable",
      r.status
    );
  }
  return r.json;
}
module.exports = { request };
