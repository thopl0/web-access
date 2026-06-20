/**
 * GLM-assisted eval-corpus EXPANDER — `pnpm expand-corpus <check> [n]` (tsx).
 *
 * A DEV-TIME helper that asks the FREE GLM coding-plan model to PROPOSE new labeled eval cases for one
 * check's corpus, printed to stdout for HUMAN REVIEW. It is a labeling assistant, not a labeler: it
 * NEVER writes to a corpus file or to disk — the locked constraint is that every gold label stays
 * human-reviewed before it enters the corpus (plan §6: a single author still owns the labels).
 *
 * The cost lever (the point of this tool): GLM is a flat-rate coding-plan key — effectively free per
 * call — so we spend GLM generously here to grow the corpora that, in turn, keep the METERED Gemma
 * vision judge ($10/mo cap) honest and lean. Same provider wiring + dotenv + aiConfigured() guard as
 * `scripts/eval-ai.ts`; if GLM is unconfigured it exits 1 with guidance rather than no-oping silently.
 *
 * Usage:
 *   pnpm expand-corpus <check> [n]      # propose ~n (default 8) new candidate cases for <check>
 *   pnpm expand-corpus alt-text 10
 *   pnpm expand-corpus repeated-links --json   # also dump raw JSON of the proposals
 *   pnpm expand-corpus                  # list the known checks and exit
 *
 * Checks: alt-text, link-purpose, heading-quality, page-title, form-error, color-only, repeated-links.
 */
import { config } from "dotenv";
import {
  ALT_TEXT_CORPUS,
  COLOR_ONLY_CORPUS,
  FORM_ERROR_CORPUS,
  HEADING_QUALITY_CORPUS,
  LINK_PURPOSE_CORPUS,
  PAGE_TITLE_CORPUS,
  REPEATED_LINKS_CORPUS,
  type EvalCase,
} from "../lib/packages/analyzers/ai/eval";
import { aiConfigured, glmAsk, parseJsonObject } from "../lib/packages/analyzers/ai/glm";

config(); // load .env (cwd = repo root), same as the worker / eval-ai.ts

/** Default number of cases to request; the model is asked for exactly this many. */
const DEFAULT_N = 8;
/** Hard cap on a single request — keeps the prompt + completion within the model's max_tokens budget
 *  and keeps a human's review list reasonable. If asked for more we clamp and SAY SO (never silently). */
const MAX_N = 20;
/** How many existing cases to hand the model as few-shot anchors (a spread, not the whole corpus). */
const FEW_SHOT_SAMPLE = 10;

/**
 * One registered check the expander can grow. `corpus` supplies the few-shot anchors AND is the shape
 * the generated cases must match; `golds` is the closed set of allowed labels (rule ids + "ok") the
 * model may assign; `inputShape` describes the `input` (Candidate) fields so the model emits the right
 * keys; `builder` is the corpus's tiny helper, named so the printed TS is copy-paste-ready.
 */
interface CheckSpec<Input> {
  /** CLI name, matching `pnpm eval`'s target names. */
  name: string;
  /** One-line description of what this judge decides (so generated cases match its remit + traps). */
  about: string;
  /** Existing corpus — few-shot source + shape reference. Read-only here; never mutated/written. */
  corpus: EvalCase<Input>[];
  /** Allowed gold labels: the rule ids the judge can emit, plus "ok". */
  golds: string[];
  /** Plain-English description of the `input` object's fields (keys + meaning), for the prompt. */
  inputShape: string;
  /** Name of the corpus's builder helper (e.g. "img"), so we can print `input: img({...})`. */
  builder: string;
}

// A check whose Input type is erased to `unknown` for the registry list (each entry stays internally
// typed via `spec<Input>()`); the expander only ever reads `corpus`, never inspects an `input` value.
type AnyCheckSpec = CheckSpec<unknown>;

function spec<Input>(s: CheckSpec<Input>): AnyCheckSpec {
  return s as unknown as AnyCheckSpec;
}

