/**
 * Checks what each publishable package would ship to npm (`bun run check:package`).
 * Run it after `bun run build`.
 *
 * For every non-private package in `packages/*`:
 * 1. Packs it with `bun pm pack` (as the publish workflow does) into a temp dir.
 * 2. Checks the tarball only contains `package.json`, `README.md`, `LICENSE`
 *    and `dist/`, and that the required files are there.
 * 3. Runs `publint --strict` and `attw` (Are the Types Wrong?) on the tarball.
 */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PACKAGES_DIR = join(ROOT, "packages");

const REQUIRED_FILES = [
  "package.json",
  "LICENSE",
  "dist/index.mjs",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.d.cts",
];
const OPTIONAL_FILES = new Set([
  "README.md",
]);

function run(
  cmd: string[],
  cwd = ROOT,
): {
  ok: boolean;
  output: string;
} {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    ok: result.exitCode === 0,
    output: `${result.stdout.toString()}${result.stderr.toString()}`.trim(),
  };
}

function bin(name: string): string {
  return join(ROOT, "node_modules", ".bin", name);
}

/** Returns a list of problems with the tarball's file list. */
function checkContents(files: string[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (
      !file.startsWith("dist/") &&
      !REQUIRED_FILES.includes(file) &&
      !OPTIONAL_FILES.has(file)
    ) {
      problems.push(`unexpected file in tarball: ${file}`);
    }
  }
  for (const file of REQUIRED_FILES) {
    if (!files.includes(file)) {
      problems.push(`missing file in tarball: ${file}`);
    }
  }
  return problems;
}

async function checkPackage(dir: string, outDir: string): Promise<boolean> {
  const pkg = await Bun.file(join(dir, "package.json")).json();
  if (pkg.private === true) {
    console.log(`- ${pkg.name}: private, skipped`);
    return true;
  }
  console.log(`\n# ${pkg.name}@${pkg.version}`);

  const pack = run(
    [
      process.execPath,
      "pm",
      "pack",
      "--destination",
      outDir,
    ],
    dir,
  );
  const tarball = (await readdir(outDir)).find(
    (file) =>
      file.endsWith(".tgz") &&
      file.startsWith(pkg.name.replace("@", "").replace("/", "-")),
  );
  if (!pack.ok || tarball === undefined) {
    console.error(`✗ bun pm pack failed:\n${pack.output}`);
    return false;
  }
  const tarballPath = join(outDir, tarball);

  const list = run([
    "tar",
    "-tzf",
    tarballPath,
  ]);
  const files = list.output
    .split("\n")
    .filter((line) => line !== "" && !line.endsWith("/"))
    .map((line) => line.replace(/^package\//, ""));
  const problems = checkContents(files);
  if (!files.includes("README.md")) {
    console.warn("! README.md is missing: npm will show an empty page");
  }
  if (problems.length > 0) {
    console.error(`✗ tarball contents:\n  ${problems.join("\n  ")}`);
  } else {
    console.log(`✓ tarball contents (${files.length} files)`);
  }

  const publint = run([
    bin("publint"),
    "run",
    "--strict",
    "--level",
    "warning",
    tarballPath,
  ]);
  console[publint.ok ? "log" : "error"](
    `${publint.ok ? "✓" : "✗"} publint${publint.ok ? "" : `\n${publint.output}`}`,
  );

  const attw = run([
    bin("attw"),
    "--no-emoji",
    "--no-color",
    tarballPath,
  ]);
  console[attw.ok ? "log" : "error"](
    `${attw.ok ? "✓" : "✗"} attw${attw.ok ? "" : `\n${attw.output}`}`,
  );

  return problems.length === 0 && publint.ok && attw.ok;
}

const outDir = await mkdtemp(join(tmpdir(), "usesounds-check-package-"));
let ok = true;
try {
  const entries = await readdir(PACKAGES_DIR, {
    withFileTypes: true,
  });
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const dir = join(PACKAGES_DIR, entry.name);
    if (!(await Bun.file(join(dir, "dist", "index.mjs")).exists())) {
      console.error(
        `✗ ${entry.name}: dist/ not found. Run \`bun run build\` first.`,
      );
      ok = false;
      continue;
    }
    ok = (await checkPackage(dir, outDir)) && ok;
  }
} finally {
  await rm(outDir, {
    force: true,
    recursive: true,
  });
}

if (!ok) {
  console.error("\ncheck:package failed");
  process.exit(1);
}
console.log("\ncheck:package passed");
