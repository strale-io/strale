// The pages the review pass screenshots: one of each page type, comma-separated.
// Generated pages are represented by stable examples. Extend as page types land.
export const REVIEW_PAGES = ["/"];
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) console.log(REVIEW_PAGES.join(","));
