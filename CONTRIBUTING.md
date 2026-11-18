# Contributing to usesounds

Thanks for your interest in improving usesounds! This guide covers everything you need to go from a fresh clone to a merged pull request.

By participating, you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md). To report a security issue, **don't open a public issue**: follow [SECURITY.md](./SECURITY.md).

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| [Bun](https://bun.sh) | **1.4.2** | Package manager, script runner and test runner. Declared in `devEngines`. |
| [Node.js](https://nodejs.org) | **24** (see `.nvmrc`) | Only needed by some tooling. You never run `npm install` in this repo. |
| Git | any recent | Hooks are installed automatically by husky. |

> **Use Bun only.** Don't use `npm install`, `pnpm` or `yarn` here: they would ignore `bun.lock`, the Bun catalog and `workspace:` ranges.

## Getting started

```bash
git clone https://github.com/SebastianUrdaneguiBisalaya/usesounds.git
cd usesounds
bun install   # installs dependencies and the git hooks
bun run build # builds both packages into packages/*/dist
bun run test  # runs every test suite
```

## Project structure

This is a Bun workspace that publishes two npm packages. There is no app, website or demo in this repo.

```text
packages/
  core/                     # @usesounds/core: framework-agnostic engine (no React)
    src/index.ts            # the package's only public surface
    src/…                   # internal modules (engine, presets, synth, sample, declarative, errors…)
    tests/                  # bun test files, mirroring src/
  react/                    # @usesounds/react: React bindings over core
    src/index.ts
    src/…                   # provider, context, hooks, errors
    tests/
scripts/check-package.ts    # validates what each package would publish
.changeset/                 # pending release notes (changesets)
AGENTS.md                   # full engineering rules (read it before larger changes)
```

Ground rules (see [AGENTS.md](./AGENTS.md) for the complete list):

- **`src/index.ts` is the public API.** Anything not exported there is internal. Use explicit named exports only, never `export *`.
- **`core` never imports React.** `react` imports only from `@usesounds/core`'s public entry, never from its internal files.
- **Zero runtime dependencies.** `core` has none, and `react` has only peer dependencies.
- **Functions, not classes.** State lives in closures returned by factories. The only exception is error classes in `src/errors.ts`.
- **SSR-safe and side-effect free.** Never touch `window`, `document` or `AudioContext` at module scope or during render.
- **Playing a sound never throws.** Report runtime failures through `onError`, and throw only for programmer errors at setup time.
- **No `console` output** from library code.
- **Strict TypeScript.** No `any` on the public surface. Public APIs get TSDoc.

## Scripts

Run them from the repository root:

| Script | What it does |
| --- | --- |
| `bun run build` | Builds both packages with tsup (ESM + CJS + `.d.ts`). |
| `bun run dev` | Rebuilds on change. |
| `bun run typecheck` | `tsc --noEmit` in each package. |
| `bun run lint` | Biome lint + format check. |
| `bun run lint:fix` | Applies Biome's safe fixes and formatting. |
| `bun run format` | Formats with Biome. |
| `bun run test` | Runs `bun test` in each package. |
| `bun run check:package` | After `build`: packs each package and checks the tarball contents, `publint` and `attw`. |
| `bun run changeset` | Adds a changeset (release note) for your change. |
| `bun run version-packages` | Maintainers only: applies changesets (versions + changelogs). |

Before pushing, the usual loop is:

```bash
bun run lint:fix
bun run typecheck
bun run test
bun run build
```

Git hooks run these for you: `pre-commit` runs Biome on staged files plus `typecheck`, and `pre-push` runs `test` plus `build`.

## Testing

Tests use **`bun test`** (no Jest or Vitest). They live in `packages/<pkg>/tests/`, mirror `src/`, and are named `*.test.ts(x)`.

```ts
import { describe, expect, it } from "bun:test";
```

Bun has no DOM and no Web Audio, so the test setup provides both:

- **DOM:** [happy-dom](https://github.com/capricorn86/happy-dom) is registered globally by `tests/preload.ts` (via `[test] preload` in each package's `bunfig.toml`). React tests use [Testing Library](https://testing-library.com/docs/react-testing-library/intro/) on top of it.
- **Audio:** never rely on real audio output. Inject the **fake `AudioContext`** from `packages/core/tests/fake-audio-context.ts` through the engine's `audioContextFactory` option. It records the nodes created, scheduled parameter changes, `decodeAudioData` calls and state changes, so you can assert on exactly what would have played:

```ts
import { createSoundEngine } from "../src/index.js";
import { createFakeAudioContext } from "./fake-audio-context.js";

const ctx = createFakeAudioContext({ state: "running" });
const engine = createSoundEngine({ audioContextFactory: () => ctx.asReal() });

engine.play("tick");
expect(ctx.nodesOf("oscillator")).toHaveLength(1);
```

- **Globals:** `packages/core/tests/globals.ts` temporarily replaces or removes globals (`matchMedia`, `AudioContext`…). Restore them in `afterEach`.
- **SSR:** `tests/ssr.test.ts` in each package runs fixtures in a separate `bun` process *without* the DOM preload, so they see the same globals as a server.

Every behavior change needs tests. Browser automation tools (Playwright, Puppeteer…) are not used in this repo.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). When a change targets one package, use it as the scope:

```text
feat(core): add a "swipe" preset
fix(react): keep play() stable when options are recreated
docs: document CSP requirements for samples
test(core): cover sample decode failures
chore: bump tsup
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `build`.

## Branches and pull requests

1. **Find or open an issue first** for anything beyond a small fix, so we can agree on the approach.
2. **Branch from an up-to-date `main`**, named `<type>/<issue>-<short-summary>`, e.g. `feat/42-swipe-preset`.
3. **Make the change with tests**, and update the package README and TSDoc if the public API or behavior changes.
4. **Add a changeset** if the change affects a published package (see below).
5. **Make sure all checks pass:** `lint`, `typecheck`, `test`, `build`.
6. **Open a pull request to `main`.** Reference the issue (`Closes #42`) and describe what changed and how you tested it.

Keep pull requests focused on one issue. If you notice something else that should change, mention it in the description or open a separate issue.

Only maintainers merge pull requests.

## Changesets

Packages are versioned independently with [changesets](https://github.com/changesets/changesets). If your pull request changes the behavior or public API of `@usesounds/core` or `@usesounds/react`, add a changeset:

```bash
bun run changeset
```

Pick the affected package(s) and the bump type following [Semantic Versioning](https://semver.org/):

| Bump | When |
| --- | --- |
| `major` | Breaking public API or documented behavior. This includes renaming or removing a preset, or changing how a preset sounds in a way users would notice. |
| `minor` | Backwards-compatible features: new presets, new options. |
| `patch` | Bug fixes. |

Write a short, user-facing summary, since it ends up in the package's `CHANGELOG.md`. Commit the generated `.changeset/*.md` file with your change. Docs-only, test-only and tooling-only changes don't need a changeset.

## Release process (maintainers only)

Releases are published to npm **only by CI**, never from a local machine.

1. **Version:** on a branch, run `bun run version-packages`. This consumes pending changesets, bumps versions, updates `@usesounds/react`'s range on `@usesounds/core` if needed, writes the `CHANGELOG.md` entries and syncs `bun.lock`.
2. **Verify:** run `bun run build && bun run check:package`.
3. **Merge:** commit as `chore(release): version packages`, open a pull request, and merge it.
4. **Publish:** create a GitHub Release from `main`. The [publish workflow](./.github/workflows/publish.yml) runs typecheck, lint, test, build and `check:package`, then publishes, in order, every package whose version isn't on npm yet (`core` before `react`), with npm provenance.

## License

By contributing, you agree that your contributions are licensed under the [ISC License](./LICENSE).
