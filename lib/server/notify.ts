// High-level alert builders. Load the data, render the email, and hand off to sendEmail (which
// no-ops when email isn't configured). Worker-safe (no server-only import).
import { eq } from "drizzle-orm";

import { db, schema } from "./db";
import { env } from "./env";
import { sendEmail, emailLayout } from "./email";
import { getUserIssues } from "./issues";
import { getUserPlans, entitlementsFor } from "./entitlements";
import type { ScanDelta } from "./verification";
import { explainRule } from "@/lib/explain";
import { SEVERITY_ORDER, type Severity } from "@/lib/severity";

/** Absolute URL into the app, or undefined when APP_ORIGIN is unset (so we skip CTA buttons). */
function appUrl(path: string): string | undefined {
  if (!env.APP_ORIGIN) return undefined;
  return env.APP_ORIGIN.replace(/\/+$/, "") + path;
}

async function ownerEmail(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const rows = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, ownerId))
    .limit(1);
  return rows[0]?.email ?? null;
}

/** "Your site is verified" — fired once when a site first goes from pending → verified. */
export async function notifySiteVerified(siteId: string): Promise<void> {
  const rows = await db
    .select({ name: schema.sites.name, ownerId: schema.sites.ownerId })
    .from(schema.sites)
    .where(eq(schema.sites.id, siteId))
    .limit(1);
  const site = rows[0];
  if (!site) return;
  const to = await ownerEmail(site.ownerId);
  if (!to) return;

  const cta = appUrl(`/dashboard/${siteId}`);
  await sendEmail({
    to,
    category: "info",
    subject: `“${site.name}” is verified ✓`,
    html: emailLayout(
      `“${site.name}” is verified`,
      `<p>We detected the snippet and verified your install. We'll now scan every release automatically and surface any accessibility issues in your dashboard.</p>`,
      cta ? { label: "View your report", url: cta } : undefined,
    ),
    text: `"${site.name}" is verified. We'll scan every release automatically.`,
  });
}

/** "We found critical issues" — fired (Redis-cooldown deduped) when a scan completes with criticals. */
export async function notifyCriticalScan(siteId: string, criticalCount: number): Promise<void> {
  const rows = await db
    .select({ name: schema.sites.name, ownerId: schema.sites.ownerId })
    .from(schema.sites)
    .where(eq(schema.sites.id, siteId))
    .limit(1);
  const site = rows[0];
  if (!site) return;
  const to = await ownerEmail(site.ownerId);
  if (!to) return;

  const cta = appUrl(`/dashboard/${siteId}`);
  const n = `${criticalCount} critical ${criticalCount === 1 ? "issue" : "issues"}`;
  await sendEmail({
    to,
    category: "alerts",
    subject: `${n} found on “${site.name}”`,
    html: emailLayout(
      `${n} on “${site.name}”`,
      `<p>A recent scan found <strong>${n}</strong> — the kind most likely to block real users. Open the report for plain-language fixes (and a ready-made prompt for your AI builder).</p>`,
      cta ? { label: "Review critical issues", url: cta } : undefined,
    ),
    text: `${n} found on "${site.name}". Open your dashboard to review.`,
  });
}

/**
 * "Your latest scan introduced new issues" — fired when a re-scan adds rules that weren't in the
 * previous scan (a regression on an update). The worker dedupes per site via a short Redis cooldown,
 * so a multi-page crawl sends at most one. Takes the already-computed delta so it doesn't re-query.
 */
export async function notifyNewIssues(siteId: string, delta: ScanDelta): Promise<void> {
  const introduced = delta.introduced;
  if (introduced.length === 0) return;

  const rows = await db
    .select({ name: schema.sites.name, ownerId: schema.sites.ownerId })
    .from(schema.sites)
    .where(eq(schema.sites.id, siteId))
    .limit(1);
  const site = rows[0];
  if (!site) return;
  const to = await ownerEmail(site.ownerId);
  if (!to) return;

  const n = `${introduced.length} new ${introduced.length === 1 ? "issue" : "issues"}`;
  const fixed = delta.resolved.length;
  const list = introduced
    .slice(0, 5)
    .map((r) => {
      const title = explainRule(r.ruleId)?.title ?? r.message;
      const spots = `${r.spots} ${r.spots === 1 ? "spot" : "spots"}`;
      return `<li><strong>${title}</strong> — ${spots}${r.impact ? `, ${r.impact}` : ""}</li>`;
    })
    .join("");
  const more = introduced.length > 5 ? `<p>…and ${introduced.length - 5} more.</p>` : "";
  const cta = appUrl(`/dashboard/${siteId}`);

  await sendEmail({
    to,
    category: "alerts",
    subject: `${n} on “${site.name}” since your last scan`,
    html: emailLayout(
      `${n} on “${site.name}”`,
      `<p>Your latest scan introduced <strong>${n}</strong> that weren't there last time` +
        `${fixed > 0 ? ` (and confirmed <strong>${fixed}</strong> fixed)` : ""} — most likely a recent ` +
        `change brought them in:</p><ul>${list}</ul>${more}`,
      cta ? { label: "See what changed", url: cta } : undefined,
    ),
    text: `${n} on "${site.name}" since your last scan. Open your dashboard to see what changed.`,
  });
}

/** Weekly digest to every owner with open issues — one summary email per user. Returns # sent. */
export async function sendWeeklyDigests(): Promise<number> {
  const owners = await db
    .selectDistinct({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .innerJoin(schema.sites, eq(schema.sites.ownerId, schema.users.id));

  // The weekly digest is monitoring output → a Pro feature. Resolve every owner's plan in one query
  // and skip those without the monitoring entitlement (free owners get no digest).
  const plans = await getUserPlans(owners.map((o) => o.id));

  let sent = 0;
  for (const owner of owners) {
    if (!entitlementsFor(plans.get(owner.id)).monitoring) continue;
    const issues = await getUserIssues(owner.id, { view: "open" });
    if (issues.length === 0) continue;

    const counts: Record<Severity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const i of issues) {
      if (i.impact) counts[i.impact as Severity] += 1;
    }
    const rows = SEVERITY_ORDER.filter((s) => counts[s] > 0)
      .map((s) => `<li><strong>${counts[s]}</strong> ${s}</li>`)
      .join("");
    const cta = appUrl("/dashboard/issues");
    const ok = await sendEmail({
      to: owner.email,
      category: "alerts",
      subject: `Your weekly accessibility summary — ${issues.length} open ${issues.length === 1 ? "issue" : "issues"}`,
      html: emailLayout(
        "Your weekly accessibility summary",
        `<p>You have <strong>${issues.length}</strong> open ${issues.length === 1 ? "issue" : "issues"} across your sites:</p><ul>${rows}</ul>`,
        cta ? { label: "Open the issues inbox", url: cta } : undefined,
      ),
      text: `You have ${issues.length} open accessibility issues. Open your dashboard to review.`,
    });
    if (ok) sent += 1;
  }
  return sent;
}

// Re-exported so callers can branch without importing email.ts directly.
export { emailConfigured } from "./email";
