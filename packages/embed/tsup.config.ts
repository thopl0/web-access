import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "web-access": "src/index.ts" },
  format: ["iife"],
  target: "es2018",
  minify: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
});
