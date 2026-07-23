#!/usr/bin/env node
// Machine-local MODEL-OS observation store. Registry and policy are ratified,
// git-tracked inputs; this module writes only observations.json under
// $MODEL_OS_STATE_DIR (default: ~/.model-os).

import {
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { CONFIDENCE_LEVELS, SUPPORTED_SCHEMA_VERSIONS } from "./schema.mjs";

export const OBSERVATION_FILE = "observations.json";
export const CONFIDENCE = CONFIDENCE_LEVELS;

export function resolveStateDir(stateDir = null) {
  return path.resolve(stateDir || process.env.MODEL_OS_STATE_DIR || path.join(os.homedir(), ".model-os"));
}

export function observationPath(stateDir = null) {
  return path.join(resolveStateDir(stateDir), OBSERVATION_FILE);
}

function emptyStore(errors = []) {
  return { schema_version: SUPPORTED_SCHEMA_VERSIONS.observations, observations: {}, errors };
}

export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}

function readLockRecord(lockPath) {
  try { return JSON.parse(readFileSync(lockPath, "utf8")); }
  catch { return null; }
}

export function acquireWriteLock(dir, { staleMs = 30_000, maxAttempts = 50, waitMs = 20,
  lockName = `${OBSERVATION_FILE}.lock`, platform = process.platform,
  openExclusive = openSync, processAliveCheck = processAlive } = {}) {
  mkdirSync(dir, { recursive: true });
  if (typeof lockName !== "string" || !lockName || path.basename(lockName) !== lockName) {
    throw new Error("write lock name must be a basename");
  }
  const lockPath = path.join(dir, lockName);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = randomUUID();
    try {
      const handle = openExclusive(lockPath, "wx");
      try {
        writeFileSync(handle, JSON.stringify({ token, pid: process.pid, created_at: new Date().toISOString() }));
        return { handle, lockPath, token };
      } catch (error) {
        closeSync(handle);
        rmSync(lockPath, { force: true });
        throw error;
      }
    } catch (error) {
      const contention = error?.code === "EEXIST" ||
        (platform === "win32" && (error?.code === "EPERM" || error?.code === "EACCES"));
      if (!contention) throw error;
      try {
        const record = readLockRecord(lockPath);
        const oldEnough = staleMs === 0 || Date.now() - statSync(lockPath).mtimeMs >= staleMs;
        if (oldEnough && !processAliveCheck(record?.pid)) {
          const confirmed = readLockRecord(lockPath);
          if (confirmed?.token === record?.token) rmSync(lockPath, { force: true });
          continue;
        }
      } catch { /* another writer may have released it between checks */ }
      if (waitMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
  throw new Error(`observation store write lock timed out (${lockPath})`);
}

export function releaseWriteLock(lock) {
  if (!lock) return false;
  try { closeSync(lock.handle); } catch {}
  const current = readLockRecord(lock.lockPath);
  if (current?.token !== lock.token) return false;
  rmSync(lock.lockPath, { force: true });
  return true;
}

export function validateObservation(observation) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    throw new Error("observation must be an object");
  }
  if (typeof observation.state !== "string" || !observation.state.trim()) {
    throw new Error("observation.state is required");
  }
  if (typeof observation.observed_at !== "string" || !Number.isFinite(Date.parse(observation.observed_at))) {
    throw new Error("observation.observed_at must be an ISO date");
  }
  if (typeof observation.source !== "string" || !observation.source.trim()) {
    throw new Error("observation.source is required");
  }
  if (!CONFIDENCE.has(observation.confidence)) {
    throw new Error("observation.confidence must be low/medium/high");
  }
  if (!Number.isFinite(observation.ttl) || observation.ttl <= 0) {
    throw new Error("observation.ttl must be a positive number of seconds");
  }
  return true;
}

export function readObservationStore({ stateDir = null } = {}) {
  const file = observationPath(stateDir);
  if (!existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || parsed.schema_version !== SUPPORTED_SCHEMA_VERSIONS.observations || !parsed.observations ||
        typeof parsed.observations !== "object" || Array.isArray(parsed.observations)) {
      return emptyStore([`observation store schema invalid (${file})`]);
    }
    return { schema_version: SUPPORTED_SCHEMA_VERSIONS.observations, observations: parsed.observations, errors: [] };
  } catch (error) {
    return emptyStore([`observation store unreadable (${file}): ${error.message}`]);
  }
}

export function effectiveObservation(observation, now = new Date().toISOString()) {
  if (!observation) return { state: "unknown", reason: "missing", fresh: false };
  try {
    validateObservation(observation);
  } catch (error) {
    return { state: "unknown", reason: "invalid", detail: error.message, fresh: false };
  }
  const nowMs = Date.parse(now);
  const observedMs = Date.parse(observation.observed_at);
  if (!Number.isFinite(nowMs)) return { state: "unknown", reason: "invalid-now", fresh: false };
  if (observedMs > nowMs + 300000) return { state: "unknown", reason: "future-observation", fresh: false };
  if (nowMs >= observedMs + observation.ttl * 1000) {
    return { state: "unknown", reason: "expired", observed_at: observation.observed_at, ttl: observation.ttl, fresh: false };
  }
  return { ...observation, fresh: true };
}

