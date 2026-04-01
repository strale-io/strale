export interface PlatformActivity {
  signups: { count: number; delta: number; emails: string[] };
  apiCalls: { total: number; delta: number; byCapability: Array<{ slug: string; count: number }> };
  uniqueUsers: { count: number; delta: number };
  transactions: { count: number; delta: number };
  revenue: { cents: number; delta: number };
  zeroActivity: boolean;
}

export interface PlatformHealth {
  circuitBreakers: Array<{ slug: string; state: string; consecutiveFailures: number; lastFailureAt: string | null }>;
  testPassRate: { passed: number; failed: number; total: number; rate: number };
  sqsChanges: Array<{ slug: string; oldGrade: string; newGrade: string; direction: "up" | "down" }>;
}

export interface ShipLog {
  journalEntries: Array<{ title: string; type: string; createdAt: string }>;
  githubCommits: Array<{ repo: string; message: string; sha: string; author: string; date: string }>;
  socialPosts: Array<{ title: string; platform: string; createdAt: string }>;
}

export interface BeaconActivity {
  scansLast24h: number;
  scanDomains: string[];
  newSubscribers: number;
  totalScans: number;
}

export interface EcosystemMetrics {
  repos: Array<{ name: string; stars: number; starsDelta: number; forks: number; openIssues: number; openPRs: number }>;
  npmDownloads: Array<{ package: string; weeklyDownloads: number }>;
  pypiDownloads: Array<{ package: string; recentDownloads: number }>;
}

export interface DistributionSurface {
  name: string;
  status: string;
  daysPending: number | null;
  url: string | null;
}

export interface Priorities {
  unreviewedDecisions: Array<{ id: string; title: string; date: string }>;
  actionRequired: Array<{ title: string; createdAt: string }>;
}

export interface Scoreboard {
  totalCapabilities: number;
  totalSolutions: number;
  totalUsers: number;
  totalApiCalls: number;
  totalBeaconScans: number;
}

export interface DigestData {
  generatedAt: string;
  platformActivity: PlatformActivity;
  platformHealth: PlatformHealth;
  shipLog: ShipLog;
  beaconActivity: BeaconActivity;
  ecosystem: EcosystemMetrics;
  distributionSurfaces: DistributionSurface[];
  priorities: Priorities;
  scoreboard: Scoreboard;
  yesterdaySnapshot: Partial<Scoreboard> | null;
}
