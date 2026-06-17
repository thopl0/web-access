/**
 * WCAG 2.1 success-criteria reference (Levels A + AA) and a conformance summarizer. This is the
 * shared engine behind the WCAG scorecard, the EU Accessibility Act readiness panel, and the
 * principle breakdown. Pure + client-safe.
 *
 * Why A/AA only: the EN 301 549 harmonized standard — the basis for the European Accessibility Act
 * (EAA, in force since 28 June 2025) — and most legal baselines (ADA, Section 508) require WCAG 2.1
 * Level AA. AAA is out of scope for compliance reporting.
 */

export type WcagLevel = "A" | "AA";
export type Principle = 1 | 2 | 3 | 4;

export const PRINCIPLES: Record<Principle, string> = {
  1: "Perceivable",
  2: "Operable",
  3: "Understandable",
  4: "Robust",
};

type Criterion = { level: WcagLevel; title: string };

/** Every WCAG 2.1 Level A and AA success criterion. Principle is derived from the leading number. */
export const WCAG: Record<string, Criterion> = {
  // 1 — Perceivable
  "1.1.1": { level: "A", title: "Non-text Content" },
  "1.2.1": { level: "A", title: "Audio-only and Video-only (Prerecorded)" },
  "1.2.2": { level: "A", title: "Captions (Prerecorded)" },
  "1.2.3": { level: "A", title: "Audio Description or Media Alternative (Prerecorded)" },
  "1.2.4": { level: "AA", title: "Captions (Live)" },
  "1.2.5": { level: "AA", title: "Audio Description (Prerecorded)" },
  "1.3.1": { level: "A", title: "Info and Relationships" },
  "1.3.2": { level: "A", title: "Meaningful Sequence" },
  "1.3.3": { level: "A", title: "Sensory Characteristics" },
  "1.3.4": { level: "AA", title: "Orientation" },
  "1.3.5": { level: "AA", title: "Identify Input Purpose" },
  "1.4.1": { level: "A", title: "Use of Color" },
  "1.4.2": { level: "A", title: "Audio Control" },
  "1.4.3": { level: "AA", title: "Contrast (Minimum)" },
  "1.4.4": { level: "AA", title: "Resize Text" },
  "1.4.5": { level: "AA", title: "Images of Text" },
  "1.4.10": { level: "AA", title: "Reflow" },
  "1.4.11": { level: "AA", title: "Non-text Contrast" },
  "1.4.12": { level: "AA", title: "Text Spacing" },
  "1.4.13": { level: "AA", title: "Content on Hover or Focus" },
  // 2 — Operable
  "2.1.1": { level: "A", title: "Keyboard" },
  "2.1.2": { level: "A", title: "No Keyboard Trap" },
  "2.1.4": { level: "A", title: "Character Key Shortcuts" },
  "2.2.1": { level: "A", title: "Timing Adjustable" },
  "2.2.2": { level: "A", title: "Pause, Stop, Hide" },
  "2.3.1": { level: "A", title: "Three Flashes or Below Threshold" },
  "2.4.1": { level: "A", title: "Bypass Blocks" },
  "2.4.2": { level: "A", title: "Page Titled" },
  "2.4.3": { level: "A", title: "Focus Order" },
  "2.4.4": { level: "A", title: "Link Purpose (In Context)" },
  "2.4.5": { level: "AA", title: "Multiple Ways" },
  "2.4.6": { level: "AA", title: "Headings and Labels" },
  "2.4.7": { level: "AA", title: "Focus Visible" },
  "2.5.1": { level: "A", title: "Pointer Gestures" },
  "2.5.2": { level: "A", title: "Pointer Cancellation" },
  "2.5.3": { level: "A", title: "Label in Name" },
  "2.5.4": { level: "A", title: "Motion Actuation" },
  // 3 — Understandable
  "3.1.1": { level: "A", title: "Language of Page" },
  "3.1.2": { level: "AA", title: "Language of Parts" },
  "3.2.1": { level: "A", title: "On Focus" },
  "3.2.2": { level: "A", title: "On Input" },
  "3.2.3": { level: "AA", title: "Consistent Navigation" },
  "3.2.4": { level: "AA", title: "Consistent Identification" },
  "3.3.1": { level: "A", title: "Error Identification" },
  "3.3.2": { level: "A", title: "Labels or Instructions" },
  "3.3.3": { level: "AA", title: "Error Suggestion" },
  "3.3.4": { level: "AA", title: "Error Prevention (Legal, Financial, Data)" },
  // 4 — Robust
  "4.1.1": { level: "A", title: "Parsing" },
  "4.1.2": { level: "A", title: "Name, Role, Value" },
  "4.1.3": { level: "AA", title: "Status Messages" },
};

