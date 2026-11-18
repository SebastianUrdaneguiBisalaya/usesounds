import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGE_DIR = join(import.meta.dir, "..");

type RunResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

/**
 * Runs `bun` in a fresh process from the package directory. Unlike
 * `bun test`, it doesn't load the `[test] preload` from bunfig.toml, so there
 * is no DOM: the code sees the same globals as a server runtime.
 */
function runWithoutDom(args: string[]): RunResult {
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      ...args,
    ],
    cwd: PACKAGE_DIR,
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

describe("SSR safety", () => {
  it("imports and renders to string without a DOM or browser API access", () => {
    const { exitCode, stderr, stdout } = runWithoutDom([
      join(import.meta.dir, "ssr", "server.tsx"),
    ]);

    // No React warnings (e.g. useLayoutEffect on the server) and no crash.
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.environment).toEqual({
      AudioContext: "undefined",
      document: "undefined",
      matchMedia: "undefined",
      window: "undefined",
    });
    expect(report.factoryCalls).toBe(0);
    expect(report.accessed).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(report.html).toBe(
      '<button data-sound="tick" type="button">Save</button>' +
        '<button data-sound="pop" type="button">Delete</button>' +
        "<ul><li>tick</li><li>pop</li><li>tap</li><li>toggle</li><li>success</li><li>error</li></ul>",
    );
  });
});

describe("built output", () => {
  let outDir = "";

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "usesounds-react-build-"));
    // Same pipeline as `bun run build` (tsup.config.ts), minus the `.d.ts`
    // step, which needs @usesounds/core to be built first.
    const { exitCode, stderr } = runWithoutDom([
      "-e",
      `import { build } from "tsup";
       import { createConfig } from "./tsup.config.ts";
       await build({ ...createConfig(${JSON.stringify(outDir)}), config: false, dts: false, silent: true });`,
    ]);
    if (exitCode !== 0) {
      throw new Error(`tsup build failed:\n${stderr}`);
    }
  }, 60_000);

  afterAll(async () => {
    if (outDir !== "") {
      await rm(outDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('starts every JS file with the `"use client";` directive', async () => {
    const files = (await readdir(outDir)).filter((file) =>
      /\.(mjs|cjs)$/.test(file),
    );

    expect(files.sort()).toEqual([
      "index.cjs",
      "index.mjs",
    ]);
    for (const file of files) {
      const code = await readFile(join(outDir, file), "utf8");
      expect(code.startsWith('"use client";\n')).toBe(true);
    }
  });

  it("shifts source maps by the inserted directive line", async () => {
    for (const file of [
      "index.cjs.map",
      "index.mjs.map",
    ]) {
      const map = JSON.parse(await readFile(join(outDir, file), "utf8"));
      expect(map.mappings.startsWith(";")).toBe(true);
    }
  });

  it("keeps react and @usesounds/core external", async () => {
    const code = await readFile(join(outDir, "index.mjs"), "utf8");

    expect(code).toMatch(/from ["']react["']/);
    expect(code).toMatch(/from ["']@usesounds\/core["']/);
    expect(code).not.toContain("function createSoundEngine");
  });
});