const CHECKS: AnyCheckSpec[] = [
  spec({
    name: "alt-text",
    about:
      "Judges the QUALITY of an image's alt text from text alone (no pixels): flag a filename/opaque " +
      "code as alt, a vague placeholder, or redundant 'image of…' phrasing. Hard negatives it must " +
      "NOT flag: slugs that read as real product/brand names, terse-but-genuine descriptions, and " +
      "genuinely decorative empty alt.",
    corpus: ALT_TEXT_CORPUS,
    golds: ["alt-text-filename", "alt-text-uninformative", "alt-text-redundant", "ok"],
    inputShape:
      "alt (string, required), filename (string), inLink (bool), linkText (string), caption " +
      "(string), ariaLabel (string), declaredDecorative (bool; true iff alt is empty), width, height " +
      "(numbers). Set only the fields a case cares about; the builder fills inert defaults.",
    builder: "img",
  }),
  spec({
    name: "link-purpose",
    about:
      "WCAG 2.4.4 — is a link's purpose clear from its accessible name plus nearby context? Flag a " +
      "generic name ('click here', 'read more', bare URL) that the context never disambiguates. Hard " +
      "negatives it must NOT flag: a generic phrase that the surrounding heading/card/list text DOES " +
      "name, a real descriptive name, or an aria-label that supplies the purpose.",
    corpus: LINK_PURPOSE_CORPUS,
    golds: ["link-purpose-unclear", "ok"],
    inputShape:
      "linkText (string, required — the accessible name announced), href (string), context (string — " +
      "the surrounding sentence/list-item + nearest heading), ariaLabel (string), inListOrNav (bool).",
    builder: "link",
  }),
  spec({
    name: "heading-quality",
    about:
      "WCAG 2.4.6 / 1.3.1 — does a heading describe the section it labels? Flag vague/placeholder/" +
      "boilerplate headings ('More', 'Info', 'Section 1') over real content. Hard negatives it must " +
      "NOT flag: short-but-descriptive labels ('Pricing', 'FAQ'), proper nouns / product names, and " +
      "genuine 'Welcome'/'Overview' intros.",
    corpus: HEADING_QUALITY_CORPUS,
    golds: ["heading-uninformative", "ok"],
    inputShape:
      "text (string, required — the heading), sectionPreview (string, required — a clip of the content " +
      "that follows the heading), level (number, 1-6), precedingText (string, optional).",
    builder: "heading",
  }),
  spec({
    name: "page-title",
    about:
      "WCAG 2.4.2 — does the <title> describe the page? Flag default/scaffold titles ('Document', " +
      "'React App', 'Create Next App'), a bare brand name with no page context, or a single generic " +
      "word. Hard negatives it must NOT flag: a real descriptor that contains the brand, a short-but-" +
      "descriptive title, or 'Home' on a genuine home page.",
    corpus: PAGE_TITLE_CORPUS,
    golds: ["page-title-uninformative", "ok"],
    inputShape:
      "title (string, required — document.title), h1 (string — the page's first h1), url (string), " +
      "metaDescription (string).",
    builder: "title",
  }),
  spec({
    name: "form-error",
    about:
      "WCAG 3.3.1 / 3.3.3 — is a form error message helpful? Flag bare identifiers that name no " +
      "correction ('Invalid', 'Error', 'Required', 'Try again', a lone '!'). Hard negatives it must " +
      "NOT flag: messages that DO name a format/rule/example/minimum, and neutral helper/placeholder " +
      "text that is not an error at all.",
    corpus: FORM_ERROR_CORPUS,
    golds: ["form-error-unclear", "ok"],
    inputShape:
      "errorText (string, required — the visible error), fieldLabel (string — the field's label), " +
      "inputType (string — e.g. 'email', 'password', 'text').",
    builder: "err",
  }),
  spec({
    name: "color-only",
    about:
      "WCAG 1.4.1 — is colour the SOLE cue identifying a control or state? Flag an imperative pointing " +
      "only at a colour, a 'marked/shown in <colour>' status cue, or a colour-coded chart/legend with " +
      "no other label. This check is FALSE-POSITIVE PRONE, so weight toward HARD negatives it must NOT " +
      "flag: brands/proper nouns, descriptive prose, colour-alongside-another-cue, product/option " +
      "names, and idioms.",
    corpus: COLOR_ONLY_CORPUS,
    golds: ["color-only-reference", "ok"],
    inputShape:
      "text (string, required — the sentence mentioning a colour as a cue), elementContext (string, " +
      "optional — a nearby heading/label/role to disambiguate).",
    builder: "snip",
  }),
  spec({
    name: "repeated-links",
    about:
      "WCAG 2.4.4 — a GROUP of same-named links pointing at 2+ distinct destinations: is the group " +
      "genuinely ambiguous? Flag when the shared name plus per-link context cannot tell the targets " +
      "apart. Hard negatives it must NOT flag: per-link context that already disambiguates, pagination " +
      "numbers, Next/Previous pairs, tracking-param-only 'distinct' URLs (one real page), in-page " +
      "anchors, and self-describing names.",
    corpus: REPEATED_LINKS_CORPUS,
    golds: ["ambiguous-repeated-links", "ok"],
    inputShape:
      "linkText (string, required — the shared accessible name), destinations (string[], required — " +
      "2+ distinct hrefs), contexts (string[] — each link's surrounding text, same length as a " +
      "realistic occurrence count), occurrences (number, optional). selector is auto-filled.",
    builder: "group",
  }),
];

