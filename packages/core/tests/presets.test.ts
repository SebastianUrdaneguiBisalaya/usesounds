import { describe, expect, it } from "bun:test";
import {
  type PresetName,
  presetNames,
  presets,
  type SoundName,
} from "../src/index.js";
import { playSynth, type SynthVoice } from "../src/synth.js";
import { createFakeAudioContext } from "./fake-audio-context.js";

const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;

function frequenciesOf(voice: SynthVoice): number[] {
  return [
    voice.frequency,
    voice.frequencyEnd,
  ].filter((value): value is number => value !== undefined);
}

describe("presetNames", () => {
  it("lists exactly the v1 presets", () => {
    expect([
      ...presetNames,
    ]).toEqual([
      "tick",
      "pop",
      "tap",
      "toggle",
      "success",
      "error",
    ]);
  });

  it("matches the keys of presets", () => {
    const names: string[] = [
      ...presetNames,
    ];
    expect(names.sort()).toEqual(Object.keys(presets).sort());
  });

  it("has no duplicates", () => {
    expect(new Set(presetNames).size).toBe(presetNames.length);
  });
});

describe.each([
  ...presetNames,
])("preset %s", (name: PresetName) => {
  const sound = presets[name];

  it("has at least one voice", () => {
    expect(sound.voices.length).toBeGreaterThan(0);
  });

  it("has positive durations and valid timing", () => {
    for (const voice of sound.voices) {
      expect(voice.duration).toBeGreaterThan(0);
      expect(voice.delay ?? 0).toBeGreaterThanOrEqual(0);
      expect(voice.attack ?? 0).toBeGreaterThanOrEqual(0);
      expect(voice.attack ?? 0).toBeLessThanOrEqual(voice.duration);
    }
  });

  it("uses audible frequencies", () => {
    for (const voice of sound.voices) {
      for (const frequency of frequenciesOf(voice)) {
        expect(frequency).toBeGreaterThanOrEqual(MIN_FREQUENCY);
        expect(frequency).toBeLessThanOrEqual(MAX_FREQUENCY);
      }
    }
  });

  it("uses gains in (0, 1]", () => {
    for (const voice of sound.voices) {
      expect(voice.gain ?? 1).toBeGreaterThan(0);
      expect(voice.gain ?? 1).toBeLessThanOrEqual(1);
    }
  });

  it("is shorter than 1 second in total", () => {
    const end = Math.max(
      ...sound.voices.map((voice) => (voice.delay ?? 0) + voice.duration),
    );
    expect(end).toBeLessThan(1);
  });

  it("plays and cleans up on an AudioContext", () => {
    const ctx = createFakeAudioContext();
    const real = ctx.asReal();

    playSynth(real, real.destination, sound, {
      pitch: 1,
      volume: 1,
    });

    expect(ctx.nodesOf("gain")).toHaveLength(sound.voices.length);
    ctx.endAll();
    expect(ctx.connections.size).toBe(0);
  });
});

describe("SoundName", () => {
  it("accepts preset names and custom names", () => {
    const names: SoundName[] = [
      "tick",
      "chime",
    ];
    expect(names).toHaveLength(2);
  });
});
