

// Shared capability type for execution functions
export type CapabilityInfo = {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  lifecycleState: string;
  capabilityType: string;
  transparencyTag: string | null;
  dataSource: string | null;
  dataClassification: string | null;
  freshnessCategory: string | null;
  // Routing only. An earlier comment here said the invocation-fact writer
  // derives is_free_tier from this field; it does not, and has not since the
  // derivation was replaced by computeServedFree(). The field was already
  // selected before WP9 and is used to choose an execution path.
  isFreeTier: boolean;
  dataUpdateCycleDays: number | null;
  datasetLastUpdated: Date | null;
  // SA.2b (F-A-003, F-A-009): manifest-declared PII classification.
  // SA.2b.d: NOT NULL post migration 0050.
  processesPersonalData: boolean;
  personalDataCategories: string[] | null;
};

