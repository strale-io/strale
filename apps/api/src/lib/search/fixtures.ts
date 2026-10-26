/** Public snapshot wire shape, independent of database/SDK imports. */
export interface FixtureItem {
  type: "solution" | "capability";
  slug: string;
  name: string;
  description: string;
  category: string;
  geography: string | null;
  search_tags: string[];
  steps?: string[];
  is_free_tier?: boolean;
  price_cents: number;
}
