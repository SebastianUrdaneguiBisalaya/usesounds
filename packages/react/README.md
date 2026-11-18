# @usesounds/react

**Tiny, synthesized UI sounds for React.** Add a `data-sound` attribute or call a hook. There are no audio files and no runtime dependencies, and it is SSR-safe (Next.js App Router ready).

[![npm version](https://img.shields.io/npm/v/@usesounds/react)](https://www.npmjs.com/package/@usesounds/react)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/@usesounds/react)](https://bundlephobia.com/package/@usesounds/react)
[![types](https://img.shields.io/npm/types/@usesounds/react)](https://www.npmjs.com/package/@usesounds/react)
[![license](https://img.shields.io/npm/l/@usesounds/react)](https://github.com/SebastianUrdaneguiBisalaya/usesounds/blob/main/LICENSE)

```tsx
<SoundProvider volume={0.4}>
  <button data-sound="tick">Save</button>
</SoundProvider>
```

This package is the React layer of [usesounds](https://github.com/SebastianUrdaneguiBisalaya/usesounds). The audio engine lives in [`@usesounds/core`](https://www.npmjs.com/package/@usesounds/core), which this package re-exports what you need from.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Key concepts](#key-concepts)
- [Built-in presets](#built-in-presets)
- [`useSound`](#usesound)
- [Declarative `data-sound`](#declarative-data-sound)
- [Custom synthesized sounds](#custom-synthesized-sounds)
- [Samples (audio files)](#samples-audio-files)
- [Muting, volume and reduced motion](#muting-volume-and-reduced-motion)
- [Accessing the engine](#accessing-the-engine)
- [Nested providers](#nested-providers)
- [SSR and Next.js](#ssr-and-nextjs)
- [Content Security Policy](#content-security-policy)
- [Error handling](#error-handling)
- [API reference](#api-reference)

## Installation

`@usesounds/core` is a **peer dependency**: install it next to this package.

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

Requires **React 18 or later**. It ships ESM and CommonJS builds with TypeScript types.

## Quick start

**1. Wrap your app once** (usually at the root):

```tsx
import { SoundProvider } from "@usesounds/react";

export function Root({ children }: { children: React.ReactNode }) {
  return <SoundProvider volume={0.4}>{children}</SoundProvider>;
}
```

**2. Add sounds**, declaratively or with the hook:

```tsx
import { useSound } from "@usesounds/react";

function Toolbar({ onSave }: { onSave: () => Promise<void> }) {
  const playSuccess = useSound("success");
  const playError = useSound("error");

  return (
    <>
      {/* Plays on press, by pointer or keyboard. No handler needed. */}
      <button data-sound="pop" type="button">
        Menu
      </button>

      {/* Plays from your own logic */}
      <button
        onClick={() => onSave().then(() => playSuccess(), () => playError())}
        type="button"
      >
        Save
      </button>
    </>
  );
}
```

That's it. Audio unlocks on the user's first interaction, and sounds stay muted for users with reduced motion enabled.

## Key concepts

| Term | Meaning |
| --- | --- |
| **Engine** | The audio "motor" from `@usesounds/core`. It owns the `AudioContext`, the registry of sounds, master volume, mute, and sample loading. Every API in this package ends up calling an engine's `play()`. |
| **Provider** | `<SoundProvider>` creates **one engine** for its subtree, keeps it in sync with its props (`enabled`, `volume`, `sounds`…), installs the `data-sound` listener, and releases everything on unmount. Hooks find the closest provider through React context. |
| **Bindings** | This package is the *React bindings* for the engine. It translates React's model (props, context, effects, unmounting) into engine calls, so the engine itself stays framework-agnostic and the same engine can power other frameworks. |
| **Preset** | A built-in synthesized sound: `tick`, `pop`, `tap`, `toggle`, `success`, `error`. |
| **Synthesized sound** | A sound described as data (voices: waveform + frequency + envelope) and generated live, with no file involved. |
| **Sample** | A short audio file you register by URL or `ArrayBuffer`. It is decoded once, cached, and played without delay. |
| **Declarative mode** | Playing sounds from `data-sound` attributes. One delegated listener handles the whole document, however many elements you have. |
| **Unlock** | Browsers block audio until a user gesture (*autoplay policy*). The provider resumes audio on the first `pointerdown`/`keydown` for you. |

## Built-in presets

| Name | Sound | Use for |
| --- | --- | --- |
| `tick` | A very short, crisp, high tick, subtle enough for every click. | Generic buttons, menu items, list selection, shortcuts. |
| `pop` | A soft, bubbly pop that glides upward. | Opening popovers/menus, adding items, revealing content. |
| `tap` | A muted, low tap, like a fingertip on a surface. | Secondary actions, tabs, chips, drops. |
| `toggle` | A two-step "click-clack", the second blip higher. | Switches, checkboxes, segmented controls. |
| `success` | A short, bright rising major arpeggio. | Saved, sent, copied, uploaded. |
| `error` | A low, gentle descending "uh-oh". | Failed actions, validation errors. |

```tsx
import { presetNames, useSound, type PresetName } from "@usesounds/react";

function PresetPreview({ name }: { name: PresetName }) {
  const play = useSound(name);
  return (
    <button onClick={() => play()} type="button">
      {name}
    </button>
  );
}

export function PresetList() {
  return presetNames.map((name) => <PresetPreview key={name} name={name} />);
}
```

## `useSound`

```ts
function useSound(name: SoundName, options?: SoundPlayOptions): PlaySound;
type PlaySound = (overrides?: SoundPlayOptions) => void;
```

- **`name`** is a preset or any sound registered on the provider. It is typed as `SoundName`, so editors autocomplete presets and custom names still type-check.
- **`options`**: `{ volume?: number; pitch?: number }` are the defaults for every play. `volume` (`0`–`1`) is multiplied by the provider's master volume. `pitch` is a multiplier (`2` = one octave up).
- **`play(overrides?)`** replaces the hook's options **field by field** for that call.
- **`play` is stable.** It keeps the same identity while `name` and the option *values* stay the same, even if you pass a new options object on every render. You can safely put it in dependency arrays.
- **`play()` never throws**, so it can't break the handler it's in. Failures go to the provider's `onError`.

```tsx
function Stepper() {
  const play = useSound("tick", { volume: 0.6 });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step > 0) {
      play({ pitch: 1 + step * 0.1 }); // volume 0.6, rising pitch
    }
  }, [step, play]);

  return (
    <button onClick={() => setStep((s) => s + 1)} type="button">
      Next
    </button>
  );
}
```

Using `useSound` outside a `<SoundProvider>` throws [`MissingSoundProviderError`](#error-handling) during render.

## Declarative `data-sound`

By default the provider plays any element with a `data-sound` attribute inside the document:

```tsx
<>
  <button data-sound="tick">Save</button>
  <button data-sound="pop" data-sound-volume="0.5">Open</button>
  <button data-sound="tick" data-sound-pitch="1.25">Next</button>
  <a href="/settings" data-sound="tap">Settings</a>
  <div aria-checked={on} data-sound="toggle" role="switch" tabIndex={0}>
    Dark mode
  </div>
</>
```

- **Pointer:** plays on `pointerdown` (primary button) on the closest `[data-sound]` ancestor, so it sounds on press and feels instant.
- **Keyboard:** `Enter` on a focused `[data-sound]` element. `Space` on buttons, on `role="button" | "switch" | "checkbox" | "radio"`, and on checkbox, radio and button inputs. Key repeats are ignored, so keyboard users get the same feedback.
- **Disabled elements don't play:** `disabled`, inside `<fieldset disabled>`, or `aria-disabled="true"`.
- **Per-element overrides:** `data-sound-volume`, `data-sound-pitch`.
- **One listener.** A single delegated listener is installed no matter how many elements or providers you have.

To only use the hook, turn declarative mode off. Audio still unlocks on the first gesture:

```tsx
<SoundProvider declarative={false}>{children}</SoundProvider>
```

## Custom synthesized sounds

Pass extra sounds to the provider. A synthesized sound is a list of voices (times in seconds, frequencies in Hz):

```tsx
import { SoundProvider, type SoundDefinition, useSound } from "@usesounds/react";

// Define outside the component (or memoize) so it isn't re-registered on every render.
const sounds = {
  chirp: {
    voices: [
      { waveform: "sine", frequency: 900, frequencyEnd: 1600, duration: 0.06, gain: 0.5 },
      { waveform: "noise", frequency: 5000, q: 2, delay: 0.01, duration: 0.01, gain: 0.15 },
    ],
  },
} satisfies Record<string, SoundDefinition>;

export function App() {
  return (
    <SoundProvider sounds={sounds}>
      <button data-sound="chirp" type="button">
        Chirp
      </button>
      <ChirpButton />
    </SoundProvider>
  );
}

function ChirpButton() {
  const play = useSound("chirp");
  return (
    <button onClick={() => play()} type="button">
      Chirp from code
    </button>
  );
}
```

| Voice field | Default | Description |
| --- | --- | --- |
| `waveform` | required | `"sine"`, `"square"`, `"sawtooth"`, `"triangle"` or `"noise"`. |
| `duration` | required | Total length in seconds, attack included. |
| `frequency` | required for tones | Tone pitch, or band-pass center for noise (omit for unfiltered noise). |
| `frequencyEnd` | — | Frequency reached at the end (exponential glide). |
| `attack` | `0.002` | Fade-in time to the peak. |
| `delay` | `0` | Offset from the start of the sound. |
| `gain` | `1` | Peak volume of the voice, `0`–`1`. |
| `q` | `1` | Band-pass quality factor (noise only). |

The `sounds` prop is synced when it changes. Each definition is compared by reference: new entries are registered, removed ones are unregistered, and a removed override of a preset brings the preset back. Using a preset name (e.g. `tick`) overrides the built-in sound.

## Samples (audio files)

```tsx
const sounds = {
  chime: { type: "sample", src: "/sounds/chime.mp3" },
} satisfies Record<string, SoundDefinition>;

<SoundProvider sounds={sounds}>…</SoundProvider>;
```

- `src` is a URL (downloaded with `fetch`) or an `ArrayBuffer` with the encoded file.
- Samples are decoded once and cached. They start loading on the first user gesture.
- A play requested before the sample is decoded is **skipped**, never played late. To have a sample ready for the very first interaction, preload it:

```tsx
function PreloadSounds() {
  const engine = useSoundEngine();
  useEffect(() => {
    void engine.preload(["chime"]);
  }, [engine]);
  return null;
}
```

`preload()` never rejects; failures go to `onError`.

## Muting, volume and reduced motion

```tsx
<SoundProvider
  enabled={settings.uiSounds} // global on/off, can change at runtime (default true)
  respectReducedMotion // mute under prefers-reduced-motion: reduce (default true)
  volume={0.4} // master volume 0–1 (default 1)
>
  {children}
</SoundProvider>
```

- **Give users a switch.** Bind `enabled` to a setting so people can turn UI sounds off.
- **Reduced motion is respected by default.** It reacts to changes at runtime. Set `respectReducedMotion={false}` only if the user explicitly opted in to sounds.
- **Sounds are feedback only.** Never use a sound as the only signal that something happened.

## Accessing the engine

`useSoundEngine()` returns the closest provider's engine (the full [`@usesounds/core` engine API](https://www.npmjs.com/package/@usesounds/core#soundengine)), stable for the provider's lifetime. Use it for things the hook doesn't cover: dynamic names, `register()`, `preload()`, `names()`.

```tsx
import { useSoundEngine } from "@usesounds/react";

function Uploader({ upload }: { upload: () => Promise<void> }) {
  const engine = useSoundEngine();
  return (
    <button
      onClick={() => upload().then(() => engine.play("success"), () => engine.play("error"))}
      type="button"
    >
      Upload
    </button>
  );
}
```

## Nested providers

Providers can be nested. Each one owns its own engine, and **hooks use the closest provider**. That makes nesting useful for giving a section its own sounds or volume through `useSound`:

```tsx
<SoundProvider volume={0.4}>
  <App />
  <SoundProvider declarative={false} sounds={editorSounds} volume={0.2}>
    <Editor /> {/* useSound() here uses the editor's sounds and volume */}
  </SoundProvider>
</SoundProvider>
```

`data-sound` works differently. Every provider listens on the whole document, and **the deepest mounted provider with `declarative` enabled plays every `data-sound` element on the page**, including elements outside its own subtree. To keep `data-sound` consistent, leave declarative mode on only in the outermost provider and pass `declarative={false}` to nested ones, as above.

## SSR and Next.js

- **Safe to import and render on the server.** Nothing touches `window`, `document` or `AudioContext` during import or render. On the server every API is a silent no-op.
- **Client component ready.** The build starts with the `"use client"` directive, so `SoundProvider` and the hooks work in the Next.js App Router.
- Props passed from a Server Component must be serializable. Functions (`onError`, `audioContextFactory`), `ArrayBuffer` samples and client state (like a user setting) can't cross that boundary, so the usual pattern is a small client wrapper:

```tsx
// app/providers.tsx
"use client";

import { SoundProvider } from "@usesounds/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SoundProvider onError={(error) => console.warn(error.message)} volume={0.4}>
      {children}
    </SoundProvider>
  );
}
```

```tsx
// app/layout.tsx (Server Component)
import type { ReactNode } from "react";
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`data-sound` attributes work in Server Components too: they're plain HTML attributes, and the provider's listener picks them up on the client.

## Content Security Policy

- **Synthesized sounds** (presets and custom voices) need **no CSP changes**.
- **Samples by URL** are fetched, so their origin must be allowed by **`connect-src`** (not `media-src`). Cross-origin URLs also need CORS headers.
- **Samples from an `ArrayBuffer`** need no CSP changes.

## Error handling

| Error | When | Thrown? |
| --- | --- | --- |
| `MissingSoundProviderError` | `useSound` / `useSoundEngine` used outside a `<SoundProvider>`. | Yes, at render. Wrap the tree in a provider. |
| `InvalidSoundError` | Invalid name or definition in the `sounds` prop. | Yes, at render (or when the prop changes). Fix the definition. |
| `SoundPlaybackError` | A sound couldn't play or a sample couldn't load. | No, passed to `onError`. |

```tsx
import { SoundProvider, type SoundPlaybackError } from "@usesounds/react";

function reportSoundError(error: SoundPlaybackError) {
  // error.reason: "unknown-sound" | "audio-unavailable" | "sample-load-failed"
  //             | "sample-decode-failed" | "playback-failed"
  console.warn(`[sounds] ${error.sound}: ${error.reason}`, error.cause);
}

export function Root({ children }: { children: React.ReactNode }) {
  return <SoundProvider onError={reportSoundError}>{children}</SoundProvider>;
}
```

All usesounds errors carry a machine-readable `code` (`"MISSING_SOUND_PROVIDER"`, `"INVALID_SOUND"`, `"SOUND_PLAYBACK_FAILED"`) and can be checked with `instanceof`. The library never writes to the console on its own.

## API reference

### `<SoundProvider>`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Whether sounds play at all. |
| `volume` | `number` | `1` | Master volume, `0`–`1`. |
| `respectReducedMotion` | `boolean` | `true` | Mute under `prefers-reduced-motion: reduce`. |
| `sounds` | `Record<string, SoundDefinition>` | — | Extra synthesized sounds or samples. Keep the object stable. |
| `declarative` | `boolean` | `true` | Play `data-sound` attributes. When `false`, only unlocks audio on gestures. |
| `onError` | `(error: SoundPlaybackError) => void` | — | Receives playback/loading failures. Can change between renders. |
| `audioContextFactory` | `() => AudioContext` | `() => new AudioContext()` | Creates the context (e.g. to share one). Only read on mount. |
| `children` | `ReactNode` | — | |

The engine is created on first render without touching browser APIs, released on unmount, and works under `<StrictMode>`.

### `useSound(name, options?) => play`

| Parameter | Type | Description |
| --- | --- | --- |
| `name` | `SoundName` | Preset or registered sound. |
| `options` | `SoundPlayOptions` (`{ volume?, pitch? }`) | Defaults for every play. |
| returns | `PlaySound` (`(overrides?: SoundPlayOptions) => void`) | Stable play function. |

### `useSoundEngine() => SoundEngine`

Returns the closest provider's engine. See the [`SoundEngine` reference](https://www.npmjs.com/package/@usesounds/core#soundengine).

### Exports

- **Components and hooks:** `SoundProvider`, `useSound`, `useSoundEngine`
- **Values re-exported from core:** `presetNames`
- **Errors:** `MissingSoundProviderError`, `UsesoundsError`, `InvalidSoundError`, `SoundPlaybackError`
- **Types:** `SoundProviderProps`, `PlaySound`, `SoundPlayOptions`, `SoundName`, `PresetName`, `SoundDefinition`, `SynthSound`, `SynthVoice`, `SynthToneVoice`, `SynthNoiseVoice`, `SynthWaveform`, `SampleSound`, `SoundPlaybackReason`, `UsesoundsErrorCode`

## License

[ISC](https://github.com/SebastianUrdaneguiBisalaya/usesounds/blob/main/LICENSE)
