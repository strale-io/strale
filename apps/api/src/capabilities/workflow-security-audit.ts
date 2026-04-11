import { registerCapability, type CapabilityInput } from "./index.js";
import jsYaml from "js-yaml";

/**
 * Audits GitHub Actions workflow YAML for supply chain security risks.
 * Pure computation — no external API calls. Catches:
 * - Unpinned actions (mutable tags instead of commit SHAs)
 * - Overly broad permissions
 * - Secret exposure in untrusted contexts
 * - Third-party actions from unverified publishers
 * - Dangerous patterns (pull_request_target, workflow_dispatch with code checkout)
 */

registerCapability("workflow-security-audit", async (input: CapabilityInput) => {
  const workflow = ((input.workflow as string) ?? (input.yaml as string) ?? (input.content as string) ?? (input.task as string) ?? "").trim();
  if (!workflow || workflow.length < 20) {
    throw new Error("'workflow' is required. Provide GitHub Actions workflow YAML content.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = jsYaml.load(workflow) as Record<string, unknown>;
  } catch (e: any) {
    throw new Error(`Invalid YAML: ${e.message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Workflow YAML must be a valid object with 'jobs' key.");
  }

  const findings: Finding[] = [];

  // Check top-level permissions
  checkPermissions(parsed.permissions, "workflow", findings);

  // Check each job
  const jobs = (parsed.jobs ?? {}) as Record<string, Record<string, unknown>>;
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== "object") continue;

    // Job-level permissions
    checkPermissions(job.permissions, `jobs.${jobName}`, findings);

    // Runner
    checkRunner(job["runs-on"], jobName, findings);

    // Steps
    const steps = (job.steps ?? []) as Array<Record<string, unknown>>;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      const stepId = (step.name as string) ?? (step.id as string) ?? `step ${i + 1}`;
      const location = `jobs.${jobName}.steps[${i}]`;

      // Check action references
      if (step.uses) {
        checkActionRef(step.uses as string, location, stepId, findings);
      }

      // Check for secret usage in run steps
      if (step.run && typeof step.run === "string") {
        checkSecretUsage(step.run, location, stepId, findings);
      }

      // Check environment variable secret exposure
      if (step.env && typeof step.env === "object") {
        checkEnvSecrets(step.env as Record<string, unknown>, location, stepId, findings);
      }
    }
  }

  // Check triggers for dangerous patterns
  checkTriggers(parsed.on ?? parsed.true, findings);

  // Compute risk level
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const riskLevel = critical > 0 ? "critical" : high > 0 ? "high" : medium > 0 ? "medium" : "low";

  return {
    output: {
      risk_level: riskLevel,
      findings_count: findings.length,
      findings,
      summary: {
        critical,
        high,
        medium,
        low: findings.filter((f) => f.severity === "low").length,
        info: findings.filter((f) => f.severity === "info").length,
      },
      checks_performed: [
        "action_pinning",
        "permissions_scope",
        "secret_exposure",
        "trusted_publishers",
        "dangerous_triggers",
        "runner_security",
      ],
    },
    provenance: { source: "static-analysis", fetched_at: new Date().toISOString() },
  };
});

// ─── Types ──────────────────────────────────────────────────────────────────

interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  location: string;
  description: string;
  recommendation: string;
}

// ─── Trusted action publishers ──────────────────────────────────────────────

const TRUSTED_PUBLISHERS = new Set([
  "actions",           // GitHub official
  "github",            // GitHub official
  "docker",            // Docker official
  "aws-actions",       // AWS official
  "azure",             // Azure official
  "google-github-actions", // Google official
  "hashicorp",         // HashiCorp
  "peter-evans",       // Well-known maintainer
  "peaceiris",         // Well-known maintainer
  "softprops",         // Well-known maintainer
]);

// ─── Check functions ────────────────────────────────────────────────────────

function checkActionRef(uses: string, location: string, stepName: string, findings: Finding[]): void {
  // Skip Docker and local path references
  if (uses.startsWith("docker://") || uses.startsWith("./") || uses.startsWith("../")) return;

  const match = uses.match(/^([^/]+)\/([^@]+)@(.+)$/);
  if (!match) {
    findings.push({
      severity: "medium",
      category: "action_pinning",
      location,
      description: `Unrecognized action reference format: ${uses}`,
      recommendation: "Use owner/repo@sha format for third-party actions.",
    });
    return;
  }

  const [, owner, , ref] = match;

  // Check SHA pinning
  const isSha = /^[a-f0-9]{40}$/.test(ref);
  const isMutableTag = !isSha;

  if (isMutableTag) {
    const isVersionTag = /^v\d+(\.\d+)*$/.test(ref);
    const severity = ref === "main" || ref === "master" ? "critical" : isVersionTag ? "high" : "critical";

    findings.push({
      severity,
      category: "action_pinning",
      location,
      description: `Action "${stepName}" uses mutable ref "${ref}" (${uses}). ${ref === "main" || ref === "master" ? "Branch references can be force-pushed by the action maintainer." : "Version tags can be moved to point to different commits."}`,
      recommendation: `Pin to a full commit SHA: ${owner}/${match[2]}@<commit-sha> # ${ref}`,
    });
  }

  // Check trusted publisher
  if (!TRUSTED_PUBLISHERS.has(owner!)) {
    findings.push({
      severity: isSha ? "info" : "medium",
      category: "trusted_publishers",
      location,
      description: `Action from third-party publisher "${owner}" (${uses}).`,
      recommendation: `Verify ${owner} is a trusted publisher. Consider forking critical actions into your org.`,
    });
  }
}

function checkPermissions(
  permissions: unknown,
  location: string,
  findings: Finding[],
): void {
  if (permissions === undefined) {
    if (location === "workflow") {
      findings.push({
        severity: "medium",
        category: "permissions_scope",
        location,
        description: "No explicit permissions declared. Workflow inherits default repository permissions, which may be overly broad.",
        recommendation: "Add explicit 'permissions' block with minimum required scopes.",
      });
    }
    return;
  }

  if (permissions === "write-all" || permissions === "read-all") {
    findings.push({
      severity: permissions === "write-all" ? "critical" : "medium",
      category: "permissions_scope",
      location,
      description: `Blanket "${permissions}" permission grants access to all scopes.`,
      recommendation: "Declare individual permissions (contents: read, issues: write, etc.) with minimum required access.",
    });
    return;
  }

  if (typeof permissions === "object" && permissions !== null) {
    const perms = permissions as Record<string, string>;
    const writeScopes = Object.entries(perms).filter(([, v]) => v === "write");
    if (writeScopes.length > 3) {
      findings.push({
        severity: "high",
        category: "permissions_scope",
        location,
        description: `${writeScopes.length} scopes have write access: ${writeScopes.map(([k]) => k).join(", ")}.`,
        recommendation: "Review whether all write scopes are necessary. Reduce to minimum required.",
      });
    }
  }
}

function checkRunner(
  runsOn: unknown,
  jobName: string,
  findings: Finding[],
): void {
  if (!runsOn) return;
  const runner = typeof runsOn === "string" ? runsOn : Array.isArray(runsOn) ? runsOn[0] : null;
  if (typeof runner !== "string") return;

  if (runner === "self-hosted") {
    findings.push({
      severity: "medium",
      category: "runner_security",
      location: `jobs.${jobName}`,
      description: "Self-hosted runner — ensure it is ephemeral and hardened. Persistent self-hosted runners retain state between workflow runs.",
      recommendation: "Use ephemeral self-hosted runners or GitHub-hosted runners when possible.",
    });
  }
}

function checkSecretUsage(
  run: string,
  location: string,
  stepName: string,
  findings: Finding[],
): void {
  const secretRefs = run.match(/\$\{\{\s*secrets\.[A-Z_]+\s*\}\}/g);
  if (!secretRefs) return;

  // Check if secrets are echoed/logged
  for (const ref of secretRefs) {
    if (run.match(new RegExp(`echo.*${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"))) {
      findings.push({
        severity: "critical",
        category: "secret_exposure",
        location,
        description: `Step "${stepName}" appears to echo secret ${ref} to output.`,
        recommendation: "Never echo secrets. Use them directly in environment variables or command arguments.",
      });
    }
  }

  // Check if run step uses secrets with curl/wget (data exfiltration risk)
  if (secretRefs.length > 0 && (run.includes("curl") || run.includes("wget")) && run.match(/https?:\/\/(?!github\.com|api\.github\.com)/)) {
    findings.push({
      severity: "high",
      category: "secret_exposure",
      location,
      description: `Step "${stepName}" uses secrets with external HTTP request. Potential exfiltration vector.`,
      recommendation: "Verify the external URL is trusted. Consider using OIDC tokens instead of long-lived secrets.",
    });
  }
}

function checkEnvSecrets(
  env: Record<string, unknown>,
  location: string,
  stepName: string,
  findings: Finding[],
): void {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.includes("secrets.") && key.toUpperCase() !== key) {
      findings.push({
        severity: "low",
        category: "secret_exposure",
        location,
        description: `Step "${stepName}" maps secret to non-uppercase env var "${key}". Convention: secret env vars should be UPPER_CASE.`,
        recommendation: `Rename to ${key.toUpperCase()}.`,
      });
    }
  }
}

function checkTriggers(on: unknown, findings: Finding[]): void {
  if (!on || typeof on !== "object") return;

  const triggers = on as Record<string, unknown>;

  // pull_request_target is dangerous — runs in the context of the base branch
  if ("pull_request_target" in triggers) {
    findings.push({
      severity: "critical",
      category: "dangerous_triggers",
      location: "on.pull_request_target",
      description: "pull_request_target runs with write permissions and secrets access in the context of the base branch. Attackers can submit PRs that execute arbitrary code with repository write access.",
      recommendation: "Avoid pull_request_target unless absolutely necessary. If used, never checkout the PR head ref or run untrusted code.",
    });
  }

  // workflow_dispatch with no input validation
  if ("workflow_dispatch" in triggers) {
    const dispatch = triggers.workflow_dispatch as Record<string, unknown> | null;
    if (!dispatch?.inputs) {
      findings.push({
        severity: "info",
        category: "dangerous_triggers",
        location: "on.workflow_dispatch",
        description: "workflow_dispatch with no defined inputs. Any user with write access can trigger this workflow.",
        recommendation: "Define explicit inputs with descriptions and constraints if the workflow performs sensitive operations.",
      });
    }
  }
}