const BANNER = [
  "=".repeat(92),
  "  CANDIDATE CASES — HUMAN REVIEW REQUIRED.",
  "  Do not paste blindly: verify each gold label and that the input is realistic before adding to",
  "  the corpus. These were PROPOSED by GLM, not labeled by a human. Nothing has been written to any",
  "  corpus file — copy only the cases you have checked.",
  "=".repeat(92),
].join("\n");

/** A proposed case as we ask GLM to shape it (validated loosely before printing). */
interface ProposedCase {
  id: string;
  context: string;
  input: Record<string, unknown>;
  gold: string;
  notes: string;
}

/** Pick a spread of existing cases as few-shot anchors (evenly sampled, so positives + negatives show). */
function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items.slice();
  const step = items.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor(i * step)]!);
  return out;
}

/** Render one proposed case as a ready-to-paste TS EvalCase entry matching the corpus's builder. */
function renderCase(c: ProposedCase, builder: string): string {
  // Re-stringify the input through the builder call so the printed code matches the corpus's style
  // (`input: img({ ... })`). JSON.stringify gives valid TS object-literal syntax for this data.
  const inputLiteral = JSON.stringify(c.input);
  return [
    "  {",
    `    id: ${JSON.stringify(c.id)},`,
    `    context: ${JSON.stringify(c.context)},`,
    `    input: ${builder}(${inputLiteral}),`,
    `    gold: ${JSON.stringify(c.gold)},`,
    `    notes: ${JSON.stringify(c.notes)},`,
    "  },",
  ].join("\n");
}

const SYSTEM_PROMPT =
  "You generate NEW labeled accessibility eval cases for a regression test corpus. You are assisting " +
  "a human labeler — your output is reviewed by hand, never used blindly. Produce realistic, varied " +
  "cases that a real web page would contain. Deliberately mix TRICKY POSITIVES with HARD-NEGATIVE " +
  "'ok' traps the judge must NOT over-flag — the corpus is precision-biased, so good hard negatives " +
  "are the most valuable thing you can add. Vary the page context across marketing, ecommerce, blog, " +
  "docs, app-ui, and forms. Every gold label MUST come from the allowed set. Reply ONLY with JSON.";

function buildUserPrompt(check: AnyCheckSpec, n: number): string {
  const anchors = sample(check.corpus, FEW_SHOT_SAMPLE);
  const existingIds = check.corpus.map((c) => c.id);
  const fewShot = anchors.map((c) => ({
    id: c.id,
    context: c.context,
    input: c.input,
    gold: c.gold,
    notes: c.notes,
  }));
  return [
    `Check: ${check.name}`,
    `What this judge decides: ${check.about}`,
    `Allowed gold labels (use ONLY these): ${JSON.stringify(check.golds)}`,
    `The "input" object fields: ${check.inputShape}`,
    "",
    `Here are ${fewShot.length} EXISTING cases from this corpus as style/shape anchors:`,
    JSON.stringify(fewShot, null, 2),
    "",
    `Existing ids you must NOT reuse: ${JSON.stringify(existingIds)}`,
    "",
    `Generate exactly ${n} NEW cases. Requirements:`,
    "- Do NOT duplicate any existing id, nor any existing input (no near-identical text/values).",
    "- Each case: { id (short kebab-case, unique), context (one of marketing/ecommerce/blog/docs/" +
      "app-ui/forms), input (only the fields above), gold (from the allowed set), notes (one plain " +
      "sentence saying WHY that gold is defensible) }.",
    "- Span both positives and hard-negative 'ok' traps; lean toward hard negatives.",
    `Reply ONLY with JSON: {"cases":[ ... ${n} objects ... ]}.`,
  ].join("\n");
}

