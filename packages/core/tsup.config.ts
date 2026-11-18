import { defineConfig } from "tsup";

export default defineConfig({
  bundle: true,

  clean: true,

  dts: {
    // tsup's dts build sets `baseUrl` internally, which TypeScript 6 deprecates.
    compilerOptions: {
      ignoreDeprecations: "6.0",
    },
    resolve: true,
  },
  entry: {
    index: "src/index.ts",
  },

  format: [
    "esm",
    "cjs",
  ],

  minify: false,

  outDir: "dist",

  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    };
  },

  platform: "browser",

  skipNodeModulesBundle: true,

  sourcemap: true,

  splitting: false,

  target: "es2022",

  treeshake: true,
});
