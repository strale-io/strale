import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("./operator-db.js", () => ({
  openOperatorWriteDrizzle: vi.fn().mockReturnValue({ operator: true }),
}));
vi.mock("../capabilities/auto-register.js", () => ({
  autoRegisterCapabilities: vi.fn(),
}));
vi.mock("./onboarding-pipeline.js", () => ({
  runOnboarding: vi.fn(),
  validateOnboardingManifest: vi.fn(),
}));
import {
  runOnboarding,
  validateOnboardingManifest,
} from "./onboarding-pipeline.js";
import { openOperatorWriteDrizzle } from "./operator-db.js";
import { describeAuthority } from "./production-authority.js";
import { main } from "../../scripts/onboard.js";
const originalArgv = process.argv;
afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});
it("CLI uses the shared pipeline, retains operator authority, and writes returned YAML", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "onboarding-cli-"));
  const path = resolve(directory, "sample-tool.yaml");
  try {
    writeFileSync(path, "slug: sample-tool\n");
    vi.mocked(runOnboarding).mockResolvedValue({
      status: "success",
      slug: "sample-tool",
      errors: [],
      updatedManifestYaml: "slug: sample-tool\nname: Discovered\n",
      timeMs: 3,
    } as any);
    process.argv = [
      "node",
      "onboard.ts",
      "--manifest",
      path,
      "--backfill",
      "--discover",
      "--fix",
      "--strict",
      "--force",
    ];
    vi.spyOn(console, "log").mockImplementation(() => {});
    await main();
    expect(runOnboarding).toHaveBeenCalledWith(
      { operator: true },
      expect.objectContaining({
        manifestYaml: "slug: sample-tool\n",
        mode: "backfill",
        discover: true,
        fix: true,
        strict: true,
        force: true,
      })
    );
    expect(
      describeAuthority(vi.mocked(openOperatorWriteDrizzle).mock.calls[0][0])
    ).toMatchObject({
      authority_kind: "AUTONOMOUS_POLICY",
      authority_purpose: "capability_onboarding",
      authority_policy: "DEC-20260812-A",
    });
    expect(readFileSync(path, "utf-8")).toContain("name: Discovered");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("validates every batch manifest before any writes", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "onboarding-cli-batch-"));
  try {
    writeFileSync(resolve(directory, "first.yaml"), "slug: first-tool\n");
    writeFileSync(resolve(directory, "second.yaml"), "slug: second-tool\n");
    vi.mocked(runOnboarding).mockClear();
    vi.mocked(validateOnboardingManifest)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["Missing required field"]);
    process.argv = [
      "node",
      "onboard.ts",
      "--batch",
      "--manifest-dir",
      directory,
    ];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("stopped");
    });
    await expect(main()).rejects.toThrow("stopped");
    expect(validateOnboardingManifest).toHaveBeenCalledTimes(2);
    expect(runOnboarding).not.toHaveBeenCalled();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
