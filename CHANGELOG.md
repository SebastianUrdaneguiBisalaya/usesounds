# Changelog

This file summarizes what each usesounds release brings, across both packages. Each package also has its own version and changelog, written by [changesets](https://github.com/changesets/changesets):

- [`@usesounds/core`](packages/core/CHANGELOG.md): the framework-agnostic engine.
- [`@usesounds/react`](packages/react/CHANGELOG.md): React bindings on top of `core`.

Versions follow [Semantic Versioning](https://semver.org/). For full usage, see each package's README.

## 0.1.0: Initial release

`@usesounds/core@0.1.0` · `@usesounds/react@0.1.0`

The first release: small UI sounds for web and Electron apps, synthesized with the Web Audio API. There are no audio files and no runtime dependencies.

### Built-in sounds

Six synthesized presets, made at play time from oscillators and noise:

| Preset    | Sound                                     | Typical use                               |
| --------- | ----------------------------------------- | ----------------------------------------- |
| `tick`    | Very short, crisp, high tick              | Buttons, menu items, list selection       |
| `pop`     | Soft, bubbly pop that glides upward       | Opening popovers, adding items            |
| `tap`     | Muted, low tap                            | Secondary actions, tabs, chips            |
| `toggle`  | Two-step "click-clack"                    | Switches, checkboxes, on/off settings     |
| `success` | Bright rising arpeggio                    | Saved, sent, copied, uploaded             |
| `error`   | Low, gentle descending "uh-oh"            | Failed actions, validation errors         |

The list is exported (`presets`, `presetNames`, the `PresetName` type), so you can enumerate it, for example in a settings screen.

### Ways to play a sound

- **Declarative `data-sound`:** add `data-sound="tick"` to any element and it plays with no extra code. A single delegated listener plays the sound on `pointerdown` (on press, so it feels instant) and on keyboard activation (`Enter`, plus `Space` for buttons, switches, checkboxes and radios; key repeats are ignored). Disabled elements stay silent. You can override volume and pitch per element with `data-sound-volume` and `data-sound-pitch`.
- **React hook:** `useSound("tick")` returns a stable `play()` function that is safe in dependency arrays, with default and per-call `volume`/`pitch` options.
- **Engine API:** `createSoundEngine()` and `engine.play()` work without React (vanilla JS, Vue, Svelte…), and `useSoundEngine()` gives React code direct access to the engine.

### Custom sounds

- **Your own synthesized sounds:** describe them as plain data (tone or noise voices plus a gain envelope) and register them through the `sounds` option or `engine.register()`. They can also replace a preset.
- **Samples:** register short audio files by URL or from an `ArrayBuffer` (any format the browser can decode). Each file is fetched and decoded once, then cached. `preload()` gets samples ready ahead of time. A sample that isn't decoded yet is skipped rather than played late.

### React integration

- `<SoundProvider>` sets up one engine for its subtree, with `enabled`, `volume`, `respectReducedMotion`, `sounds`, `declarative` and `onError` props, all reactive.
- Providers can be nested, so a section can use its own sounds or volume. Hooks use the closest provider.
- Works under `<StrictMode>`, and every bundle file starts with `"use client"` for the Next.js App Router and React Server Components.

### User control and accessibility

- A global on/off switch (`enabled` / `setEnabled`) that you can bind to an app setting.
- A master volume (0–1) plus per-sound overrides.
- Silent by default when the user has `prefers-reduced-motion: reduce` set. The setting updates live and can be turned off with `respectReducedMotion`.

### Reliability

- **Handles the autoplay policy:** the `AudioContext` is created lazily and unlocked on the first user gesture. A sound that would play late after unlocking is dropped, so stale sounds don't pile up.
- **Never throws on play:** runtime failures (unknown sound, audio blocked, a sample that failed to load or decode) go to an optional `onError` callback as a `SoundPlaybackError` with a typed `reason` and the original `cause`. Setup mistakes throw typed errors (`InvalidSoundError`, `MissingSoundProviderError`) with a machine-readable `code`.
- **SSR-safe:** importing the package has no side effects, and on the server every API is a silent no-op.
- **CSP-friendly:** synthesized sounds need no CSP changes. Samples loaded by URL only need `connect-src`, not `media-src`.
- **No console output** of its own.

### Packaging

- ESM and CommonJS builds with bundled TypeScript types, tree-shakable (`sideEffects: false`).
- Runs the same in browsers and in the Electron renderer on macOS, Windows and Linux.
- `@usesounds/react` has `react >=18` and `@usesounds/core` as peer dependencies only.
