// Renders tools/og.html to public/og.jpg (1200x630). Needs the site served at http://localhost:4317
// (bunx serve public -p 4317) and Playwright's Chromium (bunx playwright install chromium).
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const browser = await chromium.launch({ executablePath: chromium.executablePath() });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// og.html isn't part of the site, so it's loaded into the served site's origin for its /assets and /scripts.
await page.goto("http://localhost:4317/");
await page.setContent(readFileSync("tools/og.html", "utf8"));
await page.waitForTimeout(2000);
await page.screenshot({ path: "og.png" });
await browser.close();
// JPEG keeps it small for chat and social previews; the PNG is only the intermediate.
execSync("python3 -c \"from PIL import Image; Image.open('og.png').convert('RGB').save('public/og.jpg', quality=86, optimize=True, progressive=True)\" && rm og.png");