export function principleOf(sc: string): Principle {
  return Number(sc.split(".")[0]) as Principle;
}

/**
 * How much of a success criterion automated scanning can actually judge. This is the honesty layer
 * behind the conformance checklist: only ~30–40% of WCAG is machine-testable, so we must never
 * imply a clean automated scan == full conformance.
 *   automatable — tools reliably detect failures (a clean result is strong evidence of a pass)
 *   partial     — tools catch SOME failures, but a clean result still needs human confirmation
 *   manual      — not machine-testable; requires human review regardless of scan results
 * Classification is approximate, aligned to axe-core / Deque + WAI guidance on what's automatable.
 */
export type Coverage = "automatable" | "partial" | "manual";

export const COVERAGE: Record<string, Coverage> = {
  // 1 — Perceivable
  "1.1.1": "partial", // missing alt is detectable; whether the alt is meaningful is not
  "1.2.1": "manual",
  "1.2.2": "manual",
  "1.2.3": "manual",
  "1.2.4": "manual",
  "1.2.5": "manual",
  "1.3.1": "partial",
  "1.3.2": "partial",
  "1.3.3": "manual",
  "1.3.4": "manual",
  "1.3.5": "partial",
  "1.4.1": "partial",
  "1.4.2": "manual",
  "1.4.3": "automatable",
  "1.4.4": "partial",
  "1.4.5": "manual",
  "1.4.10": "partial",
  "1.4.11": "partial",
  "1.4.12": "partial",
  "1.4.13": "manual",
  // 2 — Operable
  "2.1.1": "partial",
  "2.1.2": "manual",
  "2.1.4": "manual",
  "2.2.1": "manual",
  "2.2.2": "partial",
  "2.3.1": "manual",
  "2.4.1": "automatable",
  "2.4.2": "automatable",
  "2.4.3": "manual",
  "2.4.4": "partial",
  "2.4.5": "manual",
  "2.4.6": "partial",
  "2.4.7": "partial",
  "2.5.1": "manual",
  "2.5.2": "manual",
  "2.5.3": "partial",
  "2.5.4": "manual",
  // 3 — Understandable
  "3.1.1": "automatable",
  "3.1.2": "partial",
  "3.2.1": "manual",
  "3.2.2": "manual",
  "3.2.3": "manual",
  "3.2.4": "manual",
  "3.3.1": "manual",
  "3.3.2": "partial",
  "3.3.3": "manual",
  "3.3.4": "manual",
  // 4 — Robust
  "4.1.1": "automatable",
  "4.1.2": "partial",
  "4.1.3": "manual",
};

export function coverageOf(sc: string): Coverage {
  return COVERAGE[sc] ?? "manual";
}

/** Totals per level / principle — the denominators for "X of Y criteria passing". */
const TOTAL_BY_LEVEL: Record<WcagLevel, number> = { A: 0, AA: 0 };
const TOTAL_BY_PRINCIPLE: Record<Principle, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
for (const [sc, c] of Object.entries(WCAG)) {
  TOTAL_BY_LEVEL[c.level] += 1;
  TOTAL_BY_PRINCIPLE[principleOf(sc)] += 1;
}

export type FailingCriterion = {
  sc: string;
  title: string;
  level: WcagLevel;
  principle: Principle;
};

export type ConformanceReport = {
  /** Distinct A/AA criteria with at least one open issue, worst-principle-first then by number. */
  failing: FailingCriterion[];
  byLevel: Record<WcagLevel, { failing: number; total: number }>;
  byPrinciple: Record<Principle, { failing: number; total: number }>;
  aConformant: boolean;
  aaConformant: boolean;
  /** Distinct failing A + AA criteria — the count standing between you and AA conformance. */
  blockingAA: number;
  /** Whether there was any scanned data to judge against (no data ≠ conformant). */
  evaluated: boolean;
};

/**
 * Summarize conformance from a set of issues/findings (each carrying its WCAG success criteria).
 * An SC counts as failing if any item references it. Unknown / AAA criteria are ignored.
 */
