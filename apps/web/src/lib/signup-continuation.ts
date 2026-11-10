import { campaignFromUrl, campaignLink } from "./campaign.ts";

export interface SignupTool { slug: string; name: string }
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validSlug = (slug: string) => slug.length <= 80 && SLUG.test(slug);

/** Carry only a public tool slug, never a return URL, inputs or credentials. */
export function toolSignupHref(slug?: string): string {
  return slug && validSlug(slug) ? `/signup?tool=${slug}` : "/signup";
}

/** Resolve against the same catalogue that generated the tool pages. */
export function signupContinuation(href: string, tools: readonly SignupTool[]): { name: string; href: string } | null {
  try {
    const url = new URL(href);
    const slugs = url.searchParams.getAll("tool");
    if (slugs.length !== 1 || !validSlug(slugs[0])) return null;
    const tool = tools.find((candidate) => candidate.slug === slugs[0]);
    if (!tool) return null;
    return {
      name: tool.name,
      href: campaignLink(`/tools/${tool.slug}#call-title`, href, campaignFromUrl(href)),
    };
  } catch { return null; }
}
