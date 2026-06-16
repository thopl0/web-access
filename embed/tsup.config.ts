import { defineConfig } from "tsup";

// Builds the standalone one-line <script> as a browser global, emitted into public/ so Next serves
// it at /embed/web-access.global.js. Run from the repo root (`pnpm build:embed`).
export default defineConfig({
  entry: { "web-access": "embed/index.ts" },
  format: ["iife"],
  target: "es2018",
  minify: true,
  sourcemap: true,
  clean: true,
  outDir: "public/embed",
});
