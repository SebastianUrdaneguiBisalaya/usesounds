# @usesounds/core

**Framework-agnostic engine for tiny, synthesized UI sounds**, built on the Web Audio API. It has zero dependencies, needs no audio files, and is SSR-safe.

[![npm version](https://img.shields.io/npm/v/@usesounds/core)](https://www.npmjs.com/package/@usesounds/core)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/@usesounds/core)](https://bundlephobia.com/package/@usesounds/core)
[![types](https://img.shields.io/npm/types/@usesounds/core)](https://www.npmjs.com/package/@usesounds/core)
[![license](https://img.shields.io/npm/l/@usesounds/core)](https://github.com/SebastianUrdaneguiBisalaya/usesounds/blob/main/LICENSE)

This is the core of [usesounds](https://github.com/SebastianUrdaneguiBisalaya/usesounds). **Using React? Install [`@usesounds/react`](https://www.npmjs.com/package/@usesounds/react)**, which wraps this package in a provider and hooks. Use `@usesounds/core` directly with vanilla JS or any other framework.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Key concepts](#key-concepts)
- [Built-in presets](#built-in-presets)
- [Playing sounds](#playing-sounds)
- [Declarative `data-sound`](#declarative-data-sound)
- [Custom synthesized sounds](#custom-synthesized-sounds)
- [Samples (audio files)](#samples-audio-files)
- [Muting, volume and reduced motion](#muting-volume-and-reduced-motion)
- [Autoplay policy and unlocking](#autoplay-policy-and-unlocking)
- [SSR](#ssr)
- [Content Security Policy](#content-security-policy)
- [Error handling](#error-handling)
- [API reference](#api-reference)

## Installation

```bash
# npm
npm install @usesounds/core

# pnpm
pnpm add @usesounds/core

# Yarn
yarn add @usesounds/core

# Bun
bun add @usesounds/core
```

It ships ESM and CommonJS builds with TypeScript types. It runs in browsers and in the Electron renderer process.

## Quick start

```ts
import { createSoundEngine } from "@usesounds/core";

const engine = createSoundEngine({ volume: 0.4 });

// Declarative: every element with data-sound="…" in the document plays on activation.
const unbind = engine.bindDeclarative();

// Imperative: play from your own code.
document.querySelector("#save")?.addEventListener("click", () => {
  engine.play("success");
});

// Later, to clean up:
unbind();
engine.dispose();
```

```html
<button data-sound="tick">Save</button>
<button data-sound="pop">Open menu</button>
```

## Key concepts

| Term | Meaning |
| --- | --- |
| **Engine** | The object returned by `createSoundEngine()`. It owns everything audio-related: the `AudioContext`, the registry of sounds, master volume and mute, sample loading and caching, and the `data-sound` listeners. Create one per app and share it. Creating an engine is cheap and touches no browser API. |
| **`AudioContext`** | The Web Audio object that produces sound. The engine creates it **lazily**, on the first `unlock()`, `play()` or `preload()`. Importing the package or creating an engine never creates one. |
| **Unlock** | Browsers keep audio suspended until a user gesture (*autoplay policy*). Unlocking creates or resumes the `AudioContext` inside a `pointerdown`/`keydown` handler. `bindDeclarative()` and `bindUnlock()` do it automatically. |
| **Preset** | A built-in synthesized sound (`tick`, `pop`, `tap`, `toggle`, `success`, `error`). |
| **Synthesized sound** (`SynthSound`) | Plain data describing one or more voices. It is rendered by oscillators and noise each time it plays, so there is nothing to download. |
| **Voice** (`SynthVoice`) | One layer of a synthesized sound: a waveform, a frequency (optionally gliding to `frequencyEnd`), and a short volume envelope. |
| **Envelope** | How a voice's volume evolves: it rises over `attack` seconds, then decays to silence by the end of `duration`. Short envelopes keep UI sounds crisp and click-free. |
| **Sample** (`SampleSound`) | An audio file registered by URL or `ArrayBuffer`. It is fetched once, decoded into an `AudioBuffer`, cached, and played instantly afterwards. |
| **Bindings** | `bindDeclarative()` and `bindUnlock()` attach delegated listeners to a DOM root and return an `unbind()` function. Listeners are never installed as an import side effect, only when you call a bind method. Removing them is a single call, which matters for SPAs, micro-frontends and tests. |
| **Master volume** | The engine-wide volume (`0`–`1`). A per-play `volume` is multiplied by it. |

## Built-in presets

All presets are synthesized; none of them use audio files.

| Name | Sound | Use for |
| --- | --- | --- |
| `tick` | A very short, crisp, high tick, subtle enough for every click. | Generic buttons, menu items, list selection, keyboard shortcuts. |
| `pop` | A soft, bubbly pop that glides upward. | Opening popovers/menus, adding items, revealing content. |
| `tap` | A muted, low tap, like a fingertip on a surface. | Secondary actions, tabs, chips, drag-and-drop drops. |
| `toggle` | A two-step "click-clack", the second blip higher. | Switches, checkboxes, segmented controls, on/off settings. |
| `success` | A short, bright rising major arpeggio. | Completed actions: saved, sent, copied, uploaded. |
| `error` | A low, gentle descending "uh-oh". | Failed actions, validation errors, rejected input. |

The list is exported, so you can enumerate it (for example, to build a settings preview):

```ts
import { presetNames, presets, type PresetName } from "@usesounds/core";

presetNames; // readonly ["tick", "pop", "tap", "toggle", "success", "error"]
const tickDefinition = presets.tick; // the SynthSound data behind "tick"
const name: PresetName = "toggle";
```

## Playing sounds

```ts
engine.play("tick");
engine.play("tick", { volume: 0.5 }); // 0–1, multiplied by the master volume
engine.play("pop", { pitch: 1.5 }); // 2 = one octave up, 0.5 = one octave down
```

`play()` **never throws** and returns nothing. It silently does nothing when the engine is disabled, on the server, at volume `0`, or when reduced motion applies. Real failures (unknown name, audio blocked, a sample that failed to load) are reported to [`onError`](#error-handling).

The `name` parameter is typed as `SoundName`: editors autocomplete the preset names, and any custom registered name still type-checks.

## Declarative `data-sound`

```ts
const unbind = engine.bindDeclarative(); // listens on `document`
```

```html
<button data-sound="tick">Save</button>
<button data-sound="pop" data-sound-volume="0.5">Open</button>
<button data-sound="tick" data-sound-pitch="1.25">Next</button>
<a href="/settings" data-sound="tap">Settings</a>
<div role="switch" tabindex="0" aria-checked="false" data-sound="toggle">Dark mode</div>
```

What triggers a sound:

- **Pointer:** `pointerdown` with the primary button, on the closest `[data-sound]` ancestor of the target. It fires on press rather than release, so it feels instant.
- **Keyboard:** `Enter` on a focused `[data-sound]` element. `Space` on buttons, on elements with `role="button" | "switch" | "checkbox" | "radio"`, and on checkbox, radio and button inputs. Key repeats are ignored. The element must be focusable (native control or `tabindex`) to receive keys.
- **Not triggered** for disabled elements: `:disabled`, anything inside `fieldset[disabled]`, or `aria-disabled="true"`.
- **Per-element overrides:** `data-sound-volume` and `data-sound-pitch`.
- **Every gesture also unlocks audio**, so later imperative `play()` calls work immediately.

Only **one set of delegated listeners** exists per root, no matter how many elements or engines use it. If several engines bind the same root, the one with the highest `priority` plays, and among equal priorities the most recently bound one. `@usesounds/react` uses this so the innermost provider wins.

```ts
// Scope to a subtree, with a higher priority than the document-level binding.
const panel = document.querySelector("#panel");
if (panel) {
  engine.bindDeclarative(panel, { priority: 1 });
}
```

If you only play sounds from code but still want automatic unlocking, use `bindUnlock()`:

```ts
const unbind = engine.bindUnlock(); // unlocks on every pointer/keyboard gesture
```

## Custom synthesized sounds

A synthesized sound is plain data: a list of voices that play together.

```ts
import { createSoundEngine, type SynthSound } from "@usesounds/core";

const chirp: SynthSound = {
  voices: [
    // A sine that glides from 900 Hz to 1600 Hz in 60 ms.
    { waveform: "sine", frequency: 900, frequencyEnd: 1600, duration: 0.06, gain: 0.5 },
    // A tiny band-passed noise click, 10 ms after the start.
    { waveform: "noise", frequency: 5000, q: 2, delay: 0.01, duration: 0.01, gain: 0.15 },
  ],
};

const engine = createSoundEngine({ sounds: { chirp } });
engine.register("bloop", {
  voices: [{ waveform: "triangle", frequency: 440, duration: 0.12 }],
});

engine.play("chirp");
engine.play("bloop");
```

Voice fields (times in seconds, frequencies in Hz):

| Field | Applies to | Default | Description |
| --- | --- | --- | --- |
| `waveform` | all | — (required) | `"sine"`, `"square"`, `"sawtooth"`, `"triangle"` or `"noise"`. |
| `duration` | all | — (required) | Total length, attack included. Must be positive. |
| `frequency` | tones (required), noise (optional) | — | Tone pitch, or the band-pass center for noise. Omit it on noise for unfiltered noise. |
| `frequencyEnd` | all | — | Frequency reached at the end (exponential glide). Requires `frequency`. |
| `attack` | all | `0.002` | Fade-in time to the peak. |
| `delay` | all | `0` | Offset from the start of the sound. |
| `gain` | all | `1` | Peak volume of this voice, `0`–`1`. |
| `q` | noise | `1` | Band-pass quality factor (higher = narrower). |

Definitions are validated when registered. An invalid one throws `InvalidSoundError` with a message that names the bad field (for example `voices[0].duration must be a positive number of seconds`). Registering a preset name (e.g. `"tick"`) replaces the built-in.

## Samples (audio files)

v1 ships no audio files, but you can register your own short `.wav`, `.mp3`, `.m4a`… (any format the browser can decode):

```ts
const engine = createSoundEngine({
  sounds: {
    chime: { type: "sample", src: "/sounds/chime.mp3" },
  },
});

// From bytes you already have (bundled asset, IndexedDB, Electron file read…)
declare const bytes: ArrayBuffer;
engine.register("whoosh", { type: "sample", src: bytes });
```

How samples behave:

- **Loaded once, cached.** A URL is downloaded with `fetch`, decoded with `decodeAudioData`, and kept as an `AudioBuffer`. An `ArrayBuffer` is copied before decoding, so your buffer is never detached.
- **Loading starts on unlock.** Registered samples start loading on the first user gesture, or immediately if the `AudioContext` already exists.
- **Never played late.** If you call `play()` before a sample is decoded, that play is **skipped** (a late sound feels like a bug) and loading starts. Use `preload()` to have it ready:

```ts
await engine.preload(["chime"]); // or engine.preload() for every sample
engine.play("chime"); // plays immediately
```

`preload()` never rejects; failures go to `onError`. It retries samples that failed before. It creates the `AudioContext` if needed. Before a user gesture, that context starts suspended, which is fine for decoding.

## Muting, volume and reduced motion

```ts
const engine = createSoundEngine({
  enabled: settings.uiSounds, // global on/off (default true)
  volume: 0.4, // master volume 0–1 (default 1)
  respectReducedMotion: true, // mute under prefers-reduced-motion (default true)
});

engine.setEnabled(false); // bind to a user setting
engine.setVolume(0.2);
engine.setRespectReducedMotion(false); // e.g. the user opted in explicitly
```

- **Always offer a way to turn sounds off.** Bind `enabled` / `setEnabled` to an app setting.
- **Reduced motion:** by default the engine stays silent while the user has `prefers-reduced-motion: reduce` set. The media query is checked on every play, so changes apply right away.
- **Sounds are feedback only.** Never make a sound the only way something is communicated.

## Autoplay policy and unlocking

Browsers only allow audio after the user interacts with the page. The engine handles this for you:

1. The `AudioContext` is created lazily, never at import or construction time.
2. `bindDeclarative()` / `bindUnlock()` call `unlock()` on every `pointerdown`/`keydown`, so the first gesture resumes audio.
3. A sound requested while the context is still resuming plays only if the resume completes quickly. Otherwise it is dropped, so you never get a burst of stale sounds.

Without any binding, call `engine.unlock()` yourself from a gesture handler.

## SSR

The package is safe to import and run on a server (Next.js, Remix, Astro, …):

- Importing it has **no side effects** (`"sideEffects": false` is accurate): no `AudioContext`, no `window`/`document` access, no listeners.
- On the server every method is a **silent no-op**: `play()` does nothing, `preload()`/`unlock()` resolve, and `bindDeclarative()` returns a no-op `unbind`.

## Content Security Policy

- **Synthesized sounds** (presets and custom `SynthSound`s) need **no CSP changes**.
- **Samples by URL** are downloaded with `fetch`, so their origin must be allowed by **`connect-src`** (not `media-src`: no media elements are used). Cross-origin URLs also need CORS headers.
- **Samples from an `ArrayBuffer`** need no CSP changes.

```http
Content-Security-Policy: connect-src 'self' https://cdn.example.com
```

## Error handling

usesounds separates **programmer errors** (thrown at setup) from **runtime failures** (reported, never thrown):

| Error | When | Thrown? |
| --- | --- | --- |
| `InvalidSoundError` (`code: "INVALID_SOUND"`) | Invalid name or definition passed to `createSoundEngine({ sounds })` or `register()`. | Yes, fix the call site. |
| `SoundPlaybackError` (`code: "SOUND_PLAYBACK_FAILED"`) | A sound couldn't play or a sample couldn't load. | No, passed to `onError`. |

Both extend `UsesoundsError`, so you can check `instanceof` or the `code`.

```ts
import { createSoundEngine, InvalidSoundError } from "@usesounds/core";

const engine = createSoundEngine({
  onError(error) {
    // error is a SoundPlaybackError
    console.warn(`[sounds] ${error.sound}: ${error.reason}`, error.cause);
  },
});

try {
  engine.register("broken", { voices: [] });
} catch (error) {
  if (error instanceof InvalidSoundError) {
    error.sound; // "broken"
    error.message; // 'Invalid sound "broken": `voices` must contain at least one voice'
  }
}
```

`SoundPlaybackError.reason` is one of:

| Reason | Meaning |
| --- | --- |
| `"unknown-sound"` | No preset or registered sound has that name. |
| `"audio-unavailable"` | The `AudioContext` couldn't be created or resumed (unsupported, blocked, closed). |
| `"sample-load-failed"` | The sample couldn't be fetched (network, HTTP status, CSP `connect-src`, CORS). |
| `"sample-decode-failed"` | The bytes were fetched but the browser couldn't decode them. |
| `"playback-failed"` | Anything else (e.g. an invalid `pitch`). |

The original failure, if any, is available as `error.cause`. The library never writes to the console on its own.

## API reference

### `createSoundEngine(options?)`

Creates a [`SoundEngine`](#soundengine). Throws `InvalidSoundError` if `options.sounds` contains an invalid definition.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Whether sounds play at all. |
| `volume` | `number` | `1` | Master volume, `0`–`1`. |
| `respectReducedMotion` | `boolean` | `true` | Mute under `prefers-reduced-motion: reduce`. |
| `sounds` | `Record<string, SoundDefinition>` | — | Extra sounds (synth or samples). They can override presets. |
| `audioContextFactory` | `() => AudioContext` | `() => new AudioContext()` | Creates the context lazily. Use it to share an existing context or inject a fake in tests. Contexts from a custom factory are never closed by the engine. |
| `onError` | `(error: SoundPlaybackError) => void` | — | Receives playback and loading failures. |

### `SoundEngine`

| Method | Description |
| --- | --- |
| `play(name, options?)` | Plays a sound. `options`: `{ volume?, pitch? }`. Never throws. |
| `register(name, sound)` | Adds or replaces a sound. Throws `InvalidSoundError` if invalid. |
| `unregister(name)` | Removes a sound (presets included) and its cached sample. Returns `true` if it existed. |
| `has(name)` | Whether a sound is registered. |
| `names()` | Every registered name (presets + custom). |
| `preload(names?)` | Loads and decodes samples now. Resolves when all have settled and never rejects. |
| `unlock()` | Creates/resumes the `AudioContext` and starts loading samples. Call it from a gesture. Never rejects. |
| `setEnabled(enabled)` | Mutes or unmutes everything. |
| `setVolume(volume)` | Sets the master volume. |
| `setRespectReducedMotion(respect)` | Toggles reduced-motion muting. |
| `bindDeclarative(root?, { priority? })` | Enables `data-sound` under `root` (default `document`). Returns `unbind()`. |
| `bindUnlock(root?)` | Unlocks audio on gestures under `root`, without `data-sound` playback. Returns `unbind()`. |
| `dispose()` | Releases audio resources (closes the context it created). The engine stays usable, and decoded samples stay cached. |

### Exports

- **Functions and values:** `createSoundEngine`, `presets`, `presetNames`
- **Errors:** `UsesoundsError`, `InvalidSoundError`, `SoundPlaybackError`
- **Types:** `SoundEngine`, `SoundEngineOptions`, `SoundPlayOptions`, `SoundName`, `PresetName`, `SoundDefinition`, `SynthSound`, `SynthVoice`, `SynthToneVoice`, `SynthNoiseVoice`, `SynthWaveform`, `SampleSound`, `DeclarativeRoot`, `DeclarativeBindingOptions`, `UsesoundsErrorCode`, `UsesoundsErrorOptions`, `SoundPlaybackReason`, `SoundPlaybackErrorOptions`

## License

[ISC](https://github.com/SebastianUrdaneguiBisalaya/usesounds/blob/main/LICENSE)
