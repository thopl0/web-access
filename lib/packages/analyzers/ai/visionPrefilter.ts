/**
 * FREE pre-filter for the METERED vision judge (the cost lever, plan §cost).
 *
 * The vision judge (`visionJudge.ts`) calls Gemma (Cloudflare Workers AI via the AI Gateway) once
 * PER IMAGE — metered against a hard $10/mo spend cap. GLM, by contrast, is a flat-rate coding-plan
 * key: effectively FREE per call. So before we spend Gemma budget screenshotting and judging every
 * candidate, we spend ONE free GLM call to decide which images actually WARRANT a pixel-level look —
 * shrinking the metered bill without losing real findings.
 *
 * The two questions the vision judge answers both need pixels: (1) alt-FIDELITY — alt is present but
 * might not match what's shown; (2) DECORATIVE misclassification — declared decorative but maybe
 * meaningful. This pre-filter can't see pixels, but it CAN read each candidate's text context and
 * cheaply rule out images where a vision check is moot (alt already specific + nothing hints a
 * mismatch; aria-hidden images whose alt is never announced).
 *
 * SAFETY PROPERTY — precision-biased toward KEEPING (the OPPOSITE of the judges' precision-toward-ok
 * bias): skipping an image that has a real vision problem is a MISSED finding; an extra Gemma call is
 * a fraction of a cent. So we KEEP under any doubt and DROP only the clearly-moot. Every fallback —
 * unrecognised ids, omitted ids, errors, timeouts, bad JSON — resolves to KEEP. This pass NEVER drops
 * vision coverage on its own; on any failure it returns ALL candidates unchanged (fail-OPEN).
 */
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";
import type { ImageCandidate } from "./altText";

const SYSTEM_PROMPT =
  "You triage images for a PIXEL-LEVEL accessibility vision check that costs money per image. You " +
  "CANNOT see the images — you only get their text context. A later vision model (which CAN see the " +
  "pixels) checks each image you keep for two problems: (1) alt-FIDELITY — the alt text is present " +
  "but may not actually match what the image shows; (2) DECORATIVE misclassification — the image was " +
  "declared decorative but may actually carry meaning a blind user needs.\n" +
  "Your job: decide which images genuinely WARRANT that paid vision check, and which are a clear " +
  "waste of it.\n" +
  "BE BIASED TOWARD KEEPING. Missing a real problem is far worse than an extra check. KEEP an image " +
  "whenever there is ANY doubt. Only DROP an image when a vision check is CLEARLY moot, i.e.:\n" +
  "- its alt text is already specific and plausibly a complete, accurate description, AND nothing in " +
  "the context (filename, caption, link text) hints at a mismatch; OR\n" +
  "- it is aria-hidden (its alt is never announced to a screen reader, so there is nothing to check).\n" +
  "When unsure, KEEP. Do NOT drop an image just because its alt looks fine in text — the vision check " +
  "exists precisely to catch alt that READS fine but does not match the pixels; only drop when the " +
  "alt is specific AND there is no reason to suspect the pixels differ.\n" +
  'Reply ONLY with JSON of the form {"keep":[0,2,3]} — the ids of the images to KEEP for the vision ' +
  "check. Omit ids to drop. If you are unsure about any image, include its id.";

/** One image's text context handed to GLM. No pixels — GLM's coding endpoint can't see them. */
interface PrefilterItem {
  id: number;
  alt: string;
  filename: string;
  declaredDecorative: boolean;
  ariaHidden: boolean;
  inLink: boolean;
  linkText: string;
  caption: string;
  width: number;
  height: number;
}

/**
 * Decide which candidate images warrant the metered vision check, using ONE free GLM call over their
 * TEXT context. Returns the kept candidates in their original order.
 *
 * No-ops (returns the input unchanged) when GLM is unconfigured or there is at most one candidate —
 * so the vision judge behaves exactly as it does today when GLM is unavailable, and there is nothing
 * worth saving on a trivial set.
 *
 * FAIL-OPEN: anything the model omits or returns as an unknown id is KEPT, and on ANY
 * error/timeout/bad-JSON ALL candidates are returned unchanged. This pass never throws and never
 * drops vision coverage on its own.
 */
export async function prefilterImagesForVision(
  candidates: ImageCandidate[],
): Promise<ImageCandidate[]> {
  // No-op: GLM off (judge behaves as today), or too few to bother saving on.
  if (!aiConfigured() || candidates.length <= 1) return candidates;

  const items: PrefilterItem[] = candidates.map((c, id) => ({
    id,
    alt: c.alt,
    filename: c.filename,
    declaredDecorative: c.declaredDecorative,
    ariaHidden: c.ariaHidden,
    inLink: c.inLink,
    linkText: c.linkText,
    caption: c.caption,
    width: c.width,
    height: c.height,
  }));

  try {
    const raw = await glmAsk([{ type: "text", text: JSON.stringify({ images: items }) }], {
      system: SYSTEM_PROMPT,
    });
    const parsed = parseJsonObject<{ keep?: unknown }>(raw);

    // Collect the ids the model says to keep. Anything non-numeric/out-of-range is ignored here, but
    // because we KEEP-by-default below, a garbled list only ever errs toward keeping more.
    const keepIds = new Set<number>();
    if (Array.isArray(parsed.keep)) {
      for (const v of parsed.keep) {
        if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < candidates.length) {
          keepIds.add(v);
        }
      }
    }

    // If the model returned no usable keep-list at all, treat it as "keep everything" (fail-safe):
    // a pre-filter that drops every image would silently kill vision coverage.
    if (keepIds.size === 0) return candidates;

    // Map kept ids back to the original objects, preserving order.
    const kept = candidates.filter((_, id) => keepIds.has(id));
    return kept.length > 0 ? kept : candidates;
  } catch (e) {
    // Fail-OPEN: a pre-filter failure must never reduce what the vision judge sees.
    console.error("ai vision pre-filter failed:", e);
    return candidates;
  }
}
