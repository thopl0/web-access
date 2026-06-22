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
  /**
   * TRANSIENT, NEVER-PERSISTED: a ready-made fix a Tier-3 judge already had in hand when it produced
   * the finding, so the worker can store it directly instead of paying for a second (and worse) fix
   * pass. Today the sole producer is the Gemma VISION judge: it already pays to look at the image to
   * decide the finding, so in that SAME call it also writes pixel-grounded alt text — far better than
   * the text-only GLM fixer's filename/context guess. `after` is the corrected element markup;
   * `note` is the owner-facing caveat.
   *
   * Lifecycle: PRODUCED by the judge (visionJudge.ts) → CONSUMED by the worker when building
   * fix_suggestions (worker/index.ts: written straight into a fix row, and that finding is excluded
   * from the GLM fix batch) → STRIPPED before the finding row is inserted (the `findings` table has
   * NO such column). Optional/additive so every existing Finding creator and the eval harness keep
   * compiling.
   */
  aiFix: z.object({ after: z.string(), note: z.string().optional() }).optional(),
});
export type Finding = z.infer<typeof Finding>;

/**
 * How a fix suggestion was produced. `deterministic` = a templated, mechanical transform where the
 * corrected markup is unambiguous (e.g. adding `lang="en"`); safe to apply as-is unless it had to
 * insert a human-wording placeholder. `ai` = a GLM-derived suggestion for a judgment call (alt-text
 * content, ambiguous link text); ALWAYS needs human review and is never auto-applied (the coding-plan
 * endpoint is text-only, so AI markup is context/filename-derived, not pixel-grounded — see glm.ts).
 */
export const FixKind = z.enum(["deterministic", "ai"]);
export type FixKind = z.infer<typeof FixKind>;

/**
 * The SAFE, NON-VISUAL attribute allowlist for runtime remediation (Phase C). These are the ONLY
 * attributes the embed is ever allowed to patch onto the live DOM, because they change ONLY how
 * assistive tech perceives an element — never its layout, paint, or behaviour. Adding (say) `style`,
 * `class`, or `href` here would let a remediation visibly alter or break the host page, which is
 * explicitly out of scope: Phase C is non-visual attribute patches only. Enforced everywhere a patch
 * is accepted, stored, served, or applied (approval action, manifest builder, endpoint, embed).
 */
export const SAFE_REMEDIATION_ATTRS = [
  "alt",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "lang",
  "role",
  "title",
  "aria-hidden",
] as const;
export type SafeRemediationAttr = (typeof SAFE_REMEDIATION_ATTRS)[number];

/** Is `attr` in the safe non-visual allowlist? The single gate every layer calls. */
export function isSafeRemediationAttr(attr: string): attr is SafeRemediationAttr {
  return (SAFE_REMEDIATION_ATTRS as readonly string[]).includes(attr);
}

/**
 * One concrete attribute patch — set `attr` to `value` on an element. The structured counterpart to a
 * before→after markup diff: where `FixSuggestion.after` is human-readable markup to paste, an
 * `AttributePatch` is machine-applicable data the runtime can `setAttribute` with directly. `attr` is
 * restricted to the SAFE_REMEDIATION_ATTRS allowlist (validated by the schema below).
 */
export const AttributePatch = z.object({
  attr: z.enum(SAFE_REMEDIATION_ATTRS),
  value: z.string(),
});
export type AttributePatch = z.infer<typeof AttributePatch>;

/**
 * A concrete before→after code fix for one finding — the product's core differentiator over generic
 * audit tools. `before` is the original element markup; `after` is the corrected markup an owner can
 * paste into their builder. Mirrors the `fixSuggestions` table (keyed by findingId). `needsReview` is
 * true whenever a human must confirm wording (any AI fix, or a deterministic fix that inserted a
 * placeholder like an empty aria-label); `note` explains what still needs a human decision.
 *
 * `attributePatch` is the OPTIONAL structured form of the same fix, present only for the safe
 * non-visual subset (lang/alt/role/aria-*) — it's what Phase C's runtime remediation applies once the
 * owner explicitly approves it. Absent for fixes that aren't a simple attribute set (e.g. a markup
 * restructure), so its presence is exactly "this fix is eligible to be applied live".
 */
export const FixSuggestion = z.object({
  /** The rule this fix addresses (carried for batch/report joins; same as the finding's ruleId). */
  ruleId: z.string().optional(),
  kind: FixKind,
  /** Original element markup. */
  before: z.string(),
  /** Corrected element markup. */
  after: z.string(),
  /** True when a human must confirm the result (AI suggestions, or an inserted placeholder). */
  needsReview: z.boolean(),
  /** Short note on what still needs a human decision (e.g. "replace the placeholder label"). */
  note: z.string().optional(),
  /** Structured safe-attribute form of this fix, when it's a non-visual attribute set (Phase C). */
  attributePatch: z.array(AttributePatch).optional(),
});
export type FixSuggestion = z.infer<typeof FixSuggestion>;

/**
 * Runtime remediation (Phase C). With the owner's explicit, per-fix approval, the embed applies these
 * safe attribute patches to the live DOM at page load — a TEMPORARY, non-visual patch while the owner
 * fixes the source (the source fix stays primary). A `RemediationEntry` groups every approved patch
 * for one CSS `selector`; the `RemediationManifest` is the full set the public endpoint serves to the
 * embed. Only ever contains owner-approved patches restricted to SAFE_REMEDIATION_ATTRS.
 */