export function summarizeConformance(
  items: { wcag: string[] }[],
  opts: { evaluated?: boolean } = {},
): ConformanceReport {
  const failingSc = new Set<string>();
  for (const item of items) {
    for (const sc of item.wcag) {
      if (WCAG[sc]) failingSc.add(sc);
    }
  }

  const failing: FailingCriterion[] = [...failingSc].map((sc) => ({
    sc,
    title: WCAG[sc].title,
    level: WCAG[sc].level,
    principle: principleOf(sc),
  }));
  failing.sort((a, b) => a.principle - b.principle || cmpSc(a.sc, b.sc));

  const byLevel: ConformanceReport["byLevel"] = {
    A: { failing: failing.filter((f) => f.level === "A").length, total: TOTAL_BY_LEVEL.A },
    AA: { failing: failing.filter((f) => f.level === "AA").length, total: TOTAL_BY_LEVEL.AA },
  };
  const byPrinciple = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Principle, number>;
  for (const f of failing) byPrinciple[f.principle] += 1;

  const evaluated = opts.evaluated ?? items.length > 0;
  const aConformant = evaluated && byLevel.A.failing === 0;
  // AA conformance requires meeting all A AND AA criteria.
  const aaConformant = evaluated && byLevel.A.failing === 0 && byLevel.AA.failing === 0;

  return {
    failing,
    byLevel,
    byPrinciple: {
      1: { failing: byPrinciple[1], total: TOTAL_BY_PRINCIPLE[1] },
      2: { failing: byPrinciple[2], total: TOTAL_BY_PRINCIPLE[2] },
      3: { failing: byPrinciple[3], total: TOTAL_BY_PRINCIPLE[3] },
      4: { failing: byPrinciple[4], total: TOTAL_BY_PRINCIPLE[4] },
    },
    aConformant,
    aaConformant,
    blockingAA: byLevel.A.failing + byLevel.AA.failing,
    evaluated,
  };
}

/**
 * Per-criterion conformance status for the document-style checklist.
 *   fail        — at least one open issue references this criterion
 *   pass        — no open issue AND automated tooling covers it (passed our automated checks)
 *   not-tested  — manual-only criterion (we can't judge it), or no scan data yet
 * "pass" means "passed the automated checks we can run", never "fully conformant" — partial-coverage
 * passes still warrant human confirmation, which the UI surfaces via `coverage`.
 */
export type CriterionStatus = "fail" | "pass" | "not-tested";

export type ChecklistCriterion = {
  sc: string;
  title: string;
  level: WcagLevel;
  principle: Principle;
  coverage: Coverage;
  status: CriterionStatus;
};

export type ConformanceChecklist = {
  /** Whether any scan data exists to judge against (no data ⇒ everything is not-tested). */
  evaluated: boolean;
  /** Every A/AA criterion, ordered by principle then number. */
  criteria: ChecklistCriterion[];
  byPrinciple: Record<Principle, ChecklistCriterion[]>;
  summary: {
    failed: number;
    passed: number;
    notTested: number;
    total: number;
    /** Criteria that are manual-only — the human-review backlog the automation can't touch. */
    manualTotal: number;
  };
};

/**
 * Build the full WCAG 2.1 A/AA checklist from a set of issues (each carrying its WCAG criteria),
 * honestly marking each criterion pass / fail / not-tested. Manual-only criteria are never marked
 * "pass" off the back of a clean scan — they stay not-tested so we don't imply coverage we lack.
 */
export function buildChecklist(
  items: { wcag: string[] }[],
  opts: { evaluated?: boolean } = {},
): ConformanceChecklist {
  const evaluated = opts.evaluated ?? items.length > 0;

  const failingSc = new Set<string>();
  for (const item of items) {
    for (const sc of item.wcag) {
      if (WCAG[sc]) failingSc.add(sc);
    }
  }

  const criteria: ChecklistCriterion[] = Object.entries(WCAG).map(([sc, c]) => {
    const coverage = coverageOf(sc);
    let status: CriterionStatus;
    if (failingSc.has(sc)) status = "fail";
    else if (!evaluated || coverage === "manual") status = "not-tested";
    else status = "pass";
    return { sc, title: c.title, level: c.level, principle: principleOf(sc), coverage, status };
  });
  criteria.sort((a, b) => a.principle - b.principle || cmpSc(a.sc, b.sc));

  const byPrinciple = { 1: [], 2: [], 3: [], 4: [] } as Record<Principle, ChecklistCriterion[]>;
  for (const c of criteria) byPrinciple[c.principle].push(c);

  return {
    evaluated,
    criteria,
    byPrinciple,
    summary: {
      failed: criteria.filter((c) => c.status === "fail").length,
      passed: criteria.filter((c) => c.status === "pass").length,
      notTested: criteria.filter((c) => c.status === "not-tested").length,
      total: criteria.length,
      manualTotal: criteria.filter((c) => c.coverage === "manual").length,
    },
  };
}

/** Compare success-criteria numbers (e.g. "1.4.10" sorts after "1.4.3"). */
function cmpSc(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
