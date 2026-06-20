/**
 * Tier-3 AI judge (text-only): form ERROR & instruction CLARITY (WCAG 3.3.1 Error Identification +
 * 3.3.3 Error Suggestion). The deterministic tiers and axe can tell whether an error is *programmatically
 * associated* with a field (aria-invalid, aria-errormessage, role="alert"), but they can't read the
 * error and judge whether it actually HELPS the user fix the problem.
 *
 * 3.3.3 wants an error message that describes the correction, not just that something is wrong. A bare
 * "Invalid", "Error", "Wrong", "Required", "Try again", or a lone red "!" identifies a problem but
 * leaves the user guessing what to do — for someone with a cognitive disability that's a dead end.
 *
 * This judge reasons over TEXT the model can actually see: the error string, the associated field's
 * label, and the input type. No pixels — GLM's coding-plan endpoint is text-only (see `glm.ts`).
 *
 * Precision-biased: a message that DOES explain the fix ("Enter a valid email like name@example.com",
 * "Password must be at least 8 characters") is fine and must NOT be flagged. So is generic helper /
 * placeholder text that isn't an error at all — the collect step pre-filters those out, and the prompt
 * is told to leave them alone too.
 */
import type { Page } from "playwright";
import type { Finding } from "@web-access/shared";
import { ensureEvalHelpers } from "../util";
import { aiConfigured, glmAsk, parseJsonObject } from "./glm";
import { meetsConfidence, parseConfidence } from "./gate";

/** A visible form error message and the text context we can give the model, collected in-page. */
export interface FormErrorCandidate {
  selector: string;
  /** The visible error text shown to the user (the thing 3.3.3 wants to be helpful). */
  errorText: string;
  /** Label of the field this error is associated with, if we could resolve one (`""` = none found). */
  fieldLabel: string;
  /** `type` of the associated input (e.g. "email", "password", "text"), `""` when not resolvable. */
  inputType: string;
}

/** Cap how many errors we send — each is a (free but latency-costing) model call. */
const MAX_ERRORS = 15;
/** Only judge terse-enough messages: a long message has room to be instructive, so the cheap
 *  deterministic pre-filter assumes it already is and skips it (precision over recall). */
const MAX_JUDGEABLE_CHARS = 80;

/**
 * Collect visible form error messages with their associated field label + input type.
 *
 * Sources, in priority order: `aria-errormessage` / `aria-describedby` referenced from an
 * `aria-invalid="true"` field, `role="alert"` / `aria-live` regions, and common error CSS classes
 * sitting near an input. Many pages show no errors at scan time → this returns `[]` and the run
 * no-ops. The pre-filter (short/terse/generic only) happens here so we never pay for a model call on
 * a message that's already clearly instructive.
 */
