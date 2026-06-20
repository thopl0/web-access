/**
 * Labeled eval corpus for the TEXT alt-text-quality judge (`judgeAltText`, GLM). Each case is an
 * `ImageCandidate` exactly as `collectImages` would yield it, plus the gold label a human assigned
 * and the rationale for it. This is the regression-guard data the plan (§6/§8.4) requires BEFORE the
 * AI tier is trusted: re-running it on every prompt/model change is how a quietly-worse judge gets
 * caught.
 *
 * Coverage is intentional, not random: every problem class the judge can emit (filename-as-alt,
 * uninformative, redundant phrasing) AND a large set of `ok` negatives — including the *hard*
 * negatives the prompt is told NOT to flag (product slugs that read as names, terse-but-real
 * descriptions). Precision is the headline target (≥0.85), so the corpus is weighted toward catching
 * false positives, the failure that erodes user trust fastest.
 *
 * Gold-labeling caveat (plan §6): a single author labeled these. They're the clear, defensible cases;
 * the plan calls for 2–3 expert labelers + inter-rater agreement before treating absolute numbers as
 * ground truth. Until then this guards against *regressions* (relative drift), which is its job here.
 */
import type { ImageCandidate } from "../../altText";
import type { EvalCase } from "../types";

/** Build a full `ImageCandidate` from the few fields a case cares about; the rest get inert defaults. */
function img(over: Partial<ImageCandidate> & { alt: string }): ImageCandidate {
  return {
    selector: "img",
    src: "",
    filename: "",
    declaredDecorative: over.alt.trim() === "",
    ariaHidden: false,
    inLink: false,
    linkText: "",
    caption: "",
    ariaLabel: "",
    width: 600,
    height: 400,
    ...over,
  };
}

type AltCase = EvalCase<ImageCandidate>;

