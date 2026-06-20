/**
 * Plain-English report summariser: turn a scan's raw findings into the two things a NON-technical site
 * owner actually wants when they open a report — (1) a short executive summary in everyday words, and
 * (2) a "start here" TRIAGE list ordered by LEGAL risk (what draws ADA Title III / EAA / EN 301 549
 * complaints first). This is a one-shot summary, NOT a chat: one input, one `ReportSummary` out.
 *
 * The deterministic ranking comes from `lib/legalRisk.ts` (`rankByLegalRisk` / `legalRiskOf`) — the
 * single source of truth for "how exposed is the owner, legally". We build a complete summary from that
 * ranking + the finding counts with NO model call (`source: "deterministic"`). When the AI tier is
 * configured we make ONE batched `glmAsk` (text-only, the coding-plan endpoint) that REWRITES the
 * plain summary into warmer prose and may sharpen each triage `why` — grounded ONLY in the findings and
 * the ranking we hand it, never inventing specifics or giving legal advice beyond the risk framing.
 *
 * Mirrors the house pattern (`ai/enrich.ts`, `fix/builderPrompt.ts`): one GLM round-trip behind a
 * precision-biased prompt, deterministic fallback on ANY failure, and — the contract a route depends
 * on — this function NEVER throws and NEVER returns null.
 */
import type { Finding } from "@web-access/shared";
import { rankByLegalRisk, type RiskTier } from "../../../legalRisk";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";

/** One row of the "start here" triage list — a single finding, framed by legal risk. */
export interface TriageItem {
  /** Stable rule id, e.g. "image-alt". */
  ruleId: string;
  /** CSS selector to the offending element, when the finding carries one. */
  selector?: string;
  /** Legal-risk tier this issue falls into. */
  tier: RiskTier;
  /** One plain sentence on WHY this issue draws legal complaints (from the legal-risk scorer, the AI
   *  may sharpen the wording without changing the meaning). */
  why: string;
}

export interface ReportSummary {
  /** Short, plain-English executive summary for a non-technical owner. */
  plainSummary: string;
  /** The worst issues to fix first, highest legal-risk first. */
  triage: TriageItem[];
  /** `"ai"` when GLM rewrote the prose; `"deterministic"` when assembled with no model call. */
  source: "ai" | "deterministic";
}

/** How many of the worst (highest-risk) findings become triage rows — the "start here" shortlist is
 *  deliberately short so an owner isn't overwhelmed. Bounds the GLM payload too. */
const MAX_TRIAGE = 6;

/** Only high/medium-risk items belong in a legal-risk "start here" list; low-risk findings are noise
 *  for this purpose (they still appear in the full report elsewhere). */
function isTriageWorthy(tier: RiskTier): boolean {
  return tier === "high" || tier === "medium";
}

const SYSTEM_PROMPT =
  "You write the opening of a web-accessibility report for a NON-TECHNICAL site owner (someone who " +
  "built their site with a tool like Wix, Squarespace, or an AI builder). You are given the site " +
  "name, a deterministic plain-English summary, and a ranked TRIAGE list of the most legally risky " +
  "issues (each has a rule id, a risk tier, and a one-sentence reason it draws accessibility " +
  "complaints under laws like the ADA, the EAA, or EN 301 549).\n" +
  "Do TWO things:\n" +
  "- plainSummary: rewrite the given summary into 2-4 warm, clear sentences a non-technical owner " +
  "will understand. Keep the site name and the issue counts EXACTLY as given. Explain plainly that " +
  "these issues can shut some visitors out and carry legal exposure, and that the list below is where " +
  "to start. No jargon, no rule ids, no CSS selectors.\n" +
  "- triage: for EACH item (keyed by its id, in the same order) you MAY rewrite `why` into one " +
  "clearer sentence aimed at the owner. Keep its MEANING — do not change which law or which risk it " +
  "describes.\n" +
  "CRITICAL: stay grounded ONLY in what you are given. Do NOT invent issues, counts, colours, sizes, " +
  "or specific legal claims, and do NOT give legal advice beyond the risk framing already provided. " +
  "If unsure, keep the original wording. Return ONLY JSON of the form " +
  '{"plainSummary":"...","triage":[{"id":0,"why":"..."}]} — one triage entry per input id.';

/** Render a count as a word-friendly phrase ("1 issue" / "3 issues"). */
function pluralIssues(n: number): string {
  return `${n} ${n === 1 ? "issue" : "issues"}`;
}

/**
 * The deterministic plain-English summary — assembled with NO model call. Always names the site and
 * the total count, and (when there are urgent items) calls out how many are most urgent and what they
 * are, in everyday words. The empty-findings case yields a valid, friendly "no issues" line.
 */