export async function collectFormErrors(page: Page): Promise<FormErrorCandidate[]> {
  await ensureEvalHelpers(page); // shim esbuild's __name into the page (see util.ts)
  const raw = await page.evaluate(
    ({ maxChars }) => {
      function cssPath(node: Element): string {
        if (node.id) return `#${CSS.escape(node.id)}`;
        const parts: string[] = [];
        let el: Element | null = node;
        while (el && el.nodeType === 1 && el.tagName !== "HTML") {
          let part = el.tagName.toLowerCase();
          const parent: Element | null = el.parentElement;
          if (parent) {
            const sameTag = Array.from(parent.children).filter((c) => c.tagName === el!.tagName);
            if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
          }
          parts.unshift(part);
          el = parent;
        }
        return parts.join(" > ");
      }

      const clip = (s: string | null | undefined, n: number) =>
        (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

      /** Is this element actually visible (an error hidden by CSS isn't shown to the user)? */
      function visible(el: Element): boolean {
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }

      /** Resolve the label text for an input/field (label[for], wrapping <label>, aria-label). */
      function labelFor(field: Element): string {
        const id = field.getAttribute("id");
        if (id) {
          const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (lbl?.textContent) return clip(lbl.textContent, 80);
        }
        const wrapping = field.closest("label");
        if (wrapping?.textContent) return clip(wrapping.textContent, 80);
        const aria = field.getAttribute("aria-label");
        if (aria) return clip(aria, 80);
        const labelledby = field.getAttribute("aria-labelledby");
        if (labelledby) {
          const ref = document.getElementById(labelledby.split(/\s+/)[0] ?? "");
          if (ref?.textContent) return clip(ref.textContent, 80);
        }
        return "";
      }

      /** Find the input/field an error element describes, to pull its label + type. */
      function fieldForError(errEl: Element, errId: string | null): Element | null {
        // A field pointing AT this error via aria-errormessage / aria-describedby.
        if (errId) {
          const byErr = document.querySelector(
            `[aria-errormessage~="${CSS.escape(errId)}"], [aria-describedby~="${CSS.escape(errId)}"]`,
          );
          if (byErr) return byErr;
        }
        // Otherwise the nearest invalid field, then any field, in the error's container.
        const container = errEl.closest("label, .field, .form-group, .input-group, fieldset, form, div");
        if (container) {
          return (
            container.querySelector('[aria-invalid="true"]') ??
            container.querySelector("input, select, textarea")
          );
        }
        return null;
      }

      const seen = new Set<Element>();
      const out: {
        selector: string;
        errorText: string;
        fieldLabel: string;
        inputType: string;
      }[] = [];

      const push = (el: Element) => {
        if (seen.has(el) || !visible(el)) return;
        const errorText = clip(el.textContent, 200);
        if (!errorText) return;
        seen.add(el);
        const errId = el.getAttribute("id");
        const field = fieldForError(el, errId);
        out.push({
          selector: cssPath(el),
          errorText,
          fieldLabel: field ? labelFor(field) : "",
          inputType: field ? clip(field.getAttribute("type") ?? field.tagName.toLowerCase(), 24) : "",
        });
      };

      // 1. Error messages referenced by an invalid field (the most reliable association).
      for (const field of Array.from(document.querySelectorAll('[aria-invalid="true"]'))) {
        const refs = `${field.getAttribute("aria-errormessage") ?? ""} ${field.getAttribute("aria-describedby") ?? ""}`;
        for (const id of refs.split(/\s+/).filter(Boolean)) {
          const el = document.getElementById(id);
          if (el) push(el);
        }
      }
      // 2. Live regions / alerts (forms announce errors here).
      for (const el of Array.from(
        document.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"]'),
      )) {
        push(el);
      }
      // 3. Common error classes sitting near inputs.
      for (const el of Array.from(
        document.querySelectorAll(
          '.error, .field-error, .form-error, .invalid-feedback, .help-block.error, .error-message, .input-error, [class*="errorText"]',
        ),
      )) {
        push(el);
      }

      // Pre-filter: only keep terse messages plausibly unhelpful; skip clearly-instructive long ones.
      return out.filter((c) => c.errorText.length > 0 && c.errorText.length <= maxChars);
    },
    { maxChars: MAX_JUDGEABLE_CHARS },
  );

  return raw.slice(0, MAX_ERRORS);
}

/** The judge's verdict for one form error message. `ok` also covers "not confident enough to flag". */
interface Verdict {
  issue: "ok" | "unhelpful-error";
  /** How sure the model is this is a real, defensible problem. Drives the abstention gate (see
   *  `gate.ts`): a flag below the floor is dropped rather than shown. Parsed leniently. */
  confidence?: string;
  /** One-sentence, layperson explanation of what's missing (empty when ok). */
  reason: string;
}

const SYSTEM_PROMPT =
  "You are an accessibility expert judging whether a form ERROR message tells the user HOW to fix the " +
  "problem (WCAG 3.3.3 Error Suggestion). You are given the visible error text, the field's label, " +
  "and the input type. Judge ONE of:\n" +
  "- unhelpful-error: the message says SOMETHING is wrong but does NOT describe the correction or what " +
  'is expected. Bare identifiers like "Invalid", "Error", "Wrong", "Required", "Required field", ' +
  '"Try again", "Please correct this field", or a lone "!" identify a problem but give the user no ' +
  "way to know what to do.\n" +
  "- ok: the message explains how to fix it or what is expected — it names a format, a rule, a " +
  'minimum, an example, or the allowed values (e.g. "Enter a valid email like name@example.com", ' +
  '"Password must be at least 8 characters", "Use MM/DD/YYYY", "Phone must be 10 digits"). Also ok if ' +
  "the text is NOT an error at all (a neutral helper hint or placeholder), or you lack enough context " +
  "to judge.\n" +
  "DO NOT FLAG: any message that names what to do, a format, an example, or a constraint — even a " +
  'short one (e.g. "Min 8 characters", "Must include a number"). DO NOT FLAG generic non-error ' +
  "helper text or placeholders. DO NOT FLAG a message just for being short if it is still " +
  "instructive.\n" +
  "Judge the WHOLE message, not single words: a message that merely CONTAINS a word like " +
  '"Invalid", "Error", or "Required" is fine if the rest of it still names a format, example, rule, ' +
  'or corrective action (e.g. "Invalid — use name@example.com", "Required: 16 digits"). A specific, ' +
  "true cause the user can act on (e.g. an email already in use, or a value that must match another " +
  "field) is ok even if it states no literal format. Do not flag success/validation-passed messages " +
  "or non-English text that is itself instructive.\n" +
  "Be PRECISION-biased: only flag a CLEAR, defensible problem; under ANY doubt answer ok. Also rate " +
  'your confidence that the problem is real: "high" = obvious/unambiguous, "medium" = likely but some ' +
  'doubt, "low" = a guess. Use "high" when you answer ok. Reply ONLY with JSON: {"issue":"...",' +
  '"confidence":"high|medium|low","reason":"..."} — reason is one plain sentence (empty when ok).';

const RULE_ID = "form-error-unclear";

/**
 * Ask GLM to judge whether one form error message describes the correction (3.3.3). Returns a Finding
 * for a clearly unhelpful message, else null. Exported (not just used by `runFormErrorJudge`) so the
 * eval harness grades this EXACT path — same prompt, model call, and parsing the production scan uses
 * — rather than a drifting copy. Page-free: the harness drives it directly with corpus inputs.
 */
export async function judgeFormError(candidate: FormErrorCandidate): Promise<Finding | null> {
  // Nothing to judge without an error string.
  if (!candidate.errorText.trim()) return null;

  const context = [
    `error message: ${JSON.stringify(candidate.errorText)}`,
    candidate.fieldLabel ? `field label: ${JSON.stringify(candidate.fieldLabel)}` : `field label: (unknown)`,
    candidate.inputType ? `input type: ${candidate.inputType}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await glmAsk([{ type: "text", text: context }], { system: SYSTEM_PROMPT });
  const verdict = parseJsonObject<Verdict>(raw);
  if (verdict.issue !== "unhelpful-error") return null; // "ok" or any unrecognised label — ignore.
  // Abstention gate: a flag the model isn't sure enough about is dropped, not shown (see gate.ts).
  if (!meetsConfidence(parseConfidence(verdict.confidence))) return null;

  return {
    ruleId: RULE_ID,
    source: "ai",
    tier: 3,
    wcag: ["3.3.1", "3.3.3"],
    impact: "serious",
    selector: candidate.selector,
    htmlSnippet: `<span role="alert">${candidate.errorText.slice(0, 80)}</span>`,
    message:
      verdict.reason ||
      "This error message tells the user something is wrong but not how to fix it.",
  };
}

/**
 * Tier-3 entry point: run the AI form-error-clarity judge over a rendered page. No-ops (returns `[]`)
 * when no GLM key is configured, so the deterministic tiers work standalone. Each error is judged
 * independently; a single failed/timed-out judgment never drops the rest.
 */
export async function runFormErrorJudge(page: Page): Promise<Finding[]> {
  if (!aiConfigured()) return [];
  const candidates = await collectFormErrors(page);
  if (candidates.length === 0) return [];

  const results = await Promise.allSettled(candidates.map((c) => judgeFormError(c)));
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) findings.push(r.value);
    else if (r.status === "rejected") console.error("ai form-error judge failed:", r.reason);
  }
  return findings;
}
