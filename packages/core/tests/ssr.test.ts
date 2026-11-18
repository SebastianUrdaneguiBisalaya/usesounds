import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const SSR_DIR = join(import.meta.dir, "ssr");

/**
 * Runs a fixture in a fresh `bun` process. Unlike `bun test`, `bun <file>`
 * doesn't load the `[test] preload` from bunfig.toml, so there is no DOM:
 * the fixture sees the same globals as a server runtime.
 */
function runWithoutDom(fixture: string): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      join(SSR_DIR, fixture),
    ],
    cwd: join(import.meta.dir, ".."),
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
  it("imports and runs every engine API without a DOM, as silent no-ops", () => {
    const { exitCode, stderr, stdout } = runWithoutDom("server.ts");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.environment).toEqual({
      AudioContext: "undefined",
      document: "undefined",
      matchMedia: "undefined",
      window: "undefined",
    });
    expect(report.exports).toEqual([
      "InvalidSoundError",
      "SoundPlaybackError",
      "UsesoundsError",
      "createSoundEngine",
      "presetNames",
      "presets",
    ]);
    // No AudioContext, no network, no errors reported.
    expect(report.factoryCalls).toBe(0);
    expect(report.accessed).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(report.names).toContain("chime");
    expect(report.names).toContain("bytes");
  });

  it("has no top-level side effects, so `sideEffects: false` is truthful", async () => {
    // `ignoreDCEAnnotations` makes the bundler ignore `sideEffects` and
    // `@__PURE__` hints: only code that is really free of side effects is
    // dropped when the import is unused.
    const result = await Bun.build({
      entrypoints: [
        join(SSR_DIR, "import-only.ts"),
      ],
      format: "esm",
      ignoreDCEAnnotations: true,
      target: "browser",
    });

    expect(result.success).toBe(true);
    const [output] = result.outputs;
    expect(output).toBeDefined();
    expect((await output?.text())?.trim()).toBe("");
  });

  it("declares `sideEffects: false` in package.json", async () => {
    const pkg = await Bun.file(
      join(import.meta.dir, "..", "package.json"),
    ).json();
    expect(pkg.sideEffects).toBe(false);
  });
});
