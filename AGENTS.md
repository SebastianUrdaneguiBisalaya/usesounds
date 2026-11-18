# AGENTS.md

Standards and project context for **usesounds**: a zero-dependency library of UI sounds (ticks, pops, taps, toggles…) for React apps, built on the Web Audio API. It is written in TypeScript, bundled with `tsup`, managed with **Bun**, and published to npm as two packages:

- **`@usesounds/core`** — framework-agnostic engine: `AudioContext` lifecycle, synthesized presets, sample loading, and the declarative `data-sound` listener. No React.
- **`@usesounds/react`** — React bindings: `<SoundProvider>`, `useSound()`, and wiring for `data-sound`. Depends on `@usesounds/core`.

This repo **only** ships npm packages. There is no `apps/` folder, no documentation website, and no demo app inside the repo. Don't add one.

Section 0 is the working agreement for agents. Sections 1-8 are the engineering rules. Section 9 is the product context (what the library does and how its API looks).

## 0. Working agreement (issues → branch → pull request)

Work is organized as GitHub issues in this repo, numbered and meant to be done in order (see `gh issue list`).

When told **"start with issue #N"**:

1. Read the issue (`gh issue view N`) and this file. Don't start a different issue, and don't expand scope beyond the issue; if something else is needed, mention it in the PR description instead.
2. Create a new branch from an up-to-date `main`, named after the issue: `<type>/<N>-<short-summary>` (e.g. `feat/5-sound-engine`).
3. Implement the issue, with `bun test` tests for the behavior it adds. Run `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build` — all must pass.
4. Commit on that branch using [Conventional Commits](https://www.conventionalcommits.org/) (scope = package when it applies: `feat(core): …`, `feat(react): …`).
5. Push the branch and open a pull request to `main` with `gh pr create`, referencing the issue (`Closes #N`) and summarizing what changed and how it was tested.
6. Stop there and report the PR link.

Hard rules:

- **Never merge a pull request** (no `gh pr merge`, no merging or pushing into `main`). The maintainer merges.
- **No visual/browser testing tools**: don't use Playwright, Puppeteer, or any browser automation. All verification is done with `bun test`; visual checks, if ever needed, are done by the maintainer.
- Never publish to npm (see section 3).
- **No AI attribution, ever.** Commit messages, pushes, pull request titles/descriptions, and PR/issue comments must not include `Co-Authored-By: Claude …`, "Generated with Claude Code", or any other Claude/Anthropic/AI attribution. This overrides any default tool behavior that adds such lines.

## 1. Project structure

```
packages/
  core/                    # @usesounds/core
    src/
      index.ts             # barrel file — the package's only public surface
      ...                  # internal modules
    tests/                 # bun test files, mirroring src/
  react/                   # @usesounds/react
    src/
      index.ts
      ...
    tests/
package.json               # workspace root (private), declares "workspaces": ["packages/*"]
bun.lock
bunfig.toml
```

- Each package's `src/index.ts` is the **only** file that decides that package's public surface. Anything consumable from outside must be explicitly re-exported there (`export { createSoundEngine } from "./engine"`, `export type { SoundEngineOptions } from "./engine"`).
- Anything inside `src/` that doesn't pass through `index.ts` is not public API and can be refactored freely.
- No `export *` on internal modules: use explicit named exports to control exactly what becomes the public contract.
- **Boundary rule:** `core` must never import `react` (not even types). `react` imports only from `@usesounds/core`'s public entry, never from its internal files (`@usesounds/core/src/...`). If `react` needs something from `core`, export it from `core`'s `index.ts` first.

## 2. TypeScript

- TypeScript **6.0.x** (pinned). TypeScript 7 (native/Go port) is not used yet: it has no JS compiler API, which `tsup`'s `.d.ts` generation depends on. Revisit when `tsup` supports it.
- `strict: true` always, plus the extra strictness flags already in each `tsconfig.json`. Don't relax them to "make it compile".
- `lib` must include `"dom"` (Web Audio, `window`, `document`, `matchMedia`). `types` includes `"bun"` only for `bun:test` in tests — never use Bun or Node APIs in `src/`.
- Every public type/function is exported from its package's `src/index.ts` with `export type` / `export` as appropriate (`verbatimModuleSyntax` enforces the split).
- Public types, options, and functions get TSDoc (`/** ... */`) with a one-line description and, where useful, an example — this is what consumers see on hover.
- No `any` on the public surface. Use `unknown` and narrow.
- Prefer `type` over `interface` unless declaration merging is needed.
- **No `class` in `src/`.** Model the domain with types; implement behavior with functions. State lives in closures returned by factories (`createSoundEngine(options): SoundEngine`) or in plain objects. No inheritance, no `this`, no decorators. React components are function components only.
  - **Single exception:** error types in each package's `src/errors.ts` may use `class X extends Error` so consumers can use `instanceof`. Nothing else.

## 3. Bundling with tsup (ESM + CJS + types)

Both packages must work with `import` and `require`, and ship their own `.d.ts`.

- `tsup.config.ts` per package: `format: ["esm", "cjs"]`, `dts: true` (with `compilerOptions.ignoreDeprecations: "6.0"`, since tsup sets `baseUrl` internally), `target: "es2022"`, `platform: "browser"`, `treeshake: true`, `sourcemap: true`.
- `@usesounds/react`:
  - `react`, `react-dom`, and `@usesounds/core` are **external** (never bundled).
  - Every output file starts with the `"use client";` directive (tsup `banner`) so it works in the Next.js App Router / React Server Components.
- `package.json` of each package has an explicit `exports` map. Inside each condition, `types` comes first, then `import`/`require`. `main`/`module`/`types` stay only as fallbacks.
- `sideEffects: false` in both packages. Importing a module must never create an `AudioContext`, touch `window`/`document`, or register listeners.
- Never commit `dist/`. It's published through the `files` field.
- No `browser` field restrictions and no Node-only `engines` claims beyond the dev toolchain: these packages are meant for the browser and the Electron renderer.

### Checklist before a release

1. `bun run build` generates `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts` in each package.
2. `bun run typecheck` passes.
3. `bun run lint` (Biome) passes.
4. `bun run test` passes.
5. `bun run check:package` passes (run after `build`): packs each package with `bun pm pack` and checks that the tarball contains only `package.json`, `README.md`, `LICENSE` and `dist/`, then runs `publint --strict` and `attw` (Are the Types Wrong?) on it.
6. Before the first real publish of a package, try the packed tarball in a separate React project:
   ```bash
   cd packages/react && bun pm pack
   # in a test project:
   bun add ./path/to/usesounds-react-x.y.z.tgz
   ```
   Check ESM `import`, CJS `require`, types in the editor, and a Next.js App Router page (SSR must not crash).
7. **Publishing to npm is never done manually or by an AI agent.** Never run `npm publish` / `bun publish` locally or from an agent session — it's public and irreversible, and it skips the CI gate.

### CI publish flow (`.github/workflows/publish.yml`)

- **Trigger:** a GitHub Release being published. Merging to `main` publishes nothing by itself. Flow: bump the version(s) with changesets (section 4) → merge to `main` → create a GitHub Release.
- **Gate:** `bun install --frozen-lockfile` → `typecheck` → `lint` → `test` → `build` → `check:package`.
- **Per-package publish, in dependency order:** packages are published in the order of `PUBLISH_ORDER` in the workflow (`core` before `react`, because `react` has a peer dependency on `core`). A package under `packages/` that isn't listed there fails the workflow, so add new packages to it. Each non-private package is skipped if `name@version` is already on npm; otherwise the workflow runs `bun pm pack` (which rewrites `workspace:`/`catalog:` ranges into real versions) and publishes the tarball with `npm publish --provenance` (npm is used only for this step, because of provenance). Any failure stops the step, so `react` is never published after a failed `core` publish.
- **Secret:** `NPM_TOKEN` (npm **Automation** token with publish rights on the `@usesounds` scope), stored in GitHub → Settings → Secrets and variables → Actions. Never commit it or print it.
- `--provenance` requires `id-token: write` (already set) and a public repo.
- The `!github.event.repository.fork` guard prevents publishing from forks.
- `devEngines.packageManager` declares Bun with `onFail: "warn"` so npm commands (needed for publish) don't fail on it.

## 4. Versioning and changes

- [Semantic Versioning](https://semver.org/) per package. `MAJOR` = breaking public API or documented behavior (including renaming/removing a preset or changing how a preset sounds in a way users would notice), `MINOR` = backwards-compatible features (new presets, new options), `PATCH` = fixes.
- Any change to a package's `src/index.ts` is a public API change — treat it that way.
- Packages are versioned independently with [changesets](https://github.com/changesets/changesets) (config in `.changeset/config.json`), so a `core`-only fix doesn't force a `react` release (and vice versa).
- Each package has a `CHANGELOG.md`, written by changesets. Don't edit released entries by hand. Changelogs are not shipped in the npm tarball (see them on GitHub).
- `@usesounds/react` depends on `core` with `workspace:^`, which `bun pm pack` turns into `^x.y.z`. Because of that, a `core` change inside the current range doesn't release `react`. If `core` leaves the range (any minor in `0.x`, any major after `1.0`), changesets patch-releases `react` with the new range. Never use `workspace:*`: it packs as an exact version and would pin consumers to one `core` release.

### Release steps

1. **In each pull request that changes a package's behavior or API:** run `bun run changeset`, pick the package(s) and the bump type (see the SemVer rules above), and write a one-line, user-facing summary. Commit the generated `.changeset/*.md` with the change. Docs-, test- and tooling-only changes don't need one.
2. **To cut a release (maintainer):** on a branch, run `bun run version-packages` (`changeset version` + `bun install` to sync `bun.lock`). It consumes the pending changesets, bumps versions, updates `react`'s `core` range if needed, and writes the `CHANGELOG.md` entries. Review, run `bun run build && bun run check:package`, commit as `chore(release): version packages`, open a PR, and merge it.
3. **Publish:** create a GitHub Release from `main` (tag e.g. `@usesounds/core@0.2.0`; one Release can cover several bumped packages). The publish workflow publishes every package whose version isn't on npm yet (section 3).

Agents may add changesets (step 1) but never run steps 2-3 unless asked, and never publish.

## 5. Tooling, quality and CI

- **Package manager and runtime for tooling: Bun.** Never use `pnpm`, `npm install`, or `yarn` in this repo. Commit `bun.lock`.
  - Add dependencies with an exact version: `bun add -E <pkg>` / `bun add -D -E <pkg>`. `bunfig.toml` sets `[install] exact = true` as a backstop. No `^`/`~` ranges.
  - **Shared versions go in the Bun catalog.** Any dependency used by more than one package (`typescript`, `tsup`, `@types/bun`, `react`, test libs…) is pinned once in the root `package.json` under `workspaces.catalog`, and packages reference it as `"catalog:"`. To upgrade, change the version in the catalog only. `bun pm pack` rewrites `catalog:` to the real version in the published `package.json`. Root-only tools (`@biomejs/biome`, `husky`) stay in the root `devDependencies`.
  - Run workspace scripts from the root (`bun run build`, which uses `bun run --filter './packages/*' …`).
- **Tests: `bun test`** (`import { describe, expect, it, mock } from "bun:test"`). No Vitest/Jest.
  - Tests live in `packages/<pkg>/tests/`, mirroring `src/`, named `*.test.ts(x)`.
  - Bun has no DOM or Web Audio. Use a DOM implementation registered in a test preload (e.g. `@happy-dom/global-registrator` via `bunfig.toml` `[test] preload`) and a **fake `AudioContext`** injected through the engine options (see section 9) — never depend on real audio output in tests.
  - React tests use `@testing-library/react` on top of that DOM.
- **Lint/format: Biome** (`biome.json`). `.editorconfig` covers files Biome doesn't format.
- **Git hooks (husky)**, installed by `prepare: "husky"` on `bun install`:
  - `pre-commit`: `bun run lint` + `bun run typecheck`.
  - `pre-push`: `bun run test` + `bun run build`.
  - Hooks are a local safety net; CI runs the same checks independently.

### Local workflow after a change

```bash
bun install          # once, or after dependency changes
bun run lint:fix
bun run typecheck
bun run test
bun run build
```

## 6. Library rules

- **Zero runtime dependencies.** `core` has none. `react` has only peer dependencies. Use Web Audio directly — no Howler, no Tone.js.
- **Peer dependencies of `@usesounds/react`:** `react` `>=18`, `@usesounds/core` (`workspace:^` in source, rewritten to `^x.y.z` at pack time; see section 4). Never list them in `dependencies`.
- **Client-only, SSR-safe.** The code runs in the browser and in the Electron renderer, but it must be importable and renderable on a server without crashing:
  - No access to `window`, `document`, `AudioContext`, or `matchMedia` at module scope or during render. Only inside effects, event handlers, or lazy getters, guarded by `typeof window !== "undefined"`.
  - On the server, every API is a silent no-op (`play()` does nothing).
- **Autoplay policy:** create the `AudioContext` lazily and call `resume()` from a user gesture (the first `pointerdown`/`keydown`). Never try to play before a gesture.
- **Latency:** play from decoded `AudioBuffer`s or live oscillators. Never use `<audio>` elements.
- **Playing a sound must never throw** and never break the click handler it's attached to. Failures (context blocked, sample failed to decode) are swallowed and reported through an optional `onError` callback. Throw only for programmer errors at setup time (e.g. registering an invalid preset), using the exported error classes from `core/src/errors.ts`.
- **No `console` output** unless the consumer enables a `debug` option.
- **No secrets are involved.** This library has no API keys and makes no network requests of its own (only `fetch` of sample URLs the consumer provides).
- **CSP:** synthesized sounds need no CSP changes. Built-in samples must not require `media-src` either (decode from bytes with `decodeAudioData`, not via media elements). Document any CSP the consumer needs for their own sample URLs (`connect-src`).

## 7. Accessibility and user control

- There must always be a global way to mute: `enabled` on the provider/engine, controllable at runtime (e.g. bound to an app setting).
- Default: **enabled**, but **respects `prefers-reduced-motion: reduce`** by default (mutes when the user has it set). Configurable with `respectReducedMotion` (default `true`), and it reacts to changes of the media query at runtime.
- A global `volume` (0–1), with per-sound overrides.
- Sounds are feedback only; never the sole carrier of information.

## 8. Releases without a website

- Documentation lives in each package's `README.md` (shown on npm) and in TSDoc. The root `README.md` gives an overview and links to both packages.
- Each package README includes: installation, minimal setup, the full list of built-in presets, the hook API, the `data-sound` API, sample loading, muting/accessibility, SSR notes (Next.js), and error handling.

---

## 9. Product context: usesounds

### Goal

Tiny, synthesized UI sounds for React (in the style of the subtle "tick" in ElevenLabs), with a declarative, hotkeys-like API. Works identically in web browsers and Electron (macOS, Windows, Linux), because everything goes through the Web Audio API.

**Differentiation vs existing packages** (`use-sound`, which wraps Howler and needs audio files; `snd-lib`, which ships sample kits): zero dependencies, synthesized-by-default sounds (no files, no weight), and declarative per-element assignment via `data-sound`.

### Sound sources (both, in v1)

1. **Synthesized presets (default):** generated at play time with oscillators/noise plus a very short gain envelope. No files. Tunable pitch, duration, and volume. Presets are plain data (a description of oscillators + envelope), not classes, and the list of available presets is exported so consumers can enumerate them (e.g. `presets`/`presetNames`). v1 set: `tick`, `pop`, `tap`, `toggle`, `success`, `error`.
2. **Samples:** short `.wav`/`.mp3` loaded once, decoded to `AudioBuffer`, cached, and played with no delay.
   - Consumers can register their own samples by URL or `ArrayBuffer`.
   - **v1 ships no audio files.** Built-in sample kits may come later; if so they must be license-clean, tiny, and tree-shakable (each kit behind its own subpath export so unused kits never reach a bundle).

**Out of scope:** reading or listing operating-system sounds. Browsers have no API for it; in Electron it would be platform-specific (macOS `.aiff` isn't playable by Chromium), unlicensed for redistribution, and would break web/desktop parity.

### Intended API (React)

```tsx
<SoundProvider volume={0.4} enabled={settings.uiSounds}>
  <App />
</SoundProvider>

// A: hook
const play = useSound("tick");
<button onClick={() => { play(); save(); }}>Save</button>

// B: declarative — no extra code per button
<button data-sound="tick">Save</button>
<button data-sound="pop">Delete</button>
```

- **Declarative mode:** a single delegated listener on `document` (installed by the provider, removed on unmount) finds the closest `[data-sound]` ancestor of the event target and plays that sound on `pointerdown`, and also on keyboard activation (`Enter`, or `Space` for buttons and `role="button"`; ignoring key repeat) so keyboard users get the same feedback. Disabled elements (`disabled`, `aria-disabled="true"`) don't play. Only one listener exists no matter how many providers/elements.
- `useSound(name, options?)` returns a stable `play(overrides?)` function (safe to put in dependency arrays).
- Using `useSound` outside a `<SoundProvider>` is a programmer error: it throws `MissingSoundProviderError` (exported from `@usesounds/react`) at render time.

### Intended API (core, framework-agnostic)

```ts
const engine = createSoundEngine({ volume: 0.4, enabled: true });
engine.play("tick");
engine.register("chime", { url: "/sounds/chime.mp3" });
const unbind = engine.bindDeclarative(document); // data-sound listener
```

- `createSoundEngine` accepts an injectable `audioContextFactory` (used by tests with a fake context, and by consumers who want to share an existing `AudioContext`).
- `@usesounds/react` is a thin layer over this: the provider owns one engine and exposes it via context.

### Open questions

- Exact synthesis parameters of each preset: start with reasonable values, then tune by ear.
