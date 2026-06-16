import { Worker } from "bullmq";
import { chromium, type Browser } from "playwright";
import { eq } from "drizzle-orm";
import { RENDER_QUEUE, type RenderJob } from "@web-access/shared";
import { runAnalysis } from "@web-access/analyzers";
import { db, schema } from "../lib/server/db";
import { env } from "../lib/server/env";
import { getConnection } from "../lib/server/queue";

const connection = getConnection();

// One shared browser process; a fresh context per job for isolation.
let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser) browser = await chromium.launch();
  return browser;
}

const worker = new Worker<RenderJob>(
  RENDER_QUEUE,
  async (job) => {
    const { scanId, url, renderedHtml } = job.data;
    await db.update(schema.scans).set({ status: "running" }).where(eq(schema.scans.id, scanId));

    const context = await (await getBrowser()).newContext();
    // Mark this as our renderer so the embed (if present on the page) no-ops and can't self-trigger.
    await context.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__WEB_ACCESS_RENDERER = true;
    });
    const page = await context.newPage();
    try {
      if (renderedHtml) {
        await page.setContent(renderedHtml, { waitUntil: "domcontentloaded" });
      } else {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: env.NAV_TIMEOUT_MS });
      }

      const findings = await runAnalysis(page);
      if (findings.length > 0) {
        await db.insert(schema.findings).values(findings.map((f) => ({ scanId, ...f })));
      }
      await db
        .update(schema.scans)
        .set({ status: "complete", completedAt: new Date() })
        .where(eq(schema.scans.id, scanId));

      return { findings: findings.length };
    } finally {
      await context.close();
    }
  },
  { connection, concurrency: env.CONCURRENCY },
);

worker.on("ready", () => console.log("worker ready — waiting for render jobs"));
worker.on("completed", (job, result) =>
  console.log(`scan ${job.data.scanId} complete:`, result),
);
worker.on("failed", async (job, err) => {
  console.error(`scan ${job?.data.scanId} failed:`, err?.message);
  if (job) {
    await db
      .update(schema.scans)
      .set({ status: "error", error: String(err?.message ?? err), completedAt: new Date() })
      .where(eq(schema.scans.id, job.data.scanId))
      .catch(() => {});
  }
});

async function shutdown(): Promise<void> {
  await worker.close();
  if (browser) await browser.close();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
