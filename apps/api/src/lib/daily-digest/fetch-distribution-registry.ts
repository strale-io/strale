/**
 * Repo-native replacement for the digest's getDistributionSurfaces() reader
 * (M4 batch 5).
 *
 * Ports scripts/distribution-lib.mjs's repoNativeDistributionSurfaces()
 * into apps/api/src, because the production digest job runs from the built
 * Docker image, which does not carry `scripts/`. Reads
 * docs/operations/distribution-registry.yaml (schema:
 * docs/operations/distribution-registry.schema.json, validated separately
 * by `npm run distribution:check`, which stays in scripts/ since it is a CI
 * check, not a runtime path) and maps each surface row to the same
 * { name, status, daysPending, url } shape the old Notion reader returned.
 *
 * daysPending and url have no repo-native analogue in the register today
 * (the register carries status_date and a target/evidence string, not a
 * pending-since count or a URL field distinct from those), so both are
 * always null here, matching the mapping already established and tested by
 * scripts/distribution-lib.mjs's repoNativeDistributionSurfaces().
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import type { DistributionSurface } from "./types.js";

export const REPO_ROOT = resolve(import.meta.dirname, "../../../../..");
export const DISTRIBUTION_REGISTRY_PATH = "docs/operations/distribution-registry.yaml";

interface DistributionRegisterSurface {
  id: string;
  surface: string;
  status: string;
  [key: string]: unknown;
}

interface DistributionRegister {
  schema_version: number;
  authority_active: boolean;
  surfaces: DistributionRegisterSurface[];
}

export function loadRegister(root: string = REPO_ROOT): DistributionRegister {
  const text = readFileSync(resolve(root, DISTRIBUTION_REGISTRY_PATH), "utf8");
  return yaml.load(text) as DistributionRegister;
}

export function getDistributionSurfaces(root: string = REPO_ROOT): DistributionSurface[] {
  const register = loadRegister(root);
  return (register.surfaces ?? []).map((s) => ({
    name: s.surface,
    status: s.status,
    daysPending: null,
    url: null,
  }));
}
