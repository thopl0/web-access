import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { and, desc, eq } from "drizzle-orm";
import {
  IngestRequest,
  type Finding,
  type Impact,
  type ScanReport,
  type ScanStatus,
} from "@web-access/shared";
import { db, schema } from "./db/index.js";
import { renderQueue } from "./queue.js";
import { env } from "./env.js";

type ScanRow = typeof schema.scans.$inferSelect;
type FindingRow = typeof schema.findings.$inferSelect;

function toReport(scan: ScanRow, rows: FindingRow[]): ScanReport {
  const findings: Finding[] = rows.map((r) => ({
    ruleId: r.ruleId,
    source: r.source as Finding["source"],
    tier: r.tier as Finding["tier"],
    wcag: r.wcag ?? [],
    impact: (r.impact ?? null) as Impact,
    selector: r.selector,
    htmlSnippet: r.htmlSnippet,
    message: r.message,
    ...(r.helpUrl ? { helpUrl: r.helpUrl } : {}),
  }));
  return {
    scanId: scan.id,
    siteId: scan.siteId,
    url: scan.url,
    releaseId: scan.releaseId,
    templateFingerprint: scan.templateFingerprint,
    status: scan.status as ScanStatus,
    createdAt: scan.createdAt.toISOString(),
    completedAt: scan.completedAt ? scan.completedAt.toISOString() : null,
    findings,
    ...(scan.error ? { error: scan.error } : {}),
  };
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// Dev convenience: serve the demo page and the built embed so the whole loop can run locally.
const here = dirname(fileURLToPath(import.meta.url));
await app.register(fastifyStatic, {
  root: resolve(here, "../../../demo"),
  prefix: "/demo/",
});
await app.register(fastifyStatic, {
  root: resolve(here, "../../../packages/embed/dist"),
  prefix: "/embed/",
  decorateReply: false,
});

app.get("/health", async () => ({ ok: true }));

// What the embed calls. Dedups per (site, release, template) and enqueues a render job.
app.post("/v1/ingest", async (req, reply) => {
  const parsed = IngestRequest.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
  }
  const { siteId, url, releaseId, templateFingerprint, renderedHtml } = parsed.data;
  const scanId = randomUUID();

  const inserted = await db
    .insert(schema.scans)
    .values({ id: scanId, siteId, url, releaseId, templateFingerprint, status: "queued" })
    .onConflictDoNothing({
      target: [schema.scans.siteId, schema.scans.releaseId, schema.scans.templateFingerprint],
    })
    .returning({ id: schema.scans.id });

  if (inserted.length === 0) {
    // Already scanned this (site, release, template) — dedup, don't re-render.
    const existing = await db
      .select({ id: schema.scans.id })
      .from(schema.scans)
      .where(
        and(
          eq(schema.scans.siteId, siteId),
          eq(schema.scans.releaseId, releaseId),
          eq(schema.scans.templateFingerprint, templateFingerprint),
        ),
      )
      .limit(1);
    return reply.code(200).send({ scanId: existing[0]?.id ?? null, deduped: true });
  }

  await renderQueue.add(
    "scan",
    { scanId, url, ...(renderedHtml ? { renderedHtml } : {}) },
    { removeOnComplete: 500, removeOnFail: 500, attempts: 2 },
  );
  return reply.code(202).send({ scanId, deduped: false });
});

// Latest scans (with findings) for a site — the report surface.
app.get("/v1/reports/:siteId", async (req) => {
  const { siteId } = req.params as { siteId: string };
  const scans = await db
    .select()
    .from(schema.scans)
    .where(eq(schema.scans.siteId, siteId))
    .orderBy(desc(schema.scans.createdAt))
    .limit(50);

  const reports: ScanReport[] = [];
  for (const scan of scans) {
    const rows = await db
      .select()
      .from(schema.findings)
      .where(eq(schema.findings.scanId, scan.id));
    reports.push(toReport(scan, rows));
  }
  return { siteId, scans: reports };
});

// A single scan by id.
app.get("/v1/scans/:scanId", async (req, reply) => {
  const { scanId } = req.params as { scanId: string };
  const found = await db.select().from(schema.scans).where(eq(schema.scans.id, scanId)).limit(1);
  const scan = found[0];
  if (!scan) return reply.code(404).send({ error: "not_found" });
  const rows = await db.select().from(schema.findings).where(eq(schema.findings.scanId, scanId));
  return toReport(scan, rows);
});

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
app.log.info(`api listening on :${env.API_PORT}`);
