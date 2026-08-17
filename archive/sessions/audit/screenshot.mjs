import { chromium } from "playwright";
import path from "path";

const BASE = "http://localhost:3002";
const OUT = path.resolve("audit/screenshots");

const PAGES = [
  { name: "home", path: "/" },
  { name: "capabilities", path: "/capabilities" },
  { name: "pricing", path: "/pricing" },
  { name: "docs", path: "/docs" },
  { name: "signup", path: "/signup" },
  { name: "capability-detail", path: "/capabilities/swedish-company-data" },
  { name: "docs-quickstart", path: "/docs/getting-started" },
  { name: "docs-mcp", path: "/docs/integrations/mcp" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
];

async function run() {
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    for (const pg of PAGES) {
      const url = `${BASE}${pg.path}`;
      console.log(`${vp.name} → ${pg.name} (${url})`);
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const file = path.join(OUT, `${pg.name}-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  saved → ${file}`);
    }

    await context.close();
  }

  await browser.close();
  console.log("Done.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