export const RemediationEntry = z.object({
  selector: z.string(),
  patches: z.array(AttributePatch),
});
export type RemediationEntry = z.infer<typeof RemediationEntry>;

export const RemediationManifest = z.object({
  entries: z.array(RemediationEntry),
});
export type RemediationManifest = z.infer<typeof RemediationManifest>;

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

/**
 * Lifecycle of a registered site. `pending` = registered but the embed has never been seen;
 * `verified` = we've confirmed the snippet is live (a ping arrived, or an active check passed);
 * `paused` = the owner stopped monitoring (we keep data but stop scanning).
 */
export const SiteStatus = z.enum(["pending", "verified", "paused"]);
export type SiteStatus = z.infer<typeof SiteStatus>;

/**
 * Durable status an owner can assign to an issue (overlaid on the per-scan findings via the
 * `issueOverrides` table). `open` is the implicit default for any issue without an override;
 * a non-open issue auto-reopens if a later scan's occurrence set CHANGES. `fixed` is set by the
 * system (not the owner) when every spot of the issue has been covered by an applied live fix — it
 * reads as "Fixed (live)" and, like the owner-set mutes, drops out of the default open inbox.
 */
export const IssueStatus = z.enum(["open", "ignored", "resolved", "snoozed", "fixed"]);
export type IssueStatus = z.infer<typeof IssueStatus>;

/**
 * Per-site control over WHICH pages we scan. `mode: "all"` scans every discovered page;
 * `"allow"` scans only paths matching a pattern; `"deny"` scans everything except matches.
 * Patterns are glob-ish path matchers (e.g. `/admin/*`, `/checkout`). `autoCrawl` enables
 * link discovery from the origin on first verify; `pageCap` bounds how many pages we monitor.
 */
export const ScanConfig = z.object({
  mode: z.enum(["all", "allow", "deny"]).default("all"),
  patterns: z.array(z.string()).default([]),
  autoCrawl: z.boolean().default(true),
  pageCap: z.number().int().min(1).max(500).default(25),
});
export type ScanConfig = z.infer<typeof ScanConfig>;

export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  mode: "all",
  patterns: [],
  autoCrawl: true,
  pageCap: 25,
};

/**
 * Owner-supplied content for the published accessibility statement (the "LiveStatement"): the
 * conformance facts are derived live from the latest scan, but the entity name and contact route
 * are the owner's to set. `target` is the WCAG version+level the statement claims to work toward
 * (2.1 AA is the EN 301 549 / EAA baseline; 2.2 AA for sites going further). All optional so a
 * statement can be generated with sensible fallbacks (site name as entity, owner email as contact).
 */
export const StatementConfig = z.object({
  /** Legal/display name of the entity responsible for the site. Falls back to the site name. */
  entityName: z.string().trim().max(160).optional(),
  /** Where users report accessibility problems — an email and/or a contact-page URL. */
  contactEmail: z.string().trim().email().max(200).optional(),
  contactUrl: z.string().trim().url().max(500).optional(),
  target: z.enum(["2.1-AA", "2.2-AA"]).default("2.1-AA"),
});
export type StatementConfig = z.infer<typeof StatementConfig>;

export const DEFAULT_STATEMENT_CONFIG: StatementConfig = { target: "2.1-AA" };

/**
 * Does a URL's path satisfy a site's scan config? Shared by the ingest API (gate incoming pings)
 * and the crawler (filter discovered links) so "which pages get scanned" is decided in one place.
 * A `*` in a pattern matches any run of non-slash chars; `**` matches across slashes.
 */
export function pathAllowed(rawUrl: string, config: ScanConfig): boolean {
  if (config.mode === "all" || config.patterns.length === 0) return true;
  let path = rawUrl;
  try {
    path = new URL(rawUrl).pathname;
  } catch {
    /* not absolute — match against the raw value */
  }
  const matches = config.patterns.some((p) => globToRegExp(p).test(path));
  return config.mode === "allow" ? matches : !matches;
}

/** Compile a simple path glob (`*`, `**`) to an anchored RegExp. Exported for tests/UI hints. */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex metachars (but not * which we handle)
    .replace(/\*\*/g, " ") // placeholder for ** so the next step doesn't touch it
    .replace(/\*/g, "[^/]*")
    .replace(/ /g, ".*");
  return new RegExp(`^${escaped}/?$`, "i");
}

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
  siteId: string;
  url: string;
  renderedHtml?: string;
}

/** Queue for site crawls (link discovery → fan out into render scans). */
export const CRAWL_QUEUE = "crawl-site" as const;

/** Job payload for a crawl: render the origin, discover same-origin pages, enqueue scans. */
export interface CrawlJob {
  siteId: string;
  origin: string;
  /** Why the crawl fired — for logs/debugging only. */
  reason?: "verified" | "manual" | "scheduled";
}

/** Queue for the periodic monitor tick (fans out scheduled re-crawls across all eligible sites). */
export const MONITOR_QUEUE = "monitor-tick" as const;

/** The monitor tick carries no payload — it discovers eligible sites itself. */
export type MonitorJob = Record<string, never>;
