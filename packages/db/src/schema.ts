import {
  pgTable,
  text,
  integer,
  serial,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

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
