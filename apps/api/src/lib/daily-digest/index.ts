import type {
  DigestData,
  PlatformActivity,
  PlatformHealth,
  ShipLog,
  BeaconActivity,
  EcosystemMetrics,
  WebsiteTraffic,
  DistributionSurface,
  Priorities,
  Scoreboard,
} from "./types.js";
import { getPlatformActivity, getPlatformHealth } from "./fetch-platform.js";
import { getShipLog } from "./fetch-shiplog.js";
import { getBeaconActivity } from "./fetch-beacon.js";
import { getEcosystemMetrics } from "./fetch-ecosystem.js";
import { getWebsiteTraffic } from "./fetch-traffic.js";
import { getDistributionSurfaces, getPriorities } from "./fetch-notion.js";
import { getScoreboard } from "./fetch-scoreboard.js";
import { getYesterdaySnapshot, saveSnapshot } from "./snapshots.js";

// ── Defaults for failed fetches ───────────────────────────────────────────────

const defaultPlatformActivity: PlatformActivity = {
  signups: { count: 0, delta: 0, emails: [], internalEmails: [] },
  apiCalls: { total: 0, delta: 0, byCapability: [] },
  uniqueUsers: { count: 0, delta: 0 },
  transactions: { count: 0, delta: 0 },
  revenue: { cents: 0, delta: 0 },
  zeroActivity: true,
};

const defaultPlatformHealth: PlatformHealth = {
  circuitBreakers: [],
  testPassRate: { passed: 0, failed: 0, total: 0, rate: 0 },
  sqsChanges: [],
};

const defaultShipLog: ShipLog = {
  journalEntries: [],
  githubCommits: [],
  socialPosts: [],
};

const defaultBeacon: BeaconActivity = {
  scansLast24h: 0,
  scanDomains: [],
  newSubscribers: 0,
  totalScans: 0,
};

const defaultEcosystem: EcosystemMetrics = {
  repos: [],
  npmDownloads: [],
  pypiDownloads: [],
};

const defaultTraffic: WebsiteTraffic = {
  straleDev: { available: false, note: "Unavailable" },
  beacon: { available: false, note: "Unavailable" },
};

const defaultPriorities: Priorities = {
  unreviewedDecisions: [],
  olderUnreviewedCount: 0,
  actionRequired: [],
  olderActionRequiredCount: 0,
};

const defaultScoreboard: Scoreboard = {
  totalCapabilities: 0,
  totalSolutions: 0,
  totalUsers: 0,
  totalApiCalls: 0,
  totalBeaconScans: 0,
};

// ── Unwrap helper ─────────────────────────────────────────────────────────────

function unwrap<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === "fulfilled") return result.value;
  console.warn(`[digest] ${label} failed:`, result.reason);
  return fallback;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function gatherDigestData(): Promise<DigestData> {
  const yesterday = await getYesterdaySnapshot();

  // Fetch beacon first (needed for scoreboard)
  const beaconResult = await getBeaconActivity().catch((err) => {
    console.warn("[digest] beacon failed:", err);
    return defaultBeacon;
  });

  const [
    platformActivityResult,
    platformHealthResult,
    shipLogResult,
    ecosystemResult,
    trafficResult,
    distributionResult,
    prioritiesResult,
    scoreboardResult,
  ] = await Promise.allSettled([
    getPlatformActivity(yesterday),
    getPlatformHealth(),
    getShipLog(),
    getEcosystemMetrics(yesterday),
    getWebsiteTraffic(),
    getDistributionSurfaces(),
    getPriorities(),
    getScoreboard(beaconResult.totalScans),
  ]);

  const data: DigestData = {
    generatedAt: new Date().toISOString(),
    platformActivity: unwrap(platformActivityResult, defaultPlatformActivity, "platformActivity"),
    platformHealth: unwrap(platformHealthResult, defaultPlatformHealth, "platformHealth"),
    shipLog: unwrap(shipLogResult, defaultShipLog, "shipLog"),
    beaconActivity: beaconResult,
    ecosystem: unwrap(ecosystemResult, defaultEcosystem, "ecosystem"),
    websiteTraffic: unwrap(trafficResult, defaultTraffic, "websiteTraffic"),
    distributionSurfaces: unwrap(distributionResult, [] as DistributionSurface[], "distributionSurfaces"),
    priorities: unwrap(prioritiesResult, defaultPriorities, "priorities"),
    scoreboard: unwrap(scoreboardResult, defaultScoreboard, "scoreboard"),
    yesterdaySnapshot: yesterday,
  };

  // Save snapshot for tomorrow's delta computation
  await saveSnapshot(data).catch((err) =>
    console.warn("[digest] Failed to save snapshot:", err),
  );

  return data;
}

export { saveSnapshot, getYesterdaySnapshot } from "./snapshots.js";
export type { DigestData } from "./types.js";
