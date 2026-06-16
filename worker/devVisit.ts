/**
 * Dev utility: act as a real visitor. Loads a page in a normal browser (NO renderer flag) so the
 * embedded <script> fires and notifies the ingest API — the true embed → ingest → render → report
 * path. Not part of production; just for local verification.
 *
 *   pnpm dev:visit                                  # visits http://localhost:3000/demo/index.html
 *   DEMO_URL=http://localhost:3000/demo/index.html pnpm dev:visit
 */
import { chromium } from "playwright";

const url = process.env.DEMO_URL ?? "http://localhost:3000/demo/index.html";

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(url, { waitUntil: "load" }).catch(() => {});
await page.waitForTimeout(2500); // let the embed debounce + send
await browser.close();
console.log("visited", url, "— embed should have notified the ingest API");
