/**
 * Tier-3 AI enrichment (text-only): turn the deterministic analyzers' generic, per-rule developer
 * messages ("Elements must meet minimum color contrast ratio thresholds") into specific,
 * plain-language guidance about the ACTUAL offending element ("The 'Subscribe' button's text is too
 * low-contrast against its background to read comfortably"), for non-technical site owners. It only
 * has the element's HTML + the generic message to work from, so it must NOT invent specifics it
 * wasn't given (exact colors, ratios, sizes) — see the prompt below.
 *
 * One batched GLM call per scan (text-only — works on the coding-plan endpoint, see `glm.ts`).
 * Findings are deduped by (rule + element HTML) so identical spots cost one slot, and each item
 * carries an explicit `id` so the model's reply can't drift out of alignment with the inputs.
 */
import type { Finding } from "@web-access/shared";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";

export interface FindingExplanation {
  /** Optional short, specific headline. */
  title?: string;
  /** What's wrong with THIS element, in plain language. */
  what: string;
  /** Concrete fix, in plain language. */
  fix: string;
}

/** Cap items per scan to bound tokens/latency; findings beyond this keep their generic message. */
const MAX_ITEMS = 25;

const SYSTEM_PROMPT =
  "You rewrite web-accessibility issues into specific, plain-language guidance for non-technical " +
  "site owners (people building sites with AI tools like Lovable, v0, Wix). You're given a list of " +
  "issues; each has a rule id, a generic developer message, the issue severity, and the HTML of the " +
  "offending element. For EACH issue write:\n" +
  "- what: 1-2 short sentences saying specifically what's wrong with THIS element and why it matters " +
  "to real visitors. Use the HTML to be concrete (name the element by its visible text, label, or " +
  "purpose). No jargon, no CSS selectors, no rule ids.\n" +
  "- fix: one short sentence with a concrete fix.\n" +
  "CRITICAL: only state facts present in the given HTML or message. Do NOT invent specifics you " +
  "weren't given — no color names, contrast ratios, pixel sizes, or counts. If the offending detail " +
  "isn't in the HTML (e.g. the actual colors of a contrast issue), describe the problem and fix in " +
  "general terms (\"this text is too low-contrast against its background\") instead of guessing.\n" +
  "Keep each field under ~240 characters. Return ONLY JSON of the form " +
  '{"items":[{"id":0,"what":"...","fix":"..."}]} — exactly one entry per input id.';

interface EnrichItem {
  id: number;
  rule: string;
  severity: string;
  message: string;
  html: string;
}

/**
 * Produce an explanation for each finding, aligned to the input array (`null` where not enriched:
 * AI unconfigured, an already-specific AI finding, over the cap, or a model miss). Never throws —
 * on any failure it returns all-nulls so the caller just stores the generic messages.
 */
export async function enrichFindings(findings: Finding[]): Promise<(FindingExplanation | null)[]> {
  const out: (FindingExplanation | null)[] = findings.map(() => null);
  if (!aiConfigured() || findings.length === 0) return out;

  // Dedupe by (rule + element HTML); only the deterministic tiers need rewriting (Tier-3 "ai"
  // findings already carry a specific message).
  const keyToIndices = new Map<string, number[]>();
  const items: EnrichItem[] = [];
  const keyToItemId = new Map<string, number>();

  findings.forEach((f, i) => {
    if (f.source === "ai") return;
    const key = `${f.ruleId}\n${f.htmlSnippet}`;
    const seen = keyToIndices.get(key);
    if (seen) {
      seen.push(i);
      return;
    }
    keyToIndices.set(key, [i]);
    if (items.length < MAX_ITEMS) {
      keyToItemId.set(key, items.length);
      items.push({
        id: items.length,
        rule: f.ruleId,
        severity: f.impact ?? "",
        message: f.message,
        html: f.htmlSnippet,
      });
    }
  });

  if (items.length === 0) return out;

  let parsed: { items?: Array<{ id: number; title?: string; what?: string; fix?: string }> };
  try {
    const raw = await glmAsk([{ type: "text", text: JSON.stringify({ issues: items }) }], {
      system: SYSTEM_PROMPT,
      maxTokens: 3000,
    });
    parsed = parseJsonObject(raw);
  } catch (e) {
    console.error("ai enrich failed:", e);
    return out;
  }

  const byItemId = new Map<number, FindingExplanation>();
  for (const r of parsed.items ?? []) {
    if (typeof r?.id !== "number" || !r.what || !r.fix) continue;
    byItemId.set(r.id, {
      ...(r.title ? { title: r.title } : {}),
      what: r.what,
      fix: r.fix,
    });
  }

  for (const [key, indices] of keyToIndices) {
    const itemId = keyToItemId.get(key);
    if (itemId === undefined) continue; // beyond the cap
    const expl = byItemId.get(itemId);
    if (!expl) continue;
    for (const i of indices) out[i] = expl;
  }
  return out;
}
