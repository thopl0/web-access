import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest config. Its only job is to teach the test runner the same path aliases the app uses via
// tsconfig `paths` — TypeScript resolves those for the build, but vitest's resolver needs them spelled
// out for RUNTIME (value) imports from test files. Type-only imports were erased before vitest saw
// them, which is why tests worked without some of these until a test needed a real exported value
// (e.g. SAFE_REMEDIATION_ATTRS / isSafeRemediationAttr), or transitively imported a server module that
// uses the `@/` app-root alias (e.g. lib/server/verification.ts → `@/lib/severity`).
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Repo root (trailing slash) — the target of the `@/` alias.
const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@web-access/shared", replacement: r("./lib/packages/shared/index.ts") },
      { find: "@web-access/db", replacement: r("./lib/packages/db/index.ts") },
      { find: "@web-access/analyzers", replacement: r("./lib/packages/analyzers/index.ts") },
      // `@/x` → `<root>/x`. The specific `@web-access/*` entries above never start with `@/`, so this
      // regex only ever catches the app-root alias.
      { find: /^@\//, replacement: root },
    ],
  },
});
