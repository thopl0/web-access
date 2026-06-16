# web-access

Accessibility checker for sites built with AI tools. One-line embed `<script>` detects releases and
notifies a backend; the backend renders each changed page in a real browser and runs the checks.

Architecture & decisions: see `~/.claude/plans/silly-weaving-pinwheel.md`.

## One project, two processes

Everything is a single Next.js 16 app at the repo root — UI, the public `/v1` API, and all the
analysis code. There are no internal REST hops: the dashboard reads Postgres directly from server
components; only the third-party embed posts to `/v1/ingest`. Headless rendering is the one thing
that can't live in a request handler (slow, heavy, untrusted URLs), so it runs as a **second
process** in the same project, off a BullMQ/Redis queue.

- `app/` — Next App Router. Marketing pages + the API route handlers under `app/v1/`
  (`ingest`, `reports/[siteId]`, `scans/[scanId]`) and `app/health`.
- `components/`, `lib/site.ts`, `lib/utils.ts` — the marketing site / dashboard UI.
- `lib/server/` — server-only glue: `db` (Drizzle/Postgres), `queue` (BullMQ), `env`, `report`.
- `lib/packages/` — the analysis core, imported via `@web-access/*` aliases:
  - `shared` — the `Finding` schema + ingest/report types.
  - `db` — Drizzle schema + client factory.
  - `analyzers` — the checks. **Tier 1 (axe-core)** + **Tier 2 (geometry, pixel-contrast)**.
- `worker/` — the render process: BullMQ consumer → Playwright render → analyzers → findings.
  Run with `tsx` (`pnpm start:worker`).
- `embed/` — the tiny `<script>`: detect change + notify ingest. Built with tsup into
  `public/embed/web-access.global.js`.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium   # one-time: browser for the worker
cp .env.example .env
pnpm infra:up                           # postgres + redis via docker
pnpm db:push                            # create tables
pnpm dev                                # terminal 1 — Next app (UI + /v1 API) on :3000
pnpm dev:worker                         # terminal 2 — the render worker
```

`pnpm dev`/`pnpm build` build the embed first (the `predev`/`prebuild` hooks run `build:embed`).

Then trigger a scan (what the embed does under the hood):

```bash
curl -X POST localhost:3000/v1/ingest \
  -H 'content-type: application/json' \
  -d '{"siteId":"demo","url":"https://example.com","releaseId":"r1","templateFingerprint":"home"}'
```

Fetch the report once the worker finishes:

```bash
curl localhost:3000/v1/reports/demo | jq
```

## Demo (runs the real embed end-to-end)

With infra + the Next app + the worker running:

```bash
pnpm dev:visit                                  # headless "visitor" loads /demo/index.html, fires the embed
curl localhost:3000/v1/reports/demo-site | jq   # see findings across all tiers
```

`public/demo/index.html` (served by Next at `/demo/index.html`) intentionally contains: a missing-alt
image + empty link (Tier 1, axe), a positive tabindex + a `column-reverse` reading-order inversion
(geometry), and low-contrast text over a gradient (Tier-2 pixel-sampled contrast). The worker sets
`window.__WEB_ACCESS_RENDERER` so the embed no-ops inside our own render (no trigger loop).

## Status

**v1 "automatic layer" is complete and verified end-to-end** (plan §8 steps 1–2):
- Tier 1 — axe-core (DOM/ARIA/alt presence, structure)
- Tier 2 — reading/focus-order geometry (DOM vs `getBoundingClientRect`) + contrast over
  solid (axe) and **image/gradient** (pixel sampling, no AI)
- embed → ingest (dedup per site/release/template) → queue → render → analyze → report

Next: dashboard UI, then the Tier-3 AI layer (eval corpus first), then remediation. See the plan.
