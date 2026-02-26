// Capability executor registry
// Each capability is a TypeScript function that receives structured input
// and returns structured output + provenance.

export interface CapabilityInput {
  [key: string]: unknown;
}

export interface CapabilityResult {
  output: Record<string, unknown>;
  provenance: {
    source: string;
    fetched_at: string;
  };
}

export type CapabilityExecutor = (
  input: CapabilityInput,
) => Promise<CapabilityResult>;

// Registry maps slug → executor function
const executors = new Map<string, CapabilityExecutor>();

export function registerCapability(
  slug: string,
  executor: CapabilityExecutor,
): void {
  executors.set(slug, executor);
}

export function getExecutor(slug: string): CapabilityExecutor | undefined {
  return executors.get(slug);
}