export function getObservation(store, key, now = new Date().toISOString()) {
  if (!key) return { state: "unknown", reason: "missing-pointer" };
  return effectiveObservation(store && store.observations ? store.observations[key] : null, now);
}

export function atomicWriteFile(file, contents, { encoding = "utf8", beforeRename = null } = {}) {
  const resolved = path.resolve(file);
  const dir = path.dirname(resolved);
  mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, contents, { encoding, flag: "wx" });
    if (beforeRename) beforeRename({ file: resolved, temp });
    renameSync(temp, resolved);
  } finally { rmSync(temp, { force: true }); }
  return resolved;
}

export function appendBoundedJsonl({ stateDir = null, fileName, row, maxEntries }) {
  if (typeof fileName !== "string" || !fileName || path.basename(fileName) !== fileName) {
    throw new Error("JSONL fileName must be a basename");
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("maxEntries must be a positive integer");
  const dir = resolveStateDir(stateDir);
  const file = path.join(dir, fileName);
  const lock = acquireWriteLock(dir, { lockName: `${fileName}.lock` });
  try {
    const current = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : [];
    const all = [...current, JSON.stringify(row)];
    const kept = all.slice(-maxEntries);
    atomicWriteFile(file, `${kept.join("\n")}\n`);
    return { entries: kept.length, rotated: all.length - kept.length };
  } finally { releaseWriteLock(lock); }
}

export function writeObservation({ stateDir = null, key, observation }) {
  if (typeof key !== "string" || !key.trim()) throw new Error("observation key is required");
  return writeObservations({ stateDir, observations: { [key]: observation } })[key];
}

// Validate the complete batch before the first write, then replace the store atomically.
// Discovery uses this so a provider page or terms cycle cannot leave half a snapshot.
export function writeObservations({ stateDir = null, observations }) {
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) {
    throw new Error("observations batch must be an object");
  }
  for (const [key, observation] of Object.entries(observations)) {
    if (typeof key !== "string" || !key.trim()) throw new Error("observation key is required");
    validateObservation(observation);
  }
  const dir = resolveStateDir(stateDir);
  const file = observationPath(dir);
  mkdirSync(dir, { recursive: true });
  const lock = acquireWriteLock(dir);
  try {
    const current = readObservationStore({ stateDir: dir });
    if (current.errors.length) {
      throw new Error(`refusing to overwrite invalid observation store: ${current.errors.join("; ")}`);
    }
    const next = {
      schema_version: SUPPORTED_SCHEMA_VERSIONS.observations,
      observations: { ...current.observations, ...observations },
    };
    atomicWriteFile(file, JSON.stringify(next, null, 2) + "\n");
  } finally {
    releaseWriteLock(lock);
  }
  return observations;
}

export function cleanupObservationStore({ stateDir = null, retainKeys = new Set(), now = new Date().toISOString() } = {}) {
  const dir = resolveStateDir(stateDir);
  mkdirSync(dir, { recursive: true });
  const lock = acquireWriteLock(dir);
  try {
    const current = readObservationStore({ stateDir: dir });
    if (current.errors.length) throw new Error(`refusing to clean invalid observation store: ${current.errors.join("; ")}`);
    const kept = {};
    const removed = [];
    for (const [key, observation] of Object.entries(current.observations)) {
      if (retainKeys.has(key) || effectiveObservation(observation, now).fresh === true) kept[key] = observation;
      else removed.push(key);
    }
    if (removed.length) {
      const file = observationPath(dir);
      atomicWriteFile(file, JSON.stringify({ schema_version: SUPPORTED_SCHEMA_VERSIONS.observations,
        observations: kept }, null, 2) + "\n");
    }
    return { removed: removed.sort(), retained: Object.keys(kept).sort() };
  } finally { releaseWriteLock(lock); }
}

export function observationRetentionKeys(ledger, policy) {
  const keys = new Set();
  for (const model of ledger?.models || []) {
    for (const key of Object.values(model.execution_observations || {})) if (key) keys.add(key);
    for (const route of model.access_routes || []) {
      for (const field of ["catalog_observation", "entitlement_observation", "spend_guard_observation"]) {
        if (route[field]) keys.add(route[field]);
      }
    }
    for (const source of policy?.discovery?.sources || []) {
      if (source.observation_namespace) {
        keys.add(`catalog:${source.observation_namespace}:${model.id}`);
        keys.add(`entitlement:${source.observation_namespace}:${model.id}`);
      }
      if (source.id) keys.add(`candidate:${source.id}:${model.id}`);
    }
  }
  for (const resource of Object.values(policy?.quota_resources || {})) {
    if (resource.capacity_observation) keys.add(resource.capacity_observation);
  }
  for (const source of policy?.discovery?.sources || []) if (source.id) keys.add(`discovery-source:${source.id}`);
  for (const source of policy?.discovery?.terms_sources || []) if (source.id) keys.add(`terms:${source.id}`);
  for (const requirement of policy?.discovery?.cli_requirements || []) if (requirement.id) keys.add(`cli:${requirement.id}`);
  return keys;
}
