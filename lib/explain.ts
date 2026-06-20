/**
 * Plain-language explanations of findings, for the people this product is actually for: non-experts
 * building sites with AI tools. Analyzer/axe messages are written for developers ("Elements must
 * meet minimum color contrast ratio thresholds") — here we say what it means for real visitors and
 * how to fix it in everyday words.
 *
 * Keyed by ruleId. Anything not listed falls back to the finding's own message (see `explainRule`).
 */
export type RuleExplainer = {
  /** Plain headline shown instead of the raw rule id / dev message. */
  title: string;
  /** What it means for visitors, in everyday language. */
  what: string;
  /** What to change, in everyday language. */
  fix: string;
};

const RULES: Record<string, RuleExplainer> = {
  "color-contrast": {
    title: "Text is hard to read",
    what: "The text colour and the colour behind it are too similar, so people with weaker eyesight (and anyone in bright sunlight) struggle to read it.",
    fix: "Make the text darker or the background lighter — or vice versa — until they clearly stand apart.",
  },
  "contrast-over-image": {
    title: "Text on top of an image is hard to read",
    what: "This text sits over a photo or gradient and doesn't stand out enough, so parts of it are hard to read depending on what's behind each word.",
    fix: "Add a solid or semi-transparent panel behind the text, darken/lighten the image, or switch the text colour so it clearly contrasts with the image.",
  },
  "image-alt": {
    title: "Image has no description",
    what: "People who use screen readers (and search engines) can't tell what this image shows because it has no text description.",
    fix: "Add 'alt' text that describes what the image shows. If it's purely decorative, give it empty alt text so it's skipped.",
  },
  "link-name": {
    title: "Link has no readable text",
    what: "This link has nothing for a screen reader to announce, so blind users hear only \"link\" with no idea where it goes.",
    fix: "Give the link visible text (e.g. \"View pricing\"), or add an aria-label describing where it leads.",
  },
  "button-name": {
    title: "Button has no readable text",
    what: "This button has no label, so screen-reader users can't tell what it does.",
    fix: "Add visible text inside the button, or an aria-label describing the action (e.g. \"Close\", \"Submit\").",
  },
  label: {
    title: "Form field has no label",
    what: "This input has no label tying a description to it, so screen-reader users don't know what to type, and the tap target is smaller.",
    fix: "Add a <label> connected to the field (or an aria-label) describing what it's for.",
  },
  "document-title": {
    title: "Page has no title",
    what: "The browser tab and screen readers have nothing to announce for this page, making it hard to identify among open tabs.",
    fix: "Add a clear <title> in the page's <head> describing the page.",
  },
  "html-has-lang": {
    title: "Page language isn't set",
    what: "The page doesn't say what language it's in, so screen readers may read it with the wrong pronunciation.",
    fix: "Add a lang attribute to the <html> tag, e.g. <html lang=\"en\">.",
  },
  "heading-order": {
    title: "Headings skip levels",
    what: "Headings jump levels (e.g. from a main heading straight to a small sub-sub-heading), which makes the page structure confusing for screen-reader users who navigate by headings.",
    fix: "Use heading levels in order (h1 → h2 → h3) without skipping.",
  },
  "positive-tabindex": {
    title: "Keyboard focus jumps around",
    what: "A forced tab order makes the keyboard focus jump in an unnatural sequence, confusing people who navigate with the Tab key.",
    fix: "Remove the positive tabindex value; let the focus follow the normal order of the page (use tabindex=\"0\" only when needed).",
  },
  "reading-order": {
    title: "Content is in a confusing order",
    what: "What you see on screen doesn't match the order screen readers and the keyboard actually follow, so those users encounter the content jumbled.",
    fix: "Arrange the underlying HTML in the same order it appears visually, rather than repositioning it only with CSS.",
  },
  "link-in-text-block": {
    title: "Links are only told apart by colour",
    what: "Links inside paragraphs are distinguished from normal text by colour alone, which colour-blind readers can miss.",
    fix: "Underline links (or add another visual cue) so they're identifiable without relying on colour.",
  },
  list: {
    title: "List isn't structured correctly",
    what: "This looks like a list but isn't marked up as one, so screen readers won't announce it as a list or say how many items there are.",
    fix: "Wrap the items in a proper <ul> or <ol> with <li> elements.",
  },
  // AI judge (Tier 3) — image alt-text quality.
  "alt-text-filename": {
    title: "Image description is just the file name",
    what: 'The image\'s text description is its file name (like "DSC_0421.JPG"), which tells a screen-reader user nothing about what the image shows.',
    fix: "Replace the alt text with a short description of what the image actually shows or does.",
  },
  "alt-text-uninformative": {
    title: "Image description is too vague",
    what: 'The text description is a generic placeholder (like "image" or "photo") that doesn\'t tell a screen-reader user what the image shows or why it\'s there.',
    fix: "Write alt text that describes the image's content or purpose in a few specific words.",
  },
  "alt-text-redundant": {
    title: 'Image description starts with "image of"',
    what: 'The description begins with "image of" / "photo of", which screen readers already announce — so users hear it twice.',
    fix: 'Drop the leading "image of"/"photo of" and just describe the content.',
  },
  // AI judge (Tier 3, vision) — alt-text fidelity + decorative misclassification.
  "alt-text-inaccurate": {
    title: "Image description doesn't match the image",
    what: "The image has a description, but it doesn't accurately or fully describe what the image actually shows — so screen-reader users get the wrong idea or miss the point of it.",
    fix: "Rewrite the alt text to describe what's really in the image and why it matters here.",
  },
  "decorative-misclassified": {
    title: "Meaningful image is marked as decorative",
    what: "This image is set to be skipped by screen readers (treated as decoration), but it actually carries information or a function that blind users need — so they miss it entirely.",
    fix: "Give the image real alt text describing its content or purpose, instead of marking it decorative.",
  },
};

/**
 * Return a plain-language explainer for a rule, or null if we don't have one curated yet (the UI
 * then falls back to the raw finding message).
 */
export function explainRule(ruleId: string): RuleExplainer | null {
  return RULES[ruleId] ?? null;
}