function printUsage(): void {
  console.log("Usage: pnpm expand-corpus <check> [n] [--json]");
  console.log("");
  console.log("Proposes new labeled eval cases for a check's corpus (GLM, free) for HUMAN REVIEW.");
  console.log("Never writes to any corpus file or to disk.");
  console.log("");
  console.log(`Known checks: ${CHECKS.map((c) => c.name).join(", ")}`);
  console.log(`Default n = ${DEFAULT_N}, capped at ${MAX_N}.`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (positional.length === 0 || positional[0] === "help") {
    printUsage();
    return;
  }

  const checkName = positional[0]!;
  const check = CHECKS.find((c) => c.name === checkName);
  if (!check) {
    console.error(
      `Unknown check ${JSON.stringify(checkName)}. Known: ${CHECKS.map((c) => c.name).join(", ")}`,
    );
    process.exit(1);
  }

  // Parse the optional count; default DEFAULT_N. Reject nonsense rather than guess.
  let n = DEFAULT_N;
  if (positional[1] !== undefined) {
    const parsed = Number(positional[1]);
    if (!Number.isInteger(parsed) || parsed < 1) {
      console.error(`Invalid count ${JSON.stringify(positional[1])} — pass a positive integer.`);
      process.exit(1);
    }
    n = parsed;
  }
  // Never silently truncate: if we clamp, say so loudly on stderr.
  if (n > MAX_N) {
    console.error(`Requested ${n} cases; capping to ${MAX_N} (per-request limit). Re-run for more.`);
    n = MAX_N;
  }

  if (!aiConfigured()) {
    console.error(
      "GLM is not configured — set GLM_API_KEY (see .env.example) to generate candidate cases.",
    );
    process.exit(1);
  }

  console.error(`Asking GLM for ${n} candidate "${check.name}" cases…`);
  const raw = await glmAsk([{ type: "text", text: buildUserPrompt(check, n) }], {
    system: SYSTEM_PROMPT,
    // Cases are larger than a one-line verdict; give the completion room.
    maxTokens: 4096,
  });

  let parsed: { cases?: ProposedCase[] };
  try {
    parsed = parseJsonObject<{ cases?: ProposedCase[] }>(raw);
  } catch (e) {
    console.error("Could not parse GLM's response as JSON. Raw output follows:\n");
    console.error(raw);
    throw e;
  }

  const cases = Array.isArray(parsed.cases) ? parsed.cases : [];
  if (cases.length === 0) {
    console.error("GLM returned no cases. Raw output follows:\n");
    console.error(raw);
    process.exit(1);
  }

  // Surface (don't silently drop) any case whose gold isn't in the allowed set — a reviewer needs to see it.
  const offLabel = cases.filter((c) => !check.golds.includes(c.gold));
  if (offLabel.length > 0) {
    console.error(
      `Note: ${offLabel.length} case(s) used a gold outside the allowed set ${JSON.stringify(check.golds)} — ` +
        "flagged inline, scrutinise these especially.",
    );
  }

  if (json) {
    console.log(BANNER);
    console.log(JSON.stringify({ check: check.name, count: cases.length, cases }, null, 2));
    return;
  }

  console.log(BANNER);
  console.log("");
  console.log(`// ${cases.length} proposed case(s) for the ${check.name} corpus — paste into ${check.builder}(...)-built array after review.`);
  console.log("");
  for (const c of cases) {
    if (!check.golds.includes(c.gold)) {
      console.log(`  // !! gold ${JSON.stringify(c.gold)} is NOT in the allowed set — REVIEW before using.`);
    }
    console.log(renderCase(c, check.builder));
  }
  console.log("");
  console.log(`// End of ${cases.length} candidate(s). Reminder: ${"HUMAN REVIEW REQUIRED"} — verify every gold label.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
