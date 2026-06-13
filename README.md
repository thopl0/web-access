# web-access

Accessibility checker for sites built with AI tools. One-line embed `<script>` detects releases and
notifies a backend; the backend renders each changed page in a real browser and runs the checks.

Architecture & decisions: see `~/.claude/plans/silly-weaving-pinwheel.md`.

## Layout (monorepo)

- `packages/shared` — the `Finding` schema + ingest/report types shared everywhere.
- `packages/analyzers` — the checks. **Tier 1 (axe-core)** today; Tier 2 (geometry, pixel-contrast) next.
- `packages/embed` — the tiny `<script>`: detect change + notify ingest. Built with tsup.
- `apps/api` — Fastify ingest + report API; dedup; enqueues render jobs (BullMQ); Drizzle/Postgres.
- `apps/worker` — BullMQ consumer: renders the URL in Playwright, runs analyzers, stores findings.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium   # one-time: browser for the worker
cp .env.example .env
pnpm infra:up                           # postgres + redis via docker
pnpm db:push                            # create tables
pnpm dev:api                            # terminal 1
pnpm dev:worker                         # terminal 2
```

Then trigger a scan (what the embed does under the hood):

```bash
curl -X POST localhost:3001/v1/ingest \
  -H 'content-type: application/json' \
  -d '{"siteId":"demo","url":"https://example.com","releaseId":"r1","templateFingerprint":"home"}'
```

Fetch the report once the worker finishes:

```bash
curl localhost:3001/v1/reports/demo | jq
```

## Demo (runs the real embed end-to-end)

With infra + api + worker running:

```bash
pnpm --filter @web-access/embed build          # build the <script>
pnpm --filter @web-access/worker dev:visit      # a headless "visitor" loads /demo/ and fires the embed
curl localhost:3001/v1/reports/demo-site | jq   # see findings across all tiers
```

`demo/index.html` intentionally contains: a missing-alt image + empty link (Tier 1, axe), a positive
tabindex + a `column-reverse` reading-order inversion (geometry), and low-contrast text over a
gradient (Tier-2 pixel-sampled contrast). The worker sets `window.__WEB_ACCESS_RENDERER` so the
embed no-ops inside our own render (no trigger loop).

## Status

**v1 "automatic layer" is complete and verified end-to-end** (plan §8 steps 1–2):
- Tier 1 — axe-core (DOM/ARIA/alt presence, structure)
- Tier 2 — reading/focus-order geometry (DOM vs `getBoundingClientRect`) + contrast over
  solid (axe) and **image/gradient** (pixel sampling, no AI)
- embed → ingest (dedup per site/release/template) → queue → render → analyze → report

Next: dashboard UI, then the Tier-3 AI layer (eval corpus first), then remediation. See the plan.
