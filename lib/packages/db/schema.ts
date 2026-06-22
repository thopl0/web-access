import {
  pgTable,
  text,
  integer,
  serial,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import {
  DEFAULT_SCAN_CONFIG,
  DEFAULT_STATEMENT_CONFIG,
  type AttributePatch,
  type CssPatch,
  type ScanConfig,
  type SiteStatus,
  type StatementConfig,
} from "@web-access/shared";

/** A registered account. Email is stored already lowercased (callers normalize). */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    // Nullable: OAuth (e.g. Google) accounts have no password. A null hash means
    // the account can only sign in via its OAuth provider, not email/password.
    passwordHash: text("password_hash"),
    // Billing / entitlements. `plan` is the authoritative tier ("free" | "pro" | "business") that
    // drives every limit + feature gate (see lib/entitlements.ts); it defaults to "free" so accounts
    // work with no billing at all. The Stripe fields are populated by the billing webhook and are all
    // nullable — they stay null when Stripe is unconfigured or the user has never paid, and nothing
    // reads them on the free path. `planStatus` mirrors the Stripe subscription status
    // (active/past_due/canceled/…); `planRenewsAt` is the current period end.
    plan: text("plan").notNull().default("free"),
    planStatus: text("plan_status"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    // When the owner last opened the notifications bell. Anything that happened after this (a new
    // crawl, newly-found issues) counts as "unread". Null = never opened → everything recent is unread.
    notificationsSeenAt: timestamp("notifications_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqEmail: uniqueIndex("uniq_user_email").on(t.email),
  }),
);

/** A site a user registered. `id` IS the embed siteId baked into the <script> tag.
 *  `ownerId` is nullable so unowned system sites can exist — they never surface
 *  in any user's dashboard (which filters by owner). */
export const sites = pgTable(
  "sites",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    origin: text("origin"),
    // Lifecycle: "pending" (registered, embed never seen) → "verified" (snippet confirmed live)
    // → "paused" (owner stopped monitoring). See SiteStatus in @web-access/shared.
    status: text("status").$type<SiteStatus>().notNull().default("pending"),
    // When the snippet was first confirmed live (first ping or a passing active check).
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // Last embed ping received — the "is the script still installed" heartbeat.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    // Which pages we scan + crawl behaviour. See ScanConfig in @web-access/shared.
    scanConfig: jsonb("scan_config").$type<ScanConfig>().notNull().default(DEFAULT_SCAN_CONFIG),
    // Unguessable token for a public, read-only report link. Null = sharing off.
    shareToken: text("share_token"),
    // Unguessable token for the publicly-hosted accessibility statement. Null = not published.
    // Mirrors shareToken: the statement page reads live scan data, so the token only gates access.
    statementToken: text("statement_token"),
    // Owner-supplied statement content (entity name, contact route, target standard). The
    // conformance facts are computed live; this is just the parts only the owner can supply.
    statementConfig: jsonb("statement_config")
      .$type<StatementConfig>()
      .notNull()
      .default(DEFAULT_STATEMENT_CONFIG),
    // The site-building platform the owner uses (Lovable/Wix/WordPress/… or "other"). Drives the
    // builder-prompt generator's output: AI builders get a paste-back PROMPT, CMS/site builders get
    // click-path STEPS. Plain text (no $type) to avoid a cross-package import of `lib/platform.ts`;
    // validated with `isPlatform` at the app boundary. Nullable: unset until the owner picks one.
    platform: text("platform"),
    // Master opt-in for Phase C runtime remediation: when true, the embed fetches the site's
    // approved attribute patches and applies them to the live DOM (non-visual only — alt/aria/lang/
    // role/title). Default false: nothing is ever served or applied until the owner turns this on
    // AND approves individual fixes. The source fix stays primary; this is a temporary patch.
    runtimeRemediation: boolean("runtime_remediation").notNull().default(false),
    // EXPERIMENTAL opt-in for Phase D CSS fixes: when true, approved CSS patches (contrast/target-size)
    // are also served + applied live. Default false because these change the page's APPEARANCE and may
    // affect the design — gated separately from the non-visual runtime remediation above.
    cssRemediation: boolean("css_remediation").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOwner: index("sites_by_owner").on(t.ownerId),
    byShareToken: uniqueIndex("sites_by_share_token").on(t.shareToken),
    byStatementToken: uniqueIndex("sites_by_statement_token").on(t.statementToken),
  }),
);