function deterministicSummary(
  siteName: string,
  totalFindings: number,
  triage: TriageItem[],
): string {
  if (totalFindings === 0) {
    return `Good news — we didn't find any accessibility issues on "${siteName}". Nothing needs fixing right now.`;
  }

  if (triage.length === 0) {
    // Issues exist, but none rose to high/medium legal risk — say so plainly.
    return (
      `Your site "${siteName}" has ${pluralIssues(totalFindings)} on the page. ` +
      `None of them stand out as urgent from a legal standpoint, but fixing them still makes the ` +
      `site easier for everyone to use.`
    );
  }

  // Name the most urgent issues by their plain-language reason (the legal-risk "why").
  const reasons = triage.map((t) => t.why.replace(/\.$/, "")).join("; ");
  return (
    `Your site "${siteName}" has ${pluralIssues(totalFindings)} across the page; ` +
    `the most urgent ${triage.length === 1 ? "one is" : `${triage.length} are`}: ${reasons}. ` +
    `Start with the list below — these are the issues most likely to shut visitors out and to draw ` +
    `accessibility complaints.`
  );
}

/** Build the deterministic triage list: rank by legal risk, keep the worst high/medium items, cap. */
function buildTriage(findings: Finding[]): TriageItem[] {
  const ranked = rankByLegalRisk(findings);
  const items: TriageItem[] = [];
  for (const { item, risk } of ranked) {
    if (!isTriageWorthy(risk.tier)) continue;
    items.push({
      ruleId: item.ruleId,
      ...(item.selector ? { selector: item.selector } : {}),
      tier: risk.tier,
      why: risk.why,
    });
    if (items.length >= MAX_TRIAGE) break;
  }
  return items;
}

/** The model payload: site name, the deterministic summary to rewrite, and the triage list (with ids
 *  so the reply stays aligned). Selectors are NOT sent — the model has no use for them and must not
 *  echo them. Compact JSON. */
function buildPayload(siteName: string, plainSummary: string, triage: TriageItem[]): string {
  return JSON.stringify({
    siteName,
    plainSummary,
    triage: triage.map((t, id) => ({ id, rule: t.ruleId, tier: t.tier, why: t.why })),
  });
}

/**
 * Build the plain-English report summary + legal-risk triage for a scan's findings. Always computes a
 * complete deterministic result first; when the AI tier is configured it makes ONE batched GLM call to
 * warm up the prose (and optionally sharpen each `why`), falling back to the deterministic result on
 * ANY failure.
 *
 * NEVER throws and NEVER returns null: every error path resolves to the deterministic summary, so a
 * route can call this directly without `Promise.allSettled` safety.
 */
export async function generateReportSummary(
  findings: Finding[],
  opts: { siteName: string; ai?: boolean },
): Promise<ReportSummary> {
  const siteName = opts.siteName.trim() || "your site";

  // 1) Deterministic base — always valid on its own.
  const triage = buildTriage(findings);
  const plainSummary = deterministicSummary(siteName, findings.length, triage);
  const base: ReportSummary = { plainSummary, triage, source: "deterministic" };

  // 2) No model available, explicitly disabled, or nothing to summarise → deterministic, no network.
  if (opts.ai === false || !aiConfigured() || findings.length === 0) {
    return base;
  }

  // 3) ONE batched GLM call to rewrite the prose; fall back to `base` on any failure.
  try {
    const raw = await glmAsk([{ type: "text", text: buildPayload(siteName, plainSummary, triage) }], {
      system: SYSTEM_PROMPT,
      maxTokens: 1200,
    });
    const parsed = parseJsonObject<{
      plainSummary?: string;
      triage?: Array<{ id?: number; why?: string }>;
    }>(raw);

    const aiSummary = typeof parsed.plainSummary === "string" ? parsed.plainSummary.trim() : "";
    if (!aiSummary) throw new Error("empty model summary");

    // Apply any sharpened `why` over the deterministic triage, by id; keep the original otherwise so
    // the tier/selector/ruleId (the load-bearing facts) are never lost to a model miss.
    const whyById = new Map<number, string>();
    for (const r of parsed.triage ?? []) {
      if (typeof r?.id === "number" && typeof r.why === "string" && r.why.trim()) {
        whyById.set(r.id, r.why.trim());
      }
    }
    const aiTriage = triage.map((t, id) => {
      const why = whyById.get(id);
      return why ? { ...t, why } : t;
    });

    return { plainSummary: aiSummary, triage: aiTriage, source: "ai" };
  } catch (e) {
    console.error("report summary failed:", e);
    return base;
  }
}
