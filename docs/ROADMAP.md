# Product roadmap — MVP → GA/Clarity-style accessibility monitoring

Tracks the build from the current MVP (register site → embed → scan → report) toward a
guided, GA/Clarity-style product: add site → install → **verify** → auto-crawl → issues
inbox with lifecycle → settings. Updated as phases land.

## Locked decisions (from kickoff)
- **Verification:** hybrid — auto-verify on first embed ping **and** a "Check now" that
  server-fetches the site URL and confirms the snippet.
- **Site URL:** required at registration.
- **Onboarding:** dedicated guided wizard (name → install w/ framework tabs → verify).
- **Page-access control:** per-site allow/deny path globs + auto-crawl toggle + page cap.

## Phases
- [x] **0 — Schema foundations:** `sites` gains `status`/`verifiedAt`/`lastSeenAt`/`scanConfig`;
      new `issueOverrides` table; seed demo-site as verified.
- [x] **1 — Verification (hybrid):** ingest auto-verify + `lastSeenAt` + path gating; `checkInstall`
      + `getVerificationStatus` actions; `VerifyPanel` (Check now + poll); `SiteStatusChip`; SiteCard
      surfaces install/verify while pending.
- [x] **2 — Guided onboarding wizard:** `/dashboard/sites/new` 3-step `SiteWizard`, framework
      `InstallInstructions` tabs, `createSite` requires URL + returns id/snippet; overview now links
      to the wizard (old inline form removed).
- [x] **3 — Auto-crawl + monitored pages:** `crawl-site` queue + crawl worker (link discovery →
      fan-out scans), shared `enqueueScan`/`enqueueCrawl`, crawl on first verify, `recrawlSite` +
      `rescanPage` actions, `/dashboard/[siteId]/pages` + `SiteTabs`. Verified live (8 pages crawled).
- [x] **4 — Issues inbox + lifecycle:** `/dashboard/issues` + `/issues/[key]`, `lib/server/issues.ts`
      rollup keyed by `siteId:ruleId` w/ fingerprint auto-reopen, `setIssueStatus` (resolve/ignore/
      reopen), `IssueFilters`, and **Copy fix for AI builder** (`lib/aiFixPrompt.ts` + `CopyButton`).
- [x] **5 — Settings & page-access control:** `/dashboard/[siteId]/settings` (rename/URL, reinstall +
      re-verify, scan-config globs/autoCrawl/pageCap, pause/resume, delete) + `/dashboard/account`
      (profile, password, sign out, delete account). Cascade-safe deletes.
- [x] **6 — Dashboard polish & nav:** sidebar adds Issues + Account + Add-site; accessibility
      `healthScore`/grade (`ScoreBadge`) on overview + site cards; pending-install nudge banner.
      (Pages stays per-site via `SiteTabs`.)

## Phase 2 (post-MVP additions)
- [x] **7 — WCAG scorecard + EAA readiness:** `lib/wcag.ts` (WCAG 2.1 A/AA reference + conformance
      summarizer); `WcagScorecard` (Level A/AA + POUR principle breakdown) and `EaaReadiness`
      (European Accessibility Act ≈ EN 301 549 / WCAG 2.1 AA, in force 2025-06-28) on overview +
      per-site report.
- [x] **8 — Quick wins + common issues:** `lib/effort.ts` rule-effort map; `QuickWins` (easy +
      high-impact) and `CommonIssues` (frequency bars) on the overview.
- [x] **9 — Report export + sharing:** CSV export (`/api/sites/[siteId]/export`), public tokenized
      read-only report (`/share/[token]`, noindex + print-to-PDF), `setSiteSharing` action, settings
      "Sharing & export" section.
- [x] **10 — Email alerts:** `lib/server/email.ts` (Resend HTTP, no-op without key) + `notify.ts`;
      verification-success (ingest + checkInstall), new-critical-on-scan (worker, Redis daily
      cooldown), weekly digest (`weekly-digest` scheduler). Env: `RESEND_API_KEY`, `EMAIL_FROM`,
      `DIGEST_INTERVAL_MS`.

## Extras included now
- [x] **Scheduled monitoring** — `monitor-tick` queue + BullMQ job scheduler (`MONITOR_INTERVAL_MS`,
      default 24h) re-crawls every verified, non-paused, auto-crawl site. Set the interval to 0 to
      disable.
- [x] **"Copy fix for AI builder"** — `lib/aiFixPrompt.ts` builds a paste-ready prompt (issue +
      every affected element) surfaced on the issue detail page via `CopyButton`.

## Deferred → now in progress (Phases 9–10)
- **Report export** and **Email alerts** were deferred; now being built (Phases 9–10 above).
  Email sends only when a provider key is configured (no-op otherwise).

## Engineering notes
- This Next.js is **modified** (see `AGENTS.md`): read the relevant guide under
  `node_modules/next/dist/docs/` before writing route/proxy/server-action code.
- Run `pnpm typecheck` + `pnpm lint` after each phase.
- **Fixed (Phase 2):** DB connection leak — `lib/server/db.ts` recreated the Postgres pool on every
  HMR reload, exhausting `max_connections`. Now memoized on `globalThis` + `idle_timeout` on the
  pool (`lib/packages/db/client.ts`). Restart dev servers predating this fix.