/** One analysis run for a (site, release, template). Deduped via the unique index. */
export const scans = pgTable(
  "scans",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    url: text("url").notNull(),
    releaseId: text("release_id").notNull(),
    templateFingerprint: text("template_fingerprint").notNull(),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    uniqScan: uniqueIndex("uniq_scan").on(t.siteId, t.releaseId, t.templateFingerprint),
    bySite: index("scans_by_site").on(t.siteId),
  }),
);

/** Normalized findings (results-only retention — no raw DOM/screenshots kept). */
export const findings = pgTable(
  "findings",
  {
    id: serial("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    source: text("source").notNull(),
    tier: integer("tier").notNull(),
    wcag: jsonb("wcag").$type<string[]>().notNull().default([]),
    impact: text("impact"),
    selector: text("selector").notNull(),
    htmlSnippet: text("html_snippet").notNull(),
    message: text("message").notNull(),
    helpUrl: text("help_url"),
  },
  (t) => ({
    byScan: index("findings_by_scan").on(t.scanId),
  }),
);

/**
 * Cropped visual evidence for a finding — a screenshot of just the offending element, so the
 * dashboard can SHOW where the problem is instead of asking laypeople to decode a CSS selector.
 *
 * Aligns with the "results-only (cropped/masked evidence)" retention rule: we keep the small crop,
 * never the full page render. The PNG bytes live in object storage (R2 in prod, local disk in dev —
 * see lib/server/storage.ts); only the storage key is kept here. The crop is streamed back through
 * the access-controlled `/api/evidence/[findingId]` route.
 */
export const evidence = pgTable("evidence", {
  findingId: integer("finding_id")
    .primaryKey()
    .references(() => findings.id, { onDelete: "cascade" }),
  // Object-storage key for the cropped PNG (e.g. `evidence/<findingId>.png`).
  objectKey: text("object_key").notNull(),
  width: integer("width"),
  height: integer("height"),
  // Document-relative top-left of the element box, in CSS px. Paired with the per-scan full-page
  // screenshot (scanShots) this lets the dashboard draw a highlight box over a page thumbnail —
  // the Clarity-style "see WHERE on the page" moment. Nullable: older rows / un-locatable elements.
  pageX: integer("page_x"),
  pageY: integer("page_y"),
});

/**
 * One downscaled full-page screenshot per scan — the canvas the dashboard overlays element
 * highlights onto (using each finding's evidence box). The JPEG bytes live in object storage (R2 in
 * prod, local disk in dev — see lib/server/storage.ts); only the storage key is kept here, so the
 * row stays light. Streamed back through the access-controlled `/api/shot/[scanId]` route.
 * Best-effort: absent when the page was too tall/large to keep bounded, so the annotated view
 * degrades gracefully to per-element crops.
 *
 * `width`/`height` are the document's CSS-pixel dimensions, so element boxes (also CSS px) map onto
 * the image as simple fractions — the overlay positions in %, staying resolution-independent.
 */
export const scanShots = pgTable("scan_shots", {
  scanId: text("scan_id")
    .primaryKey()
    .references(() => scans.id, { onDelete: "cascade" }),
  // Object-storage key for the full-page JPEG (e.g. `shots/<scanId>.jpg`).
  objectKey: text("object_key").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
});

/**
 * AI-written, element-specific explanation for a finding (Tier-3 text judge). The deterministic
 * analyzers (axe/geometry/contrast) emit generic, per-rule developer messages; this turns each into
 * plain-language, element-specific "what's wrong here / how to fix it" for non-technical owners.
 *
 * Computed once in the worker and stored (results-only retention). Kept in its own table so the
 * text never loads with normal finding queries and so a finding without an explanation is the
 * natural default (AI unconfigured, over the per-scan cap, or model failure).
 */
export const findingExplanations = pgTable("finding_explanations", {
  findingId: integer("finding_id")
    .primaryKey()
    .references(() => findings.id, { onDelete: "cascade" }),
  title: text("title"),
  what: text("what").notNull(),
  fix: text("fix").notNull(),
});

/**
 * A concrete before→after code fix for a finding — the product's core differentiator: don't just say
 * what's wrong, hand the owner the corrected markup to paste into their builder. Mirrors
 * `findingExplanations` (keyed 1:1 by findingId, cascades when the finding is deleted) and follows the
 * same results-only retention: we keep the computed fix, never a raw render.
 *
 * `kind` is "deterministic" (a templated, mechanical transform — `lang="en"`, `alt=""` for a
 * decorative image) or "ai" (a GLM-derived suggestion for a judgment call — alt-text content,
 * ambiguous link text). `needsReview` is true whenever a human must confirm wording: ALL ai fixes,
 * and any deterministic fix that inserted a placeholder (e.g. an empty aria-label). Absence of a row
 * is the natural default (no mechanical fix applies, AI unconfigured/over-cap, or a model miss).
 */
export const fixSuggestions = pgTable("fix_suggestions", {
  findingId: integer("finding_id")
    .primaryKey()
    .references(() => findings.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  // Original element markup (the offending snippet).
  before: text("before").notNull(),
  // Corrected element markup the owner can paste in.
  after: text("after").notNull(),
  // True when a human must confirm the result before applying (AI fix or inserted placeholder).
  needsReview: boolean("needs_review").notNull().default(false),
  // What still needs a human decision, when anything does (e.g. "replace the placeholder label").
  note: text("note"),
  // Structured safe-attribute form of this fix, for Phase C runtime remediation — an array of
  // {attr,value} restricted to SAFE_REMEDIATION_ATTRS (see @web-access/shared). Nullable: present
  // only when the fix is a simple non-visual attribute set (lang/alt/role/aria-*); absent otherwise.
  attributePatch: jsonb("attribute_patch").$type<AttributePatch[]>(),
  // Experimental structured CSS form (Phase D) — present for visual fixes (contrast/target-size).
  // Nullable; only set when the fixer could compute safe CSS, and only ever applied if the owner
  // opts into experimental CSS fixes (sites.cssRemediation).
  cssPatch: jsonb("css_patch").$type<CssPatch[]>(),
});

/**
 * Phase C runtime remediation — durable, per-site attribute patches the owner has EXPLICITLY approved
 * for the embed to apply to the live DOM (a temporary, non-visual patch while the source is fixed).
 *
 * Follows the `issueOverrides` "persist across rescans by a stable key" pattern: keyed by
 * (siteId, selector, attr) rather than by a per-scan findingId, so an approved fix survives re-scans
 * (which recreate finding rows). Each row is one attribute set on one selector; the manifest builder
 * groups rows by selector for the embed. `enabled` lets an owner pause a patch without deleting it.
 * Nothing here is ever served unless `sites.runtimeRemediation` is also on. `attr` is constrained to
 * SAFE_REMEDIATION_ATTRS at every write/read; `value` is a real owner-confirmed value (never a
 * "TODO:" placeholder). Cascades when its site is deleted.
 */
export const remediations = pgTable(
  "remediations",
  {
    id: serial("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    selector: text("selector").notNull(),
    // "attr" (a safe non-visual attribute, default) or "css" (an experimental CSS property). For css
    // rows, `attr` holds the CSS property name and `value` its value — the curated allowlists don't
    // overlap, so (selector, attr) stays a safe unique key across both kinds.
    kind: text("kind").notNull().default("attr"),
    attr: text("attr").notNull(),
    value: text("value").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One approved value per (site, selector, attr): re-approving updates in place (upsert).
    uniqRemediation: uniqueIndex("uniq_remediation").on(t.siteId, t.selector, t.attr),
    bySite: index("remediations_by_site").on(t.siteId),
  }),
);

/**
 * Per-rule "auto-fix this type going forward" preference. When enabled for a (site, rule), the worker
 * auto-approves that rule's SAFE non-visual attribute fixes on every future scan (so recurring issues
 * of that type get patched live without per-occurrence review) and the dashboard treats the issue as
 * "Fixed (live)" so it stops clogging the open inbox. Safe-attr fixes only — CSS is never auto-applied.
 * Keyed by (siteId, ruleId) like the report's rule rollup; cascades when the site is deleted.
 */
export const ruleAutofix = pgTable(
  "rule_autofix",
  {
    id: serial("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqRuleAutofix: uniqueIndex("uniq_rule_autofix").on(t.siteId, t.ruleId),
    bySite: index("rule_autofix_by_site").on(t.siteId),
  }),
);

/**
 * One row of the per-scan "start here" legal-risk triage list. Mirrors `TriageItem` in
 * `analyzers/ai/reportSummary.ts` (the single source of truth) — inlined here, rather than imported,
 * so the db package stays a dependency-light leaf (the analyzers barrel pulls in playwright + the AI
 * judges; we never want that graph in the schema). Keep this shape in lock-step with `TriageItem`.
 */
export type ScanTriageItem = {
  /** Stable rule id, e.g. "image-alt". */
  ruleId: string;
  /** CSS selector to the offending element, when the finding carries one. */
  selector?: string;
  /** Legal-risk tier: "high" | "medium" | "low" (from lib/legalRisk.ts). */
  tier: "high" | "medium" | "low";
  /** One plain sentence on why this issue draws legal complaints. */
  why: string;
};

/**
 * The "intelligent report" for one scan: a plain-English executive summary plus the legal-risk
 * TRIAGE list (the "start here" shortlist), so a non-technical owner sees what actually draws ADA /
 * EAA complaints first instead of an undifferentiated finding dump.
 *
 * Computed once in the worker (best-effort, after fixes) by `generateReportSummary` and stored in its
 * own table — the same "per-scan computed artifact in its own table" pattern as `findingExplanations`
 * / `fixSuggestions`: keyed 1:1 by scanId, cascades when the scan is deleted, and absent by default
 * (so a scan with no summary is the natural state, and the report falls back to a deterministic one).
 * `source` records how it was built: "ai" when GLM warmed the prose, "deterministic" otherwise.
 */
export const scanSummaries = pgTable("scan_summaries", {
  scanId: text("scan_id")
    .primaryKey()
    .references(() => scans.id, { onDelete: "cascade" }),
  // Short, plain-English executive summary for a non-technical owner.
  plainSummary: text("plain_summary").notNull(),
  // The legal-risk "start here" shortlist (highest risk first). See ScanTriageItem above.
  triage: jsonb("triage").$type<ScanTriageItem[]>().notNull().default([]),
  // "ai" (GLM rewrote the prose) or "deterministic" (assembled with no model call).
  source: text("source").notNull(),
});

/**
 * Durable issue lifecycle, overlaid on the per-scan findings. A "finding" is recreated on every
 * scan, so to let owners resolve/ignore/snooze an issue *across* re-scans we key a stable status
 * by (siteId, issueKey) — where issueKey is a hash of rule + url-pattern + element identity
 * (see lib/server/issues.ts). Absence of a row means "open"; this table only records deviations,
 * so a resolved/ignored issue still naturally reappears in the data when a later scan re-detects
 * it (the report layer decides whether to auto-reopen). Cascades when its site is deleted.
 */
export const issueOverrides = pgTable(
  "issue_overrides",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    issueKey: text("issue_key").notNull(),
    status: text("status").notNull().default("open"),
    note: text("note"),
    // The element fingerprint last seen when this override was set — lets the report layer detect
    // that a "resolved" issue's element changed/reappeared and auto-reopen it.
    fingerprint: text("fingerprint"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.siteId, t.issueKey] }),
  }),
);
