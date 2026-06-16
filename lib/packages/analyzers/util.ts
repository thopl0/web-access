import type { Page } from "playwright";

/**
 * Define the esbuild/tsx `keepNames` helper (`__name`) inside the page.
 *
 * When we run under tsx (esbuild), named functions get wrapped as `__name(fn, "name")` to preserve
 * `.name`. Playwright serializes only the evaluate callback's source, not the module-level `__name`
 * helper, so the browser throws `ReferenceError: __name is not defined`. Defining a no-op shim on
 * the page fixes it. Passed as a STRING so it isn't itself transpiled (which would reintroduce the
 * very reference we're trying to satisfy). Idempotent.
 */
export async function ensureEvalHelpers(page: Page): Promise<void> {
  await page.evaluate("window.__name = window.__name || function (f) { return f; };");
}
