import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  platform: "node",
  format: "esm",
  target: "node20",
  outDir: "dist",
  fixedExtension: true,
  clean: true,
  sourcemap: true,
  dts: false,
  deps: {
    skipNodeModulesBundle: true,
  },
  report: false,
});
