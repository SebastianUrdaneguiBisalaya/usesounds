import type { SynthSound } from "./synth.js";

/** Names of the built-in presets, in a stable order. */
export const presetNames = [
  "tick",
  "pop",
  "tap",
  "toggle",
  "success",
  "error",
] as const;

/** Name of a built-in preset: `"tick" | "pop" | "tap" | "toggle" | "success" | "error"`. */
export type PresetName = (typeof presetNames)[number];

/**
 * Name of a sound: a built-in preset or any custom registered name.
 *
 * Editors autocomplete the preset names while any string still type-checks.
 */
export type SoundName = PresetName | (string & {});

/**
 * A very short, crisp, high "tick": a quick downward sine chirp with a tiny
 * band-passed noise transient. Subtle enough to play on every click.
 *
 * Use for: generic buttons, menu items, list selection, keyboard shortcuts.
 */
const tick: SynthSound = {
  voices: [
    {
      attack: 0.001,
      duration: 0.025,
      frequency: 1800,
      frequencyEnd: 1200,
      gain: 0.5,
      waveform: "sine",
    },
    {
      attack: 0.0005,
      duration: 0.008,
      frequency: 6000,
      gain: 0.2,
      q: 1.5,
      waveform: "noise",
    },
  ],
};

/**
 * A soft, bubbly "pop": a short sine that glides upward.
 *
 * Use for: opening popovers/menus, adding items, revealing content.
 */
const pop: SynthSound = {
  voices: [
    {
      attack: 0.003,
      duration: 0.06,
      frequency: 400,
      frequencyEnd: 900,
      gain: 0.6,
      waveform: "sine",
    },
  ],
};

/**
 * A muted, low "tap", like a fingertip on a surface: a falling triangle tone
 * with a short noise thud.
 *
 * Use for: secondary actions, tabs, chips, drag-and-drop drops.
 */
const tap: SynthSound = {
  voices: [
    {
      attack: 0.001,
      duration: 0.04,
      frequency: 220,
      frequencyEnd: 140,
      gain: 0.6,
      waveform: "triangle",
    },
    {
      attack: 0.0005,
      duration: 0.015,
      frequency: 1500,
      gain: 0.15,
      q: 0.8,
      waveform: "noise",
    },
  ],
};

/**
 * A two-step "click-clack": two quick sine blips, the second one higher.
 *
 * Use for: switches, checkboxes, segmented controls, on/off settings.
 */
const toggle: SynthSound = {
  voices: [
    {
      attack: 0.001,
      duration: 0.025,
      frequency: 900,
      gain: 0.45,
      waveform: "sine",
    },
    {
      attack: 0.001,
      delay: 0.04,
      duration: 0.03,
      frequency: 1350,
      gain: 0.45,
      waveform: "sine",
    },
  ],
};

/**
 * A short, bright rising arpeggio (E5 – G♯5 – B5, a major triad).
 *
 * Use for: completed actions — saved, sent, copied, uploaded.
 */
const success: SynthSound = {
  voices: [
    {
      attack: 0.004,
      duration: 0.12,
      frequency: 659.25,
      gain: 0.4,
      waveform: "sine",
    },
    {
      attack: 0.004,
      delay: 0.07,
      duration: 0.12,
      frequency: 830.61,
      gain: 0.4,
      waveform: "sine",
    },
    {
      attack: 0.004,
      delay: 0.14,
      duration: 0.2,
      frequency: 987.77,
      gain: 0.4,
      waveform: "sine",
    },
  ],
};

/**
 * A low, gentle descending two-note "uh-oh" (E4 – B3) with a soft triangle
 * timbre. Noticeable without being harsh.
 *
 * Use for: failed actions, validation errors, rejected input.
 */
const error: SynthSound = {
  voices: [
    {
      attack: 0.004,
      duration: 0.12,
      frequency: 329.63,
      frequencyEnd: 311.13,
      gain: 0.5,
      waveform: "triangle",
    },
    {
      attack: 0.004,
      delay: 0.1,
      duration: 0.18,
      frequency: 246.94,
      frequencyEnd: 233.08,
      gain: 0.5,
      waveform: "triangle",
    },
  ],
};

/**
 * The built-in synthesized presets, keyed by name. Plain data: no audio files.
 *
 * - `tick` — crisp, very short click for generic buttons.
 * - `pop` — soft upward bubble for opening/adding.
 * - `tap` — muted low tap for secondary actions.
 * - `toggle` — two-step click for switches and checkboxes.
 * - `success` — bright rising arpeggio for completed actions.
 * - `error` — gentle descending two notes for failures.
 *
 * @example
 * ```ts
 * for (const name of presetNames) {
 *   console.log(name, presets[name].voices.length);
 * }
 * ```
 */
export const presets: { readonly [Name in PresetName]: SynthSound } = {
  error,
  pop,
  success,
  tap,
  tick,
  toggle,
};
