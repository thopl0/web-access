import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest config. Its only job is to teach the test runner the same `@web-access/*` path aliases the
// app uses via tsconfig `paths` — TypeScript resolves those for the build, but vitest's resolver
// needs them spelled out for RUNTIME (value) imports of these packages from test files. Type-only
// imports were erased before vitest saw them, which is why tests worked without this until a test
// needed a real exported value (e.g. SAFE_REMEDIATION_ATTRS / isSafeRemediationAttr).
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@web-access/shared": r("./lib/packages/shared/index.ts"),
      "@web-access/db": r("./lib/packages/db/index.ts"),
      "@web-access/analyzers": r("./lib/packages/analyzers/index.ts"),
    },
  },
});
