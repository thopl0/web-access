import {
  pgTable,
  text,
  integer,
  serial,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { DEFAULT_SCAN_CONFIG, type ScanConfig, type SiteStatus } from "@web-access/shared";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqEmail: uniqueIndex("uniq_user_email").on(t.email),
  }),
);

/** A site a user registered. `id` IS the embed siteId baked into the <script> tag.
 *  `ownerId` is nullable so seeded/system sites (e.g. "demo-site") can exist
 *  unowned — they never surface in any user's dashboard (which filters by owner). */
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byOwner: index("sites_by_owner").on(t.ownerId),
    byShareToken: uniqueIndex("sites_by_share_token").on(t.shareToken),
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
