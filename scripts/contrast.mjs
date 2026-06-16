// WCAG 2.2 contrast verifier for the design-system palette.
// Run: node scripts/contrast.mjs   (exits non-zero if any pair misses its target)
// Keep the hexes here in sync with the tokens in app/globals.css.

const hex = (h) => {
  const n = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [label, foreground, background, minimum ratio]
// 4.5 = normal text, 3.0 = large text (>=24px or >=18.66px bold) and UI/border.
const PAIRS = [
  // --- Light mode ---
  ["L: body text on page", "#16140F", "#FBF7F0", 4.5],
  ["L: soft text on page", "#4A4640", "#FBF7F0", 4.5],
  ["L: body text on card", "#16140F", "#FFFFFF", 4.5],
  ["L: link (blue) on page", "#2D3DBF", "#FBF7F0", 4.5],
  ["L: ink on yellow block", "#16140F", "#FFD23F", 4.5],
  ["L: ink on pink block", "#16140F", "#FF5DA2", 4.5],
  ["L: white on blue block", "#FFFFFF", "#2D3DBF", 4.5],
  ["L: white on green block", "#FFFFFF", "#0B6B45", 4.5],
  ["L: border/line on page", "#16140F", "#FBF7F0", 3.0],
  // --- Dark mode ---
  ["D: body text on page", "#FBF7F0", "#14120D", 4.5],
  ["D: soft text on page", "#CFC9BD", "#14120D", 4.5],
  ["D: body text on surface", "#FBF7F0", "#211E17", 4.5],
  ["D: link (sky) on page", "#8FB6FF", "#14120D", 4.5],
  ["D: border/line on page", "#FBF7F0", "#14120D", 3.0],
  // --- Accent blocks are fixed across modes; text colors are hard-coded ---
  ["X: ink on yellow", "#16140F", "#FFD23F", 4.5],
  ["X: ink on pink", "#16140F", "#FF5DA2", 4.5],
  ["X: white on blue", "#FFFFFF", "#2D3DBF", 4.5],
  ["X: white on green", "#FFFFFF", "#0B6B45", 4.5],
  // --- Focus outlines must read as UI components (>=3.0) ---
  ["F: blue focus on page", "#2D3DBF", "#FBF7F0", 3.0],
  ["F: yellow focus on blue", "#FFD23F", "#2D3DBF", 3.0],
  ["F: yellow focus on green", "#FFD23F", "#0B6B45", 3.0],
];

let failed = 0;
console.log("\n  WCAG 2.2 contrast check\n  " + "-".repeat(44));
for (const [label, fg, bg, min] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  const mark = ok ? "PASS" : "FAIL";
  console.log(
    `  ${mark}  ${r.toFixed(2).padStart(5)}:1  (>= ${min})  ${label}`,
  );
}
console.log("  " + "-".repeat(44));
if (failed) {
  console.error(`\n  ${failed} pair(s) below target. Fix the palette.\n`);
  process.exit(1);
}
console.log(`\n  All ${PAIRS.length} pairs pass. \n`);
