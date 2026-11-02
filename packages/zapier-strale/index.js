const zapier = require("zapier-platform-core");
const { version } = require("./package.json");
const { jobs, JobInputError } = require("./lib/jobs");
const { request } = require("./lib/client");

// One deadline for the entire action, including both screening calls. Leave
// headroom beneath Zapier's 30-second operation limit. Polling never resubmits.
async function execute(z, bundle, capability_slug, inputs, deadline) {
  const timeout = () => Math.max(1, Math.min(20000, deadline - Date.now()));
  if (Date.now() >= deadline) {
    throw new z.errors.HaltedError(
      "The action time limit was reached. Earlier checks may have completed and been billed. Review your Strale transactions before rerunning."
    );
  }
  const response = await request(
    z,
    bundle,
    "/v1/do",
    {
      capability_slug,
      inputs,
      max_price_cents: 100,
      timeout_seconds: 20,
    },
    timeout()
  );
  let result = response.result;
  const transactionId = result?.transaction_id;
  while (
    result?.status === "executing" &&
    transactionId &&
    Date.now() < deadline - 1500
  ) {
    try {
      result = await request(
        z,
        bundle,
        `/v1/transactions/${encodeURIComponent(transactionId)}`,
        undefined,
        timeout()
      );
    } catch (err) {
      const advice = `Review Strale transaction ${transactionId} at /v1/transactions/${transactionId} before rerunning; it may already have completed and been billed.`;
      if (err.name === "ExpiredAuthError") {
        throw new z.errors.ExpiredAuthError(`${err.message} ${advice}`);
      }
      // Retrying the whole action could repeat the billed POST. Stop here even
      // when the failed GET itself was retryable or throttled.
      let reason = "The submitted check could not be read.";
      if (["AppError", "HaltedError", "ThrottledError"].includes(err.name)) {
        try {
          reason = JSON.parse(err.message).message || reason;
        } catch {
          reason = err.message;
        }
      }
      throw new z.errors.HaltedError(`${reason} ${advice}`);
    }
    if (result.status === "executing")
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (result?.status !== "completed") {
    const fix =
      result?.details?.fix ||
      "Review your Strale transactions before rerunning; completed checks may already have been billed.";
    throw new z.errors.HaltedError(
      `Strale transaction ${
        transactionId || "(ID unavailable)"
      } has not completed successfully. ${fix}`
    );
  }
  return result;
}

const creates = Object.fromEntries(
  Object.entries(jobs).map(([key, job]) => [
    key,
    zapier.defineCreate({
      key,
      noun: "Result",
      display: {
        label: job.title,
        description: job.description,
        hidden: job.hidden,
      },
      operation: {
        inputFields: job.inputFields.map((field, index) =>
          index === 0
            ? {
                ...field,
                helpText: [
                  field.helpText,
                  "Replaying a Zap can repeat completed checks and charges. Review Strale transactions before rerunning.",
                ].filter(Boolean).join(" "),
              }
            : field
        ),
        outputFields: job.outputFields,
        sample: job.sample,
        perform: async (z, bundle) => {
          const deadline = Date.now() + 25000;
          try {
            return await job.run(bundle.inputData, (slug, inputs) =>
              execute(z, bundle, slug, inputs, deadline)
            );
          } catch (err) {
            if (err instanceof JobInputError)
              throw new z.errors.HaltedError(err.message);
            throw err;
          }
        },
      },
    }),
  ])
);

module.exports = zapier.defineApp({
  version,
  platformVersion: zapier.version,
  authentication: {
    type: "custom",
    fields: [
      {
        key: "api_key",
        label: "Strale API key",
        type: "password",
        required: true,
        helpText: "Use your Strale API key. Calls use your prepaid wallet.",
      },
    ],
    test: (z, bundle) => request(z, bundle, "/v1/wallet/balance"),
  },
  flags: { throwForThrottlingEarly: false },
  creates,
});
