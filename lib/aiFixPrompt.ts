/**
 * Build a paste-ready prompt that a non-technical owner can drop into their AI builder to fix an
 * accessibility issue. Pure + client-safe. Caps occurrences so the prompt stays manageable.
 */
type Occurrence = {
  path: string;
  selector: string;
  snippet: string;
  /** Concrete before→after fix for this element, when one was generated. When present we emit the
   *  exact change so the AI builder has a precise target rather than re-deriving it from the snippet. */
  fix?: { before: string; after: string; needsReview: boolean; note?: string };
};

const MAX_OCCURRENCES = 12;

export function buildAiFixPrompt(input: {
  ruleId: string;
  message: string;
  wcag: string[];
  what?: string;
  fix?: string;
  occurrences: Occurrence[];
}): string {
  const { ruleId, message, wcag, what, fix, occurrences } = input;
  const lines: string[] = [];

  lines.push("Fix this web accessibility issue in my site's code. Keep the existing visual design.");
  lines.push("");
  lines.push(`Issue: ${what ?? message}`);
  if (wcag.length) lines.push(`WCAG success criteria: ${wcag.join(", ")}`);
  lines.push(`Rule: ${ruleId}`);
  if (fix) lines.push(`Recommended fix: ${fix}`);
  lines.push("");
  lines.push("Affected elements:");
  for (const o of occurrences.slice(0, MAX_OCCURRENCES)) {
    lines.push(`- On ${o.path} — selector \`${o.selector}\`:`);
    lines.push(`    ${o.snippet}`);
    // When we have a concrete fix, spell out the exact change. This makes the prompt
    // far more actionable; occurrences without a fix render exactly as before.
    if (o.fix) {
      lines.push(`    Current:    ${o.fix.before}`);
      lines.push(`    Should be:  ${o.fix.after}`);
      if (o.fix.needsReview) {
        lines.push(`    (needs human review${o.fix.note ? `: ${o.fix.note}` : ""})`);
      }
    }
  }
  if (occurrences.length > MAX_OCCURRENCES) {
    lines.push(`  …and ${occurrences.length - MAX_OCCURRENCES} more occurrence(s).`);
  }
  lines.push("");
  lines.push(
    "Update the markup and styles so this passes accessibility checks (WCAG AA), and briefly explain what you changed.",
  );
  return lines.join("\n");
}
