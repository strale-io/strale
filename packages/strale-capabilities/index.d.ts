export interface Capability {
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  input_schema: Record<string, unknown> | null;
}

/** All capabilities. */
export declare const capabilities: Capability[];

/** All category strings. */
export declare const categories: string[];

/** Total capability count. */
export declare const totalCount: number;

/** Timestamp when the catalog was generated. */
export declare const generatedAt: string;

/** Find a capability by slug. */
export declare function find(slug: string): Capability | null;

/** Filter capabilities by category. */
export declare function byCategory(category: string): Capability[];

/** Keyword search across slug, name, and description. */
export declare function search(query: string): Capability[];
