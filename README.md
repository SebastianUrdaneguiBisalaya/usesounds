# usesounds

**Tiny, synthesized UI sounds for React and the web.** Ticks, pops, taps, toggles and success/error cues, generated live with the Web Audio API. There are no audio files to ship and no runtime dependencies. You can add sounds with a hook or with a single `data-sound` attribute.

[![npm: @usesounds/core](https://img.shields.io/npm/v/@usesounds/core?label=%40usesounds%2Fcore)](https://www.npmjs.com/package/@usesounds/core)
[![npm: @usesounds/react](https://img.shields.io/npm/v/@usesounds/react?label=%40usesounds%2Freact)](https://www.npmjs.com/package/@usesounds/react)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](./LICENSE)

```tsx
<SoundProvider volume={0.4}>
  <button data-sound="tick">Save</button>
  <button data-sound="pop">Open menu</button>
</SoundProvider>
```

---

## Packages

| Package | Description | Docs |
| --- | --- | --- |
| [`@usesounds/core`](https://www.npmjs.com/package/@usesounds/core) | Framework-agnostic engine: audio lifecycle, synthesized presets, sample loading, declarative `data-sound` listener. | [README](./packages/core/README.md) |
| [`@usesounds/react`](https://www.npmjs.com/package/@usesounds/react) | React bindings: `<SoundProvider>`, `useSound()`, `useSoundEngine()`. | [README](./packages/react/README.md) |

If you use React, install `@usesounds/react`. In any other environment (vanilla JS, Svelte, Vue, Web Components…), use `@usesounds/core` directly.

## Why usesounds

- **Zero runtime dependencies.** `core` uses the Web Audio API directly. `react` only has peer dependencies (`react` and `@usesounds/core`).
- **Synthesized by default.** The built-in sounds are small descriptions of oscillators and noise, rendered when they play. There are no `.mp3` files to download, host or license, and nothing extra in your bundle.
- **Declarative.** Add `data-sound="tick"` to any element. A single delegated listener plays it on pointer *and* keyboard activation, so you don't need extra code for each button.
- **Low latency.** Sounds play from live oscillators or pre-decoded `AudioBuffer`s, never from `<audio>` elements.
- **Respectful by default.** You get a global mute and a master volume, and sounds are muted when the user has `prefers-reduced-motion: reduce` set.
- **Safe everywhere.** Imports and server rendering never touch browser APIs, so it works with the Next.js App Router, Remix, Electron and plain SPAs. Playing a sound never throws.
- **Typed.** Written in TypeScript, with preset names autocompleted and typed error classes.

### How it compares

| | **usesounds** | `use-sound` | `snd-lib` |
| --- | --- | --- | --- |
| Sound source | Synthesized presets + your own samples | Your audio files | Bundled sample kits |
| Audio files required | No | Yes | Included in kits |
| Runtime dependencies | None | Howler.js | Ships its own audio assets |
| Declarative per-element API | Yes (`data-sound`) | No | No |
| Keyboard activation feedback | Built in | Not built in | Not built in |
| Reduced-motion aware | Yes (default) | Not built in | Not built in |
| Framework | Any (core) + React bindings | React | Any |

If you need long or music-like audio, a sample-based library may be a better fit. usesounds is built for short interface feedback.

## Quick start (React)

Install both packages. `@usesounds/core` is a peer dependency of `@usesounds/react`:

```bash
# npm
npm install @usesounds/react @usesounds/core

# pnpm
pnpm add @usesounds/react @usesounds/core

# Yarn
yarn add @usesounds/react @usesounds/core

# Bun
bun add @usesounds/react @usesounds/core
```

Wrap your app once, then use either API:

```tsx
import { SoundProvider, useSound } from "@usesounds/react";

export function App() {
  return (
    <SoundProvider volume={0.4}>
      {/* Declarative: no extra code per element */}
      <button data-sound="tick" type="button">
        Save
      </button>

      {/* Imperative: play from your own handlers */}
      <CopyButton />
    </SoundProvider>
  );
}

function CopyButton() {
  const playSuccess = useSound("success");
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText("Hello");
        playSuccess();
      }}
      type="button"
    >
      Copy
    </button>
  );
}
```

Without React:

```ts
import { createSoundEngine } from "@usesounds/core";

const engine = createSoundEngine({ volume: 0.4 });
engine.bindDeclarative(); // plays every [data-sound] element in the document
engine.play("tick"); // or play imperatively
```

## Key concepts

Short definitions of the terms used across the docs:

| Term | Meaning |
| --- | --- |
| **Engine** | The object returned by `createSoundEngine()`. It owns the audio pipeline: it creates the `AudioContext`, keeps the registry of sounds, applies master volume and mute, loads samples, and plays sounds. All other APIs (provider, hook, `data-sound`) are thin layers that call an engine. You usually have one per app. |
| **`AudioContext`** | The browser's Web Audio "sound card". The engine creates it lazily (never at import time) and reuses it for every sound. |
| **Unlock** | Browsers block audio until the user interacts with the page (*autoplay policy*). "Unlocking" means creating or resuming the `AudioContext` during a user gesture (`pointerdown`/`keydown`). usesounds does this for you on the first gesture. |
| **Preset** | A built-in synthesized sound: `tick`, `pop`, `tap`, `toggle`, `success`, `error`. |
| **Synthesized sound** | A sound described as plain data (one or more *voices*), generated by Web Audio oscillators/noise when played. No files. |
| **Voice** | One layer of a synthesized sound: a waveform (`sine`, `square`, `sawtooth`, `triangle` or `noise`) with a frequency and a short volume *envelope*. |
| **Envelope** | How a voice's volume changes over its life: a fast `attack` (fade-in) followed by a decay to silence over `duration`. It keeps sounds click-free. |
| **Sample** | A short audio file (`.wav`, `.mp3`…) you register by URL or `ArrayBuffer`. It is fetched once, decoded into an `AudioBuffer`, cached, and then played with no delay. |
| **Declarative mode** | Playing sounds from `data-sound` attributes instead of code. One delegated listener on the document handles every element. |
| **Bindings** | Two related meanings: (1) `@usesounds/react` is the *React bindings*: it connects the framework-agnostic engine to React's component model (provider, hooks, lifecycle cleanup). (2) The engine's `bindDeclarative()` / `bindUnlock()` methods *bind* listeners to a DOM root and return an `unbind` function. They exist so listeners are installed only when you ask for them (never as an import side effect) and can be removed cleanly. |
| **Provider** | `<SoundProvider>`: the React component that owns one engine, keeps it in sync with its props, and shares it with its subtree. |
| **Master volume** | The global volume (`0`–`1`) applied to every sound. Each play can set its own volume, which is multiplied by the master volume. |
| **Reduced motion** | The OS/browser accessibility setting `prefers-reduced-motion: reduce`. usesounds treats it as "fewer non-essential effects" and mutes by default. |

## Things to keep in mind

- **Sounds are feedback, not information.** Some users mute, some can't hear, and some have reduced motion on. Never use a sound as the only signal that something happened.
- **Nothing plays before the first interaction.** That's the browser's autoplay policy, not a bug. The first click or keypress unlocks audio.
- **Give users a switch.** Bind `enabled` to an app setting so people can turn UI sounds off.
- **Keep it subtle.** A master volume around `0.3`–`0.5` usually feels right for UI feedback.
- **Samples by URL need CSP `connect-src`.** Synthesized sounds need no CSP changes. See the package READMEs.

## Browser and platform support

usesounds runs anywhere the [Web Audio API](https://developer.mozilla.org/docs/Web/API/Web_Audio_API) is available: current Chrome, Edge, Firefox and Safari (desktop and mobile), and the Electron renderer process on macOS, Windows and Linux. The same code behaves identically on web and desktop. On the server (SSR), every API is a silent no-op.

React bindings require React 18 or later.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, scripts and the pull request workflow, and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). To report a vulnerability, follow [SECURITY.md](./SECURITY.md).

## License

[ISC](./LICENSE) © Sebastian Marat Urdanegui Bisalaya