export const ALT_TEXT_CORPUS: AltCase[] = [
  // ── filename-as-alt → "alt-text-filename" ────────────────────────────────────────────────────
  {
    id: "fn-camera-dsc",
    context: "blog",
    input: img({ alt: "DSC_0421.JPG", filename: "DSC_0421.JPG" }),
    gold: "alt-text-filename",
    notes: "Raw camera filename as alt — conveys nothing to a screen-reader user.",
  },
  {
    id: "fn-img-code",
    context: "ecommerce",
    input: img({ alt: "IMG_2024", filename: "IMG_2024.png" }),
    gold: "alt-text-filename",
    notes: "Camera-style code, not a description.",
  },
  {
    id: "fn-hash",
    context: "marketing",
    input: img({ alt: "a1b2c3d4.png", filename: "a1b2c3d4.png" }),
    gold: "alt-text-filename",
    notes: "Opaque hash/asset id — meaningless.",
  },
  {
    id: "fn-screenshot-date",
    context: "docs",
    input: img({ alt: "screenshot-2023-11-02-at-14.32.png", filename: "screenshot-2023-11-02-at-14.32.png" }),
    gold: "alt-text-filename",
    notes: "Timestamped screenshot filename, no content.",
  },

  // ── uninformative placeholder → "alt-text-uninformative" ─────────────────────────────────────
  {
    id: "vague-image",
    context: "marketing",
    input: img({ alt: "image", filename: "hero.jpg" }),
    gold: "alt-text-uninformative",
    notes: 'Bare placeholder "image".',
  },
  {
    id: "vague-photo",
    context: "blog",
    input: img({ alt: "photo", filename: "post-3.jpg" }),
    gold: "alt-text-uninformative",
    notes: 'Bare placeholder "photo".',
  },
  {
    id: "vague-graphic",
    context: "app-ui",
    input: img({ alt: "graphic", filename: "chart.svg" }),
    gold: "alt-text-uninformative",
    notes: 'Bare placeholder "graphic" on a chart that surely carries data.',
  },
  {
    id: "vague-untitled",
    context: "ecommerce",
    input: img({ alt: "untitled", filename: "p.jpg" }),
    gold: "alt-text-uninformative",
    notes: '"untitled" describes nothing.',
  },

  // ── redundant phrasing → "alt-text-redundant" ───────────────────────────────────────────────
  {
    id: "redundant-image-of",
    context: "blog",
    input: img({ alt: "Image of a golden retriever puppy on a beach", filename: "puppy.jpg" }),
    gold: "alt-text-redundant",
    notes: 'Opens with "Image of" — screen readers already announce it as an image.',
  },
  {
    id: "redundant-photo-of",
    context: "marketing",
    input: img({ alt: "Photo of our downtown office building", filename: "office.jpg" }),
    gold: "alt-text-redundant",
    notes: 'Opens with "Photo of".',
  },
  {
    id: "redundant-picture-of",
    context: "ecommerce",
    input: img({ alt: "Picture of a red leather handbag", filename: "bag.jpg" }),
    gold: "alt-text-redundant",
    notes: 'Opens with "Picture of".',
  },

  // ── good alt → "ok" (true negatives) ─────────────────────────────────────────────────────────
  {
    id: "ok-descriptive-product",
    context: "ecommerce",
    input: img({ alt: "Red leather crossbody handbag with gold buckle", filename: "bag-red.jpg" }),
    gold: "ok",
    notes: "Clear, specific product description.",
  },
  {
    id: "ok-descriptive-hero",
    context: "marketing",
    input: img({ alt: "Team of five collaborating around a laptop in a bright office", filename: "team.jpg" }),
    gold: "ok",
    notes: "Describes the scene and its point.",
  },
  {
    id: "ok-chart-described",
    context: "app-ui",
    input: img({ alt: "Bar chart: revenue up 40% from Q1 to Q2 2024", filename: "rev.svg" }),
    gold: "ok",
    notes: "Conveys the data the chart shows.",
  },
  {
    id: "ok-docs-diagram",
    context: "docs",
    input: img({ alt: "Request flows from client to API gateway to the auth service", filename: "arch.png" }),
    gold: "ok",
    notes: "Explains the diagram's content.",
  },
  // Hard negatives: slug-LOOKING alt the prompt is explicitly told NOT to flag as filename.
  {
    id: "ok-slug-model-s",
    context: "ecommerce",
    input: img({ alt: "model-s", filename: "model-s.jpg" }),
    gold: "ok",
    notes: "Reads as a real product name (Tesla Model S), not an opaque filename — must NOT flag.",
  },
  {
    id: "ok-slug-iphone",
    context: "ecommerce",
    input: img({ alt: "iphone-15-pro", filename: "iphone-15-pro.png" }),
    gold: "ok",
    notes: "Product name in slug form — a real description, not junk.",
  },
  {
    id: "ok-brand-name",
    context: "marketing",
    input: img({ alt: "Acme Corp logo", filename: "logo.svg" }),
    gold: "ok",
    notes: "Logo named correctly.",
  },
  {
    id: "ok-terse-but-real",
    context: "blog",
    input: img({ alt: "Sourdough loaf, scored and freshly baked", filename: "bread.jpg" }),
    gold: "ok",
    notes: "Short but genuinely descriptive.",
  },
  // Decorative + context: link/caption cases that the judge still inspects (not auto-skipped).
  {
    id: "ok-decorative-empty",
    context: "marketing",
    input: img({ alt: "", filename: "divider.png", declaredDecorative: true }),
    gold: "ok",
    notes: "Genuinely decorative divider, empty alt — correct, judge should leave it alone.",
  },
  {
    id: "ok-link-image-alt",
    context: "app-ui",
    input: img({
      alt: "Download the 2024 annual report (PDF)",
      filename: "report.png",
      inLink: true,
      linkText: "",
      width: 200,
      height: 60,
    }),
    gold: "ok",
    notes: "Image is the link's only content; alt conveys the destination — correct.",
  },
  {
    id: "ok-figure-caption",
    context: "blog",
    input: img({
      alt: "Hikers cresting a ridge at sunrise",
      filename: "hike.jpg",
      caption: "Day three of the trek above the cloud line",
    }),
    gold: "ok",
    notes: "Alt describes the image; caption adds context — both fine.",
  },
  {
    id: "ok-emoji-free-desc",
    context: "docs",
    input: img({ alt: "Green check mark indicating the step succeeded", filename: "ok.svg" }),
    gold: "ok",
    notes: "Functional description of a status icon.",
  },
];
