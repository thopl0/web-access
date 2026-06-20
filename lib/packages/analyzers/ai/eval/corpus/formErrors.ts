/**
 * Labeled eval corpus for the TEXT form-error-clarity judge (`judgeFormError`, GLM). Each case is a
 * `FormErrorCandidate` exactly as `collectFormErrors` would yield it, plus the gold label a human
 * assigned and the rationale for it. This is the regression-guard data the plan (§6/§8.4) requires
 * BEFORE the AI tier is trusted: re-running it on every prompt/model change is how a quietly-worse
 * judge gets caught.
 *
 * Coverage is intentional, not random: the one problem class the judge can emit (unhelpful-error →
 * `form-error-unclear`) across the bare-identifier shapes the prompt calls out ("Invalid", "Error",
 * "Required", "Try again", a lone "!"), AND a large set of `ok` negatives — including the *hard*
 * negatives the prompt is told NOT to flag (messages that DO name a format / rule / example / minimum,
 * and neutral helper/placeholder text that isn't an error at all). Precision is the headline target
 * (≥0.85), so the corpus is weighted toward catching false positives, the failure that erodes trust
 * fastest.
 *
 * Gold-labeling caveat (plan §6): a single author labeled these. They're the clear, defensible cases;
 * the plan calls for 2–3 expert labelers + inter-rater agreement before treating absolute numbers as
 * ground truth. Until then this guards against *regressions* (relative drift), which is its job here.
 */
import type { FormErrorCandidate } from "../../formErrors";
import type { EvalCase } from "../types";

/** Build a full `FormErrorCandidate` from the few fields a case cares about; rest get inert defaults. */
function err(over: Partial<FormErrorCandidate> & { errorText: string }): FormErrorCandidate {
  return {
    selector: '[role="alert"]',
    fieldLabel: "",
    inputType: "text",
    ...over,
  };
}

type FormErrorCase = EvalCase<FormErrorCandidate>;

