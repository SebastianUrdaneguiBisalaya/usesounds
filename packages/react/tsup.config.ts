import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig, type Options } from "tsup";

const OUT_DIR = "dist";
const USE_CLIENT = '"use client";';

/**
 * Prepends `"use client";` to every JS output file in `outDir` (Next.js App
 * Router / RSC).
 *
 * tsup's `banner` can't be used: with `treeshake: true`, tsup re-bundles each
 * chunk with Rollup, which strips the banner as a module-level directive. The
 * matching source map gets a leading `;` so its mappings shift down one line.
 */
async function prependUseClient(outDir: string): Promise<void> {
  const files = await readdir(outDir);
  for (const file of files) {
    if (!/\.(mjs|cjs)$/.test(file)) {
      continue;
    }
    const path = join(outDir, file);
    const code = await readFile(path, "utf8");
    if (code.startsWith(USE_CLIENT)) {
      continue;
    }
    await writeFile(path, `${USE_CLIENT}\n${code}`);

    const mapPath = `${path}.map`;
    if (files.includes(`${file}.map`)) {
      const map = JSON.parse(await readFile(mapPath, "utf8"));
      map.mappings = `;${map.mappings}`;
      await writeFile(mapPath, JSON.stringify(map));
    }
  }
}

/**
 * Build options writing to `outDir`. Exported so tests can build the real
 * pipeline (including `"use client";`) into a temporary directory.
 */
export function createConfig(outDir: string = OUT_DIR): Options {
  return {
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

    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@usesounds/core",
    ],

    format: [
      "esm",
      "cjs",
    ],

    minify: false,

    onSuccess: () => prependUseClient(outDir),

    outDir,

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

    tsconfig: "tsconfig.build.json",
  };
}

export default defineConfig(createConfig());
