import "server-only";

import { chromium } from "playwright";

/**
 * Render a self-contained HTML document to a PDF using the same Chromium that the worker already
 * depends on (no new dependency). Used for the conformance certificate. Launches a browser per call
 * — certificate downloads are infrequent, so the simplicity is worth more than pooling here.
 *
 * The caller is responsible for the fallback if this throws (e.g. Chromium not installed in the web
 * process): the certificate route serves the printable HTML instead, so the feature degrades.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
  } finally {
    await browser.close();
  }
}
