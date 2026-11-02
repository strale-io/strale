import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function parseSlugs(value, mode = "onboard", manifestDirectory = "manifests") {
  const limit = mode === "limitations" ? 1000 : 50;
  // Expand from the main-only workflow checkout, keeping the API single-slug
  // lock and budget unchanged. The API still validates each deployed manifest.
  const slugs = mode === "limitations" && value.trim() === "all"
    ? readdirSync(manifestDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
        .map((entry) => entry.name.slice(0, -5)).sort()
    : value.split(",").map((s) => s.trim());
  if (
    !slugs.length ||
    slugs.length > limit ||
    slugs.includes("all") ||
    slugs.some((s) => s.length > 100 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))
  ) {
    throw new Error(
      `Enter between 1 and ${limit} lowercase capability slugs, separated by commas. Use all only by itself in limitations mode.`
    );
  }
  if (new Set(slugs).size !== slugs.length)
    throw new Error("Remove duplicate slugs before running.");
  return slugs;
}

export async function runWorkflow(
  env,
  request,
  pause = (ms) => new Promise((r) => setTimeout(r, ms))
) {
  mkdirSync("onboarding-results", { recursive: true });
  const summary = (text) =>
    appendFileSync(env.GITHUB_STEP_SUMMARY, text + "\n");
  summary("# Capability onboarding\n");
  let failed = false;
  try {
    if (!["onboard", "backfill", "limitations"].includes(env.INPUT_MODE))
      throw new Error("Choose onboard, backfill or limitations.");
    const slugs = parseSlugs(env.INPUT_SLUGS ?? "", env.INPUT_MODE);
    if (!env.ONBOARDING_RUN_SECRET || env.ONBOARDING_RUN_SECRET.length < 32)
      throw new Error(
        "Add a secret of at least 32 characters to the production-onboarding environment."
      );
    for (const slug of slugs) {
      let response = await request("POST", "/v1/internal/onboarding/run", {
        slug,
        mode: env.INPUT_MODE,
        discover: env.INPUT_DISCOVER === "true",
        fix: env.INPUT_FIX === "true",
      });
      const save = () =>
        writeFileSync(
          `onboarding-results/${slug}.json`,
          JSON.stringify(response, null, 2) + "\n"
        );
      save();
      if (response.body.id)
        summary(`${slug}: accepted run id \`${response.body.id}\`.`);
      if (response.http === 202 && response.body.status === "running") {
        const id = response.body.id;
        if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
          throw new Error("API returned an invalid run id.");
        const deadline = Date.now() + 360_000;
        do {
          await pause(2000);
          response = await request("GET", `/v1/internal/onboarding/run/${id}`);
          save();
        } while (
          response.http === 200 &&
          response.body.status === "running" &&
          Date.now() < deadline
        );
      }
      save();
      const run = response.body;
      if (run.result?.updatedManifestYaml)
        writeFileSync(
          `onboarding-results/${slug}.yaml`,
          run.result.updatedManifestYaml
        );
      const ok =
        [200, 202].includes(response.http) &&
        run.status === "success" &&
        !run.busy;
      summary(`## ${slug}: ${ok ? "Completed" : "Needs attention"}\n`);
      if (run.result) {
        const result = run.result;
        for (const action of ["created", "updated", "deleted"]) {
          const count = (result.rows?.[action] ?? []).reduce(
            (n, row) => n + row.count,
            0
          );
          summary(`Rows ${action}: ${count}.`);
        }
        if (env.INPUT_MODE === "limitations") {
          const limitations = result.limitations;
          summary(`Limitations: ${limitations?.outcome ?? "failed"}. ${String(limitations?.reason ?? "Inspect the JSON result.").replace(/[\r\n]/g, " ")}`);
        } else {
          summary(
            `Generated test types: ${
              (result.generatedTestTypes ?? []).join(", ") || "none"
            }.`
          );
          summary(
            `Known-answer verification: ${
              result.verification?.passed === true
                ? "passed"
                : result.verification?.passed === false
                ? "not verified or failed; inspect JSON"
                : "skipped"
            }.`
          );
          summary(
            `Readiness: ${
              result.readiness?.ready === true ? "ready" : "has unresolved issues"
            }.`
          );
          for (const issue of result.readiness?.issues ?? [])
            summary(`- ${String(issue).replace(/[\r\n]/g, " ")}`);
        }
        if (result.updatedManifestYaml)
          summary(
            "Download the YAML artifact, review its fixtures and reliability annotations, and ask the maintainer to commit it to main. The deployed manifest was not changed."
          );
      }
      if (!ok) {
        failed = true;
        const errors = run.errors?.length
          ? run.errors
          : run.error
          ? [run.error]
          : [
              {
                message:
                  "No successful result. Inspect the JSON artifact and API logs before retrying.",
              },
            ];
        for (const error of errors)
          summary(`- ${String(error.message).replace(/[\r\n]/g, " ")}`);
      }
      if (
        run.busy ||
        response.http === 409 ||
        response.http === 401 ||
        response.http === 503 ||
        run.error?.code === "not_configured" ||
        run.errors?.some((error) => error.code === "not_configured") ||
        run.error_code === "not_configured" ||
        run.status === "running" ||
        run.status === "timeout"
      ) {
        summary(
          "Batch stopped. Check authentication, configuration and API logs before retrying remaining slugs."
        );
        break;
      }
    }
  } catch (error) {
    failed = true;
    // Only our own actionable errors are exposed; curl errors can include URLs
    // or headers, so the transport below replaces them with fixed text.
    summary(`Run stopped: ${error.message}`);
    writeFileSync(
      "onboarding-results/error.json",
      JSON.stringify({ status: "failed", message: error.message }) + "\n"
    );
  }
  summary(
    "\nFull JSON results and any generated manifests are under Artifacts → onboarding-results."
  );
  return failed ? 1 : 0;
}

export function curlRequest(env, method, path, body) {
  const base = new URL(env.STRALE_API_URL || "https://api.strale.io");
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("STRALE_API_URL must be a plain HTTPS API URL.");
  const args = [
    "--silent",
    "--show-error",
    "--connect-timeout",
    "10",
    "--max-time",
    "20",
    "--request",
    method,
    "--header",
    `Authorization: Bearer ${env.ONBOARDING_RUN_SECRET}`,
    "--header",
    "Content-Type: application/json",
    "--write-out",
    "\n%{http_code}",
    base.href.replace(/\/$/, "") + path,
  ];
  if (body) args.push("--data", JSON.stringify(body));
  let raw;
  try {
    raw = execFileSync("curl", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "API request timed out or could not connect. Check API logs before retrying: the run may have started."
    );
  }
  const split = raw.lastIndexOf("\n");
  try {
    return {
      http: Number(raw.slice(split + 1)),
      body: JSON.parse(raw.slice(0, split)),
    };
  } catch {
    throw new Error(
      "API returned an unreadable response. Check API logs before retrying."
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runWorkflow(process.env, (method, path, body) =>
    curlRequest(process.env, method, path, body)
  );
}