export const FORM_ERROR_CORPUS: FormErrorCase[] = [
  // ── unhelpful error → "form-error-unclear" (positives) ───────────────────────────────────────
  {
    id: "bare-invalid",
    context: "forms",
    input: err({ errorText: "Invalid", fieldLabel: "Email", inputType: "email" }),
    gold: "form-error-unclear",
    notes: '"Invalid" names no correction — user can\'t tell what a valid value looks like.',
  },
  {
    id: "bare-error",
    context: "forms",
    input: err({ errorText: "Error", fieldLabel: "Phone number", inputType: "tel" }),
    gold: "form-error-unclear",
    notes: '"Error" identifies a problem but says nothing about the fix.',
  },
  {
    id: "bare-wrong",
    context: "app-ui",
    input: err({ errorText: "Wrong", fieldLabel: "Username", inputType: "text" }),
    gold: "form-error-unclear",
    notes: '"Wrong" gives no guidance on what is expected.',
  },
  {
    id: "bare-required",
    context: "forms",
    input: err({ errorText: "Required", fieldLabel: "Postcode", inputType: "text" }),
    gold: "form-error-unclear",
    notes: '"Required" alone doesn\'t describe the expected value (a borderline 3.3.3 case kept as a clear bare identifier).',
  },
  {
    id: "bare-required-field",
    context: "ecommerce",
    input: err({ errorText: "Required field", fieldLabel: "Card number", inputType: "text" }),
    gold: "form-error-unclear",
    notes: '"Required field" still says nothing about the correct format of a card number.',
  },
  {
    id: "bare-try-again",
    context: "forms",
    input: err({ errorText: "Try again", fieldLabel: "Password", inputType: "password" }),
    gold: "form-error-unclear",
    notes: '"Try again" leaves the user guessing what was wrong.',
  },
  {
    id: "bare-bang",
    context: "app-ui",
    input: err({ errorText: "!", fieldLabel: "Date of birth", inputType: "text" }),
    gold: "form-error-unclear",
    notes: "A lone exclamation mark conveys only that something is wrong, not how to fix it.",
  },
  {
    id: "bare-please-correct",
    context: "forms",
    input: err({ errorText: "Please correct this field", fieldLabel: "Address", inputType: "text" }),
    gold: "form-error-unclear",
    notes: "Asks the user to fix it without saying what is expected.",
  },
  {
    id: "bare-incorrect",
    context: "ecommerce",
    input: err({ errorText: "Incorrect value", fieldLabel: "Quantity", inputType: "number" }),
    gold: "form-error-unclear",
    notes: '"Incorrect value" names no rule, range, or format.',
  },
  {
    id: "bare-not-valid",
    context: "forms",
    input: err({ errorText: "Not valid", fieldLabel: "Email address", inputType: "email" }),
    gold: "form-error-unclear",
    notes: '"Not valid" with no example of a valid email.',
  },

  // ── helpful error → "ok" (hard negatives: DO NOT FLAG) ───────────────────────────────────────
  {
    id: "ok-email-example",
    context: "forms",
    input: err({
      errorText: "Enter a valid email address like name@example.com",
      fieldLabel: "Email",
      inputType: "email",
    }),
    gold: "ok",
    notes: "Names the expected format and gives an example — exactly what 3.3.3 wants.",
  },
  {
    id: "ok-password-min",
    context: "forms",
    input: err({
      errorText: "Password must be at least 8 characters",
      fieldLabel: "Password",
      inputType: "password",
    }),
    gold: "ok",
    notes: "States the minimum-length rule the user must satisfy.",
  },
  {
    id: "ok-password-min-terse",
    context: "app-ui",
    input: err({ errorText: "Min 8 characters", fieldLabel: "Password", inputType: "password" }),
    gold: "ok",
    notes: "Short but instructive — names the constraint; must NOT be flagged for brevity.",
  },
  {
    id: "ok-date-format",
    context: "forms",
    input: err({ errorText: "Use the format MM/DD/YYYY", fieldLabel: "Date", inputType: "text" }),
    gold: "ok",
    notes: "Names the exact expected format.",
  },
  {
    id: "ok-phone-digits",
    context: "ecommerce",
    input: err({ errorText: "Phone number must be 10 digits", fieldLabel: "Phone", inputType: "tel" }),
    gold: "ok",
    notes: "States the precise rule (10 digits).",
  },
  {
    id: "ok-must-include-number",
    context: "forms",
    input: err({
      errorText: "Must include at least one number",
      fieldLabel: "Password",
      inputType: "password",
    }),
    gold: "ok",
    notes: "Names a concrete content rule to satisfy.",
  },
  {
    id: "ok-passwords-match",
    context: "forms",
    input: err({
      errorText: "Passwords don't match — re-enter the same password",
      fieldLabel: "Confirm password",
      inputType: "password",
    }),
    gold: "ok",
    notes: "Explains the problem AND the corrective action.",
  },
  {
    id: "ok-card-length",
    context: "ecommerce",
    input: err({
      errorText: "Card number should be 16 digits with no spaces",
      fieldLabel: "Card number",
      inputType: "text",
    }),
    gold: "ok",
    notes: "Gives the exact expected format for the card number.",
  },
  {
    id: "ok-username-taken",
    context: "app-ui",
    input: err({
      errorText: "That username is taken — try a different one",
      fieldLabel: "Username",
      inputType: "text",
    }),
    gold: "ok",
    notes: "Identifies the problem and the next action; not a bare identifier.",
  },

  // ── non-error / neutral helper text → "ok" (must not be mistaken for an unhelpful error) ──────
  {
    id: "ok-helper-hint",
    context: "forms",
    input: err({
      errorText: "We'll only use this to send your receipt",
      fieldLabel: "Email",
      inputType: "email",
    }),
    gold: "ok",
    notes: "Neutral helper hint, not an error — nothing to flag.",
  },
  {
    id: "ok-placeholder-search",
    context: "marketing",
    input: err({ errorText: "Search the docs…", fieldLabel: "Search", inputType: "search" }),
    gold: "ok",
    notes: "Placeholder text, not an error message.",
  },
  {
    id: "ok-optional-hint",
    context: "blog",
    input: err({ errorText: "Optional", fieldLabel: "Website", inputType: "url" }),
    gold: "ok",
    notes: 'A field-state hint ("Optional"), not an error telling the user they did something wrong.',
  },
  {
    id: "ok-docs-note",
    context: "docs",
    input: err({
      errorText: "Tip: API keys start with sk_",
      fieldLabel: "API key",
      inputType: "text",
    }),
    gold: "ok",
    notes: "Instructive helper note describing the expected value; not an unhelpful error.",
  },

  // ── ADVERSARIAL: hard negatives that a keyword-/length-naive judge would WRONGLY flag ─────────
  {
    id: "adv-invalid-but-instructive",
    context: "forms",
    input: err({
      errorText: "Invalid — use name@example.com",
      fieldLabel: "Email",
      inputType: "email",
    }),
    gold: "ok",
    notes:
      'Keyword trap: starts with the flagged word "Invalid" yet names the expected format + example. A judge that pattern-matches the bare-identifier list misfires here; the message IS instructive.',
  },
  {
    id: "adv-required-but-format",
    context: "ecommerce",
    input: err({
      errorText: "Required: 16 digits, no spaces",
      fieldLabel: "Card number",
      inputType: "text",
    }),
    gold: "ok",
    notes:
      'Contains "Required" (a flagged identifier) but then states the exact format. The constraint makes it helpful; must NOT be flagged for the leading keyword.',
  },
  {
    id: "adv-error-prefix-instructive",
    context: "app-ui",
    input: err({
      errorText: "Error: password needs an uppercase letter",
      fieldLabel: "Password",
      inputType: "password",
    }),
    gold: "ok",
    notes:
      'Begins with "Error:" but names a concrete content rule to satisfy. Prefix-keyword trap; instructive overall.',
  },
  {
    id: "adv-terse-format-only",
    context: "forms",
    input: err({ errorText: "MM/DD/YYYY", fieldLabel: "Date of birth", inputType: "text" }),
    gold: "ok",
    notes:
      "Brevity trap: the whole error is just the expected format. Extremely short, but it tells the user exactly what to enter — flagging it for terseness would be a false positive.",
  },
  {
    id: "adv-terse-digits-only",
    context: "ecommerce",
    input: err({ errorText: "10 digits", fieldLabel: "Phone", inputType: "tel" }),
    gold: "ok",
    notes:
      "Two-word error that nonetheless states the exact rule. Short and lacks a verb, but it is instructive; precision-bias says leave it.",
  },
  {
    id: "adv-server-already-registered",
    context: "app-ui",
    input: err({
      errorText: "That email is already registered",
      fieldLabel: "Email",
      inputType: "email",
    }),
    gold: "ok",
    notes:
      "Business/server error: names a specific, true cause the user can act on (use a different email / sign in). It names no FORMAT, so a format-fixated judge may wrongly flag it, but it is not a bare identifier and clearly communicates the problem.",
  },
  {
    id: "adv-localized-instructive",
    context: "forms",
    input: err({
      errorText: "Veuillez saisir un e-mail valide, ex. nom@exemple.com",
      fieldLabel: "E-mail",
      inputType: "email",
    }),
    gold: "ok",
    notes:
      "Non-English (French) but gives format + example. A judge anchored on English phrasing could misread it; the content is fully instructive and must not be flagged.",
  },
  {
    id: "adv-emoji-instructive",
    context: "ecommerce",
    input: err({
      errorText: "⚠ Use 10 digits, no dashes",
      fieldLabel: "Phone",
      inputType: "tel",
    }),
    gold: "ok",
    notes:
      "Leads with a warning glyph (visual noise resembling a lone '!') but the text states the exact rule. The emoji must not cause a flag.",
  },
  {
    id: "adv-neutral-looks-good",
    context: "forms",
    input: err({
      errorText: "Looks good!",
      fieldLabel: "Email",
      inputType: "email",
    }),
    gold: "ok",
    notes:
      'Surfaces in an alert/live region but is a SUCCESS/validation-passed state, not an error. Ends in "!" yet flagging it as an unhelpful error would be a false positive — there is no problem to fix.',
  },
  {
    id: "adv-cross-field-rule",
    context: "app-ui",
    input: err({
      errorText: "Must match the email entered above",
      fieldLabel: "Confirm email",
      inputType: "email",
    }),
    gold: "ok",
    notes:
      "Cross-field rule: names exactly what the value must equal. Gives no format/example of its own, so a judge expecting a literal format string could misfire, but the corrective action is explicit.",
  },

  // ── ADVERSARIAL: tricky true-positives a lazy judge would let slide ───────────────────────────
  {
    id: "adv-verbose-empty",
    context: "forms",
    input: err({
      errorText: "There was a problem. Please review and try again.",
      fieldLabel: "Address",
      inputType: "text",
    }),
    gold: "form-error-unclear",
    notes:
      "Length trap in the OTHER direction: a full, polite sentence that still names no correction or expected value. Verbosity must not be mistaken for helpfulness — this is genuinely unhelpful.",
  },
  {
    id: "adv-fake-format-word",
    context: "forms",
    input: err({
      errorText: "Please enter a valid format",
      fieldLabel: "Email",
      inputType: "email",
    }),
    gold: "form-error-unclear",
    notes:
      'Says the word "format" but never states WHICH format — sounds instructive, gives zero guidance. A keyword-positive judge (sees "format") would wrongly pass it; it is unhelpful.',
  },
  {
    id: "adv-dressed-up-invalid",
    context: "ecommerce",
    input: err({
      errorText: "This field is invalid",
      fieldLabel: "Card number",
      inputType: "text",
    }),
    gold: "form-error-unclear",
    notes:
      'A grammatical sentence wrapping the bare identifier "invalid" — longer than "Invalid" but conveys exactly as little. Must still be flagged.',
  },
  {
    id: "adv-restate-label",
    context: "forms",
    input: err({ errorText: "Email is wrong", fieldLabel: "Email", inputType: "email" }),
    gold: "form-error-unclear",
    notes:
      "Only restates the field name plus a bare judgement; no example of a valid email. Unhelpful despite reading like a specific message.",
  },
];
