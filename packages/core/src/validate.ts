import { InvalidSoundError } from "./errors.js";
import type { SynthSound, SynthWaveform } from "./synth.js";

const WAVEFORMS: readonly SynthWaveform[] = [
  "sine",
  "square",
  "sawtooth",
  "triangle",
  "noise",
];

/** A voice-shaped object whose fields haven't been checked yet. */
type UncheckedVoice = {
  waveform?: unknown;
  frequency?: unknown;
  frequencyEnd?: unknown;
  q?: unknown;
  delay?: unknown;
  attack?: unknown;
  duration?: unknown;
  gain?: unknown;
};

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Throws {@link InvalidSoundError} unless `name` is a non-empty string. */
export function assertValidName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new InvalidSoundError(
      String(name),
      "name must be a non-empty string",
    );
  }
}

/** Returns why `voice` is invalid, or `undefined` if it's valid. */
function checkVoice(voice: unknown, at: string): string | undefined {
  if (!isObject(voice)) {
    return `${at} must be an object`;
  }
  const v = voice as UncheckedVoice;

  if (!WAVEFORMS.includes(v.waveform as SynthWaveform)) {
    return `${at}.waveform must be one of ${WAVEFORMS.join(", ")}`;
  }
  if (!isFiniteNumber(v.duration) || v.duration <= 0) {
    return `${at}.duration must be a positive number of seconds`;
  }
  if (v.frequency === undefined) {
    if (v.waveform !== "noise") {
      return `${at}.frequency is required for "${String(v.waveform)}" voices`;
    }
    if (v.frequencyEnd !== undefined) {
      return `${at}.frequencyEnd requires frequency`;
    }
  }

  const positive = {
    frequency: v.frequency,
    frequencyEnd: v.frequencyEnd,
    q: v.q,
  };
  for (const [key, value] of Object.entries(positive)) {
    if (value !== undefined && (!isFiniteNumber(value) || value <= 0)) {
      return `${at}.${key} must be a positive number`;
    }
  }

  const nonNegative = {
    attack: v.attack,
    delay: v.delay,
  };
  for (const [key, value] of Object.entries(nonNegative)) {
    if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
      return `${at}.${key} must be a non-negative number of seconds`;
    }
  }

  if (
    v.gain !== undefined &&
    (!isFiniteNumber(v.gain) || v.gain < 0 || v.gain > 1)
  ) {
    return `${at}.gain must be a number from 0 to 1`;
  }
  return undefined;
}

/**
 * Throws {@link InvalidSoundError} unless `sound` is a well-formed
 * {@link SynthSound}. Checks the runtime shape, since definitions may come
 * from untyped code or JSON.
 */
export function assertValidSynthSound(
  name: string,
  sound: unknown,
): asserts sound is SynthSound {
  const voices = isObject(sound)
    ? (
        sound as {
          voices?: unknown;
        }
      ).voices
    : undefined;
  if (!Array.isArray(voices)) {
    throw new InvalidSoundError(
      name,
      "definition must be an object with a `voices` array",
    );
  }
  if (voices.length === 0) {
    throw new InvalidSoundError(
      name,
      "`voices` must contain at least one voice",
    );
  }
  for (const [index, voice] of voices.entries()) {
    const reason = checkVoice(voice, `voices[${index}]`);
    if (reason !== undefined) {
      throw new InvalidSoundError(name, reason);
    }
  }
}
