import { z } from "zod";

/**
 * Analysis tiers (see plan §2). The tier records WHERE/HOW a check is computed, which is the core
 * code-vs-AI boundary of this product:
 *   1 = deterministic on the DOM
 *   2 = deterministic but needs a real render (computed styles / geometry / pixels)
 *   3 = genuine AI judgment
 */
export const Tier = { Static: 1, Runtime: 2, Judgment: 3 } as const;
export type TierValue = (typeof Tier)[keyof typeof Tier];

/** Which analyzer produced a finding. Lets us merge/dedup across tiers later. */
export const FindingSource = z.enum(["axe", "geometry", "contrast", "ai"]);
export type FindingSource = z.infer<typeof FindingSource>;

/** axe-core severity vocabulary; null for sources that don't grade impact. */
export const Impact = z.enum(["minor", "moderate", "serious", "critical"]).nullable();
export type Impact = z.infer<typeof Impact>;

/** A single accessibility problem, normalized across all analyzers. */
export const Finding = z.object({
  /** Stable rule id, e.g. "image-alt" (axe) or "reading-order" (geometry). */
  ruleId: z.string(),
  source: FindingSource,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** WCAG success criteria this maps to, e.g. ["1.1.1"]. */
  wcag: z.array(z.string()).default([]),
  impact: Impact.default(null),
  /** CSS selector path to the offending element. */
  selector: z.string(),
  /** Short, redacted HTML snippet of the element (NOT the whole page). */
  htmlSnippet: z.string(),
  /** Human-readable description of the problem. */
  message: z.string(),
  helpUrl: z.string().url().optional(),
});
export type Finding = z.infer<typeof Finding>;

/**
 * What the embed sends to the ingest API. Kept minimal by design (plan: results-only, mask at
 * source). `renderedHtml` is the OPTIONAL handoff path for SPA/auth pages the cold render can't reach.
 */
export const IngestRequest = z.object({
  siteId: z.string().min(1),
  url: z.string().url(),
  /** Release/build identifier (build hash, or a content fingerprint the embed derived). */
  releaseId: z.string().min(1),
  /** Identifies the page TEMPLATE so we dedup per-template, not per-page (plan cost model). */
  templateFingerprint: z.string().min(1),
  /** Optional pre-rendered HTML for SPA/auth pages; masked at source before transmit. */
  renderedHtml: z.string().optional(),
});
export type IngestRequest = z.infer<typeof IngestRequest>;

export const ScanStatus = z.enum(["queued", "running", "complete", "error"]);
export type ScanStatus = z.infer<typeof ScanStatus>;

/** A report row returned to the dashboard/API consumer. */
export interface ScanReport {
  scanId: string;
  siteId: string;
  url: string;
  releaseId: string;
  templateFingerprint: string;
  status: ScanStatus;
  createdAt: string;
  completedAt: string | null;
  findings: Finding[];
  error?: string;
}

/** Name of the BullMQ queue shared between api (producer) and worker (consumer). */
export const RENDER_QUEUE = "render-scan" as const;

/** Job payload enqueued by the API and consumed by the worker. */
export interface RenderJob {
  scanId: string;
  url: string;
  renderedHtml?: string;
}
