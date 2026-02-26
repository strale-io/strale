import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";

registerCapability("accessibility-audit", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const html = await fetchRenderedHtml(fullUrl);

  const violations: Array<{ severity: string; rule: string; element: string; description: string; fix: string }> = [];
  const passes: string[] = [];

  // 1. Image alt text
  const imgs = html.match(/<img[^>]*>/gi) ?? [];
  const imgsNoAlt = imgs.filter((img) => !img.match(/alt\s*=\s*["'][^"']+/i));
  const decorativeImgs = imgs.filter((img) => img.match(/alt\s*=\s*["']\s*["']/i));
  if (imgsNoAlt.length > 0) {
    violations.push({
      severity: "critical",
      rule: "WCAG 1.1.1 - Non-text Content",
      element: `${imgsNoAlt.length} <img> tags`,
      description: `${imgsNoAlt.length} images missing alt attribute`,
      fix: "Add descriptive alt text to all informational images, or alt='' for decorative images",
    });
  } else if (imgs.length > 0) {
    passes.push(`All ${imgs.length} images have alt attributes`);
  }

  // 2. Form labels
  const inputs = html.match(/<input[^>]*>/gi) ?? [];
  const textInputs = inputs.filter((i) => !i.match(/type\s*=\s*["'](hidden|submit|button|image|reset)/i));
  const inputsWithLabel = textInputs.filter((i) => {
    const idMatch = i.match(/id\s*=\s*["']([^"']+)/i);
    if (!idMatch) return false;
    return html.includes(`for="${idMatch[1]}"`);
  });
  const inputsWithAria = textInputs.filter((i) => i.match(/aria-label/i));
  const unlabeledInputs = textInputs.length - inputsWithLabel.length - inputsWithAria.length;
  if (unlabeledInputs > 0) {
    violations.push({
      severity: "critical",
      rule: "WCAG 1.3.1 - Info and Relationships",
      element: `${unlabeledInputs} <input> elements`,
      description: `${unlabeledInputs} form inputs without associated labels`,
      fix: "Add <label for='id'> or aria-label to all form inputs",
    });
  } else if (textInputs.length > 0) {
    passes.push("All form inputs have associated labels");
  }

  // 3. Heading hierarchy
  const headings: number[] = [];
  const headingRegex = /<h([1-6])[^>]*>/gi;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    headings.push(Number(hMatch[1]));
  }
  let headingSkips = 0;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] > headings[i - 1] + 1) headingSkips++;
  }
  if (headingSkips > 0) {
    violations.push({
      severity: "medium",
      rule: "WCAG 1.3.1 - Heading Hierarchy",
      element: `${headingSkips} heading level skips`,
      description: "Heading levels skip (e.g. h1 → h3 without h2)",
      fix: "Ensure heading levels increment by one (h1 → h2 → h3)",
    });
  } else if (headings.length > 0) {
    passes.push("Heading hierarchy is sequential");
  }
  if (!headings.includes(1)) {
    violations.push({
      severity: "medium",
      rule: "WCAG 1.3.1 - Page Structure",
      element: "<h1>",
      description: "No <h1> element found on the page",
      fix: "Add exactly one <h1> element as the main page heading",
    });
  }

  // 4. Color contrast (heuristic: check for very light text colors in inline styles)
  const lightColors = html.match(/color\s*:\s*#(?:fff|FFF|fefefe|f[0-9a-f]{5}|e[0-9a-f]{5})\b/gi) ?? [];
  if (lightColors.length > 0) {
    violations.push({
      severity: "medium",
      rule: "WCAG 1.4.3 - Contrast (Minimum)",
      element: `${lightColors.length} inline styles`,
      description: "Very light text colors detected in inline styles (may fail contrast requirements)",
      fix: "Ensure text has minimum 4.5:1 contrast ratio against background",
    });
  }

  // 5. ARIA roles
  const ariaRoles = html.match(/role\s*=\s*["'][^"']+/gi) ?? [];
  const landmarks = html.match(/role\s*=\s*["'](main|navigation|banner|contentinfo|complementary|search)/gi) ?? [];
  if (landmarks.length === 0) {
    const hasNav = /<nav[^>]*>/i.test(html);
    const hasMain = /<main[^>]*>/i.test(html);
    const hasHeader = /<header[^>]*>/i.test(html);
    const hasFooter = /<footer[^>]*>/i.test(html);
    if (!hasNav && !hasMain) {
      violations.push({
        severity: "low",
        rule: "WCAG 1.3.1 - Landmark Regions",
        element: "page structure",
        description: "No landmark regions found (nav, main, header, footer elements or ARIA roles)",
        fix: "Use semantic HTML5 elements (nav, main, header, footer) or ARIA landmark roles",
      });
    } else {
      passes.push("Semantic HTML5 landmark elements found");
    }
  } else {
    passes.push(`${landmarks.length} ARIA landmark roles found`);
  }

  // 6. Link text quality
  const linkTexts = (html.match(/<a[^>]*>([\s\S]*?)<\/a>/gi) ?? [])
    .map((a) => a.replace(/<[^>]+>/g, "").trim().toLowerCase())
    .filter(Boolean);
  const badLinkTexts = linkTexts.filter((t) =>
    ["click here", "here", "read more", "more", "link", "this"].includes(t),
  );
  if (badLinkTexts.length > 0) {
    violations.push({
      severity: "low",
      rule: "WCAG 2.4.4 - Link Purpose",
      element: `${badLinkTexts.length} links`,
      description: `${badLinkTexts.length} links with generic text (e.g. "click here", "read more")`,
      fix: "Use descriptive link text that indicates the destination or purpose",
    });
  } else if (linkTexts.length > 0) {
    passes.push("All links have descriptive text");
  }

  // 7. Language attribute
  const hasLang = /<html[^>]*lang\s*=\s*["'][^"']+/i.test(html);
  if (!hasLang) {
    violations.push({
      severity: "medium",
      rule: "WCAG 3.1.1 - Language of Page",
      element: "<html>",
      description: "No lang attribute on <html> element",
      fix: 'Add lang attribute: <html lang="en">',
    });
  } else {
    passes.push("Page language is declared");
  }

  // 8. Viewport / mobile
  const hasViewport = /name\s*=\s*["']viewport["']/i.test(html);
  if (!hasViewport) {
    violations.push({
      severity: "low",
      rule: "WCAG 1.4.10 - Reflow",
      element: "<meta viewport>",
      description: "No viewport meta tag found",
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
    });
  } else {
    passes.push("Viewport meta tag present");
  }

  // Calculate score
  const criticalCount = violations.filter((v) => v.severity === "critical").length;
  const mediumCount = violations.filter((v) => v.severity === "medium").length;
  const lowCount = violations.filter((v) => v.severity === "low").length;
  const score = Math.max(0, 100 - (criticalCount * 20) - (mediumCount * 10) - (lowCount * 5));

  return {
    output: {
      url: fullUrl,
      score,
      violation_count: violations.length,
      violations,
      passes,
      summary: {
        critical: criticalCount,
        medium: mediumCount,
        low: lowCount,
        passed_checks: passes.length,
      },
      manual_review_needed: [
        "Keyboard navigation and focus management",
        "Screen reader compatibility",
        "Color contrast for all text (not just inline styles)",
        "Dynamic content accessibility",
        "Video captions and audio descriptions",
      ],
    },
    provenance: { source: "html-analysis", fetched_at: new Date().toISOString() },
  };
});
