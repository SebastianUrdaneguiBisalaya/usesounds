import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  createSoundEngine,
  InvalidSoundError,
  type SoundEngineOptions,
  SoundPlaybackError,
  type SynthSound,
} from "../src/index.js";
import {
  createFakeAudioContext,
  type FakeAudioContext,
  type FakeAudioContextState,
  type FakeAudioNode,
} from "./fake-audio-context.js";
import { restoreGlobals, setGlobal, setReducedMotion } from "./globals.js";

const chime: SynthSound = {
  voices: [
    {
      duration: 0.1,
      frequency: 1000,
      gain: 0.5,
      waveform: "sine",
    },
  ],
};

type Harness = {
  contexts: FakeAudioContext[];
  errors: SoundPlaybackError[];
  options: SoundEngineOptions;
  /** The most recently created fake context. */
  ctx(): FakeAudioContext;
};

function harness(
  overrides: SoundEngineOptions = {},
  state: FakeAudioContextState = "running",
): Harness {
  const contexts: FakeAudioContext[] = [];
  const errors: SoundPlaybackError[] = [];
  return {
    contexts,
    ctx() {
      const last = contexts.at(-1);
      if (last === undefined) {
        throw new Error("no AudioContext was created");
      }
      return last;
    },
    errors,
    options: {
      audioContextFactory() {
        const ctx = createFakeAudioContext({
          state,
        });
        contexts.push(ctx);
        return ctx.asReal();
      },
      onError(error) {
        errors.push(error);
      },
      ...overrides,
    },
  };
}

/** The engine's master gain: the first gain node, wired to the destination. */
function master(ctx: FakeAudioContext): FakeAudioNode {
  const node = ctx.nodesOf("gain")[0];
  if (node === undefined) {
    throw new Error("no master gain");
  }
  return node;
}

/** Voice gains (every gain except the master). */
function voiceGains(ctx: FakeAudioContext): FakeAudioNode[] {
  return ctx.nodesOf("gain").slice(1);
}

function isConnected(
  ctx: FakeAudioContext,
  from: FakeAudioNode,
  to: FakeAudioNode,
): boolean {
  return [
    ...ctx.connections,
  ].some(([a, b]) => a === from && b === to);
}

/** Peak value of a voice gain envelope. */
function peakOf(gain: FakeAudioNode | undefined): number | undefined {
  return gain?.gain?.calls[1]?.value;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  setReducedMotion(false);
});

afterEach(() => {
  restoreGlobals();
});

describe("createSoundEngine: lazy creation", () => {
  it("touches no browser API when created", () => {
    const h = harness();
    createSoundEngine(h.options);
    expect(h.contexts).toHaveLength(0);
  });

  it("can be created on the server (no window)", () => {
    setGlobal("window");
    const h = harness();
    const engine = createSoundEngine(h.options);

    engine.play("tick");
    expect(h.contexts).toHaveLength(0);
    expect(h.errors).toHaveLength(0);
  });

  it("creates one context and master gain on the first play", () => {
    const h = harness({
      volume: 0.4,
    });
    const engine = createSoundEngine(h.options);

    engine.play("tick");
    engine.play("pop");

    expect(h.contexts).toHaveLength(1);
    const ctx = h.ctx();
    expect(master(ctx).gain?.value).toBe(0.4);
    expect(isConnected(ctx, master(ctx), ctx.destination)).toBe(true);
  });

  it("routes every voice through the master gain", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);

    engine.play("tick");

    const ctx = h.ctx();
    const voices = voiceGains(ctx);
    expect(voices.length).toBeGreaterThan(0);
    for (const gain of voices) {
      expect(isConnected(ctx, gain, master(ctx))).toBe(true);
      expect(isConnected(ctx, gain, ctx.destination)).toBe(false);
    }
  });

  it("unlock() creates the context and resumes it when suspended", async () => {
    const h = harness({}, "suspended");
    const engine = createSoundEngine(h.options);

    await engine.unlock();

    expect(h.contexts).toHaveLength(1);
    expect(h.ctx().resumeCalls).toBe(1);
    expect(h.ctx().state).toBe("running");

    await engine.unlock();
    expect(h.contexts).toHaveLength(1);
    expect(h.ctx().resumeCalls).toBe(1);
  });

  it("unlock() is a no-op when disabled or on the server", async () => {
    const h = harness({
      enabled: false,
    });
    await createSoundEngine(h.options).unlock();
    expect(h.contexts).toHaveLength(0);

    setGlobal("window");
    const h2 = harness();
    await createSoundEngine(h2.options).unlock();
    expect(h2.contexts).toHaveLength(0);
  });

  it("unlock() never rejects", async () => {
    const engine = createSoundEngine({
      audioContextFactory() {
        throw new Error("blocked");
      },
    });
    await expect(engine.unlock()).resolves.toBeUndefined();

    const h = harness({}, "suspended");
    const engine2 = createSoundEngine(h.options);
    await engine2.unlock();
    const ctx = h.ctx();
    ctx.state = "suspended";
    ctx.resumeBehavior = "reject";
    await expect(engine2.unlock()).resolves.toBeUndefined();
  });

  it("uses `new AudioContext()` by default", () => {
    const contexts: FakeAudioContext[] = [];
    setGlobal("AudioContext", function FakeAudioContextConstructor() {
      const ctx = createFakeAudioContext();
      contexts.push(ctx);
      return ctx;
    });
    const engine = createSoundEngine();

    engine.play("tick");
    expect(contexts).toHaveLength(1);
  });
});

describe("createSoundEngine: suspended contexts", () => {
  it("resumes a suspended context, then plays", async () => {
    const h = harness({}, "suspended");
    const engine = createSoundEngine(h.options);

    engine.play("tick");
    expect(h.ctx().resumeCalls).toBe(1);
    expect(h.ctx().nodesOf("oscillator")).toHaveLength(0);

    await flush();
    expect(h.ctx().nodesOf("oscillator").length).toBeGreaterThan(0);
  });

  it("drops the sound if resume settles too late (no stale bursts)", async () => {
    const h = harness({}, "suspended");
    const engine = createSoundEngine(h.options);
    const now = spyOn(Date, "now").mockReturnValue(1000);

    engine.play("tick");
    const ctx = h.ctx();
    expect(ctx.resumeCalls).toBe(1);

    now.mockReturnValue(5000);
    await flush();
    now.mockRestore();
    expect(ctx.nodesOf("oscillator")).toHaveLength(0);
  });

  it("drops the sound if resume is still pending past the window", async () => {
    const h = harness({}, "suspended");
    const engine = createSoundEngine(h.options);
    const now = spyOn(Date, "now").mockReturnValue(0);

    engine.play("tick");
    await flush();
    const ctx = h.ctx();
    ctx.resumeBehavior = "pending";
    // The first resume resolved promptly; make the next play wait.
    ctx.state = "suspended";
    engine.play("pop");
    now.mockReturnValue(10_000);
    ctx.settleResume();
    await flush();
    now.mockRestore();

    // Only "tick" (resumed promptly) played: one voice gain + master.
    expect(ctx.nodesOf("gain")).toHaveLength(1 + 2);
  });

  it("reports audio-unavailable when resume rejects", async () => {
    const h = harness({}, "suspended");
    const engine = createSoundEngine(h.options);

    engine.play("tick");
    await flush();
    const ctx = h.ctx();
    ctx.state = "suspended";
    ctx.resumeBehavior = "reject";

    engine.play("pop");
    await flush();

    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]?.reason).toBe("audio-unavailable");
    expect(h.errors[0]?.sound).toBe("pop");
    expect(h.errors[0]?.message).toBe(
      'Failed to play sound "pop": resume blocked',
    );
  });
});

describe("createSoundEngine: enabled", () => {
  it("plays nothing and creates no context when disabled", () => {
    const h = harness({
      enabled: false,
    });
    const engine = createSoundEngine(h.options);

    engine.play("tick");
    expect(h.contexts).toHaveLength(0);
  });

  it("can be toggled at runtime", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);

    engine.setEnabled(false);
    engine.play("tick");
    expect(h.contexts).toHaveLength(0);

    engine.setEnabled(true);
    engine.play("tick");
    expect(h.ctx().nodesOf("oscillator").length).toBeGreaterThan(0);
  });
});

describe("createSoundEngine: volume", () => {
  it("defaults the master volume to 1 and clamps the option", () => {
    const a = harness();
    createSoundEngine(a.options).play("tick");
    expect(master(a.ctx()).gain?.value).toBe(1);

    const b = harness({
      volume: 3,
    });
    createSoundEngine(b.options).play("tick");
    expect(master(b.ctx()).gain?.value).toBe(1);
  });

  it("setVolume updates the master gain immediately and clamps", () => {
    const h = harness({
      volume: 0.5,
    });
    const engine = createSoundEngine(h.options);
    engine.play("tick");
    const ctx = h.ctx();
    ctx.currentTime = 4;

    engine.setVolume(0.2);
    engine.setVolume(-1);
    engine.setVolume(Number.NaN);

    expect(master(ctx).gain?.calls).toEqual([
      {
        method: "setValueAtTime",
        time: 4,
        value: 0.2,
      },
      {
        method: "setValueAtTime",
        time: 4,
        value: 0,
      },
      {
        method: "setValueAtTime",
        time: 4,
        value: 0,
      },
    ]);
  });

  it("uses the volume set before the context existed", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);

    engine.setVolume(0.3);
    engine.play("tick");
    expect(master(h.ctx()).gain?.value).toBe(0.3);
  });

  it("plays nothing at master volume 0", () => {
    const h = harness({
      volume: 0,
    });
    createSoundEngine(h.options).play("tick");
    expect(h.contexts).toHaveLength(0);
  });

  it("applies per-sound volume and pitch overrides", () => {
    const h = harness({
      sounds: {
        chime,
      },
    });
    const engine = createSoundEngine(h.options);

    engine.play("chime", {
      pitch: 2,
      volume: 0.5,
    });

    const ctx = h.ctx();
    expect(peakOf(voiceGains(ctx)[0])).toBeCloseTo(0.25);
    expect(ctx.nodesOf("oscillator")[0]?.frequency?.calls[0]?.value).toBe(2000);
  });
});

describe("createSoundEngine: reduced motion", () => {
  it("mutes when prefers-reduced-motion is reduce", () => {
    setReducedMotion(true);
    const h = harness();
    createSoundEngine(h.options).play("tick");
    expect(h.contexts).toHaveLength(0);
  });

  it("plays anyway with respectReducedMotion: false", () => {
    setReducedMotion(true);
    const h = harness({
      respectReducedMotion: false,
    });
    createSoundEngine(h.options).play("tick");
    expect(h.contexts).toHaveLength(1);
  });

  it("follows runtime changes of the setting and the media query", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);

    setReducedMotion(true);
    engine.play("tick");
    expect(h.contexts).toHaveLength(0);

    engine.setRespectReducedMotion(false);
    engine.play("tick");
    expect(h.contexts).toHaveLength(1);

    engine.setRespectReducedMotion(true);
    setReducedMotion(false);
    engine.play("tick");
    expect(h.ctx().nodesOf("oscillator").length).toBeGreaterThan(1);
  });
});

describe("createSoundEngine: errors (play never throws)", () => {
  it("reports unknown sounds as unknown-sound", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);

    expect(() => engine.play("nope")).not.toThrow();

    expect(h.errors).toHaveLength(1);
    const [error] = h.errors;
    expect(error).toBeInstanceOf(SoundPlaybackError);
    expect(error?.code).toBe("SOUND_PLAYBACK_FAILED");
    expect(error?.reason).toBe("unknown-sound");
    expect(error?.sound).toBe("nope");
    expect(error?.message).toBe(
      'Failed to play sound "nope": no sound is registered with this name',
    );
  });

  it("reports a failing audioContextFactory as audio-unavailable", () => {
    const cause = new Error("NotAllowedError");
    const errors: SoundPlaybackError[] = [];
    const engine = createSoundEngine({
      audioContextFactory() {
        throw cause;
      },
      onError: (error) => errors.push(error),
    });

    engine.play("tick");

    expect(errors[0]?.reason).toBe("audio-unavailable");
    expect(errors[0]?.cause).toBe(cause);
  });

  it("reports a missing Web Audio API as audio-unavailable", () => {
    setGlobal("AudioContext");
    const errors: SoundPlaybackError[] = [];
    const engine = createSoundEngine({
      onError: (error) => errors.push(error),
    });

    engine.play("tick");

    expect(errors[0]?.reason).toBe("audio-unavailable");
    expect(errors[0]?.message).toBe(
      'Failed to play sound "tick": Web Audio API (AudioContext) is not supported',
    );
  });

  it("reports a closed context from the factory as audio-unavailable", () => {
    const h = harness({}, "closed");
    createSoundEngine(h.options).play("tick");
    expect(h.errors[0]?.reason).toBe("audio-unavailable");
  });

  it("reports an invalid pitch as playback-failed", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);

    engine.play("tick", {
      pitch: 0,
    });

    expect(h.errors[0]?.reason).toBe("playback-failed");
    expect(h.errors[0]?.cause).toBeInstanceOf(RangeError);
    expect(h.contexts).toHaveLength(0);
  });

  it("reports errors thrown while scheduling as playback-failed", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);
    engine.play("pop");
    const cause = new Error("InvalidStateError");
    h.ctx().createOscillator = () => {
      throw cause;
    };

    expect(() => engine.play("pop")).not.toThrow();
    expect(h.errors[0]?.reason).toBe("playback-failed");
    expect(h.errors[0]?.cause).toBe(cause);
  });

  it("swallows failures without onError", () => {
    const engine = createSoundEngine({
      audioContextFactory() {
        throw new Error("blocked");
      },
    });
    expect(() => engine.play("tick")).not.toThrow();
    expect(() => engine.play("nope")).not.toThrow();
  });

  it("never throws even if onError throws", () => {
    const engine = createSoundEngine({
      onError() {
        throw new Error("consumer bug");
      },
    });
    expect(() => engine.play("nope")).not.toThrow();
  });
});

describe("createSoundEngine: registry", () => {
  it("includes every preset by default", () => {
    const engine = createSoundEngine();
    expect(engine.names().sort()).toEqual(
      [
        "error",
        "pop",
        "success",
        "tap",
        "tick",
        "toggle",
      ].sort(),
    );
    expect(engine.has("tick")).toBe(true);
    expect(engine.has("chime")).toBe(false);
  });

  it("registers, plays, and unregisters custom sounds", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);

    engine.register("chime", chime);
    expect(engine.has("chime")).toBe(true);
    expect(engine.names()).toContain("chime");

    engine.play("chime");
    expect(h.ctx().nodesOf("oscillator")[0]?.frequency?.calls[0]?.value).toBe(
      1000,
    );

    expect(engine.unregister("chime")).toBe(true);
    expect(engine.unregister("chime")).toBe(false);
    engine.play("chime");
    expect(h.errors[0]?.reason).toBe("unknown-sound");
  });

  it("accepts extra sounds through options and lets them override presets", () => {
    const h = harness({
      sounds: {
        chime,
        tick: chime,
      },
    });
    const engine = createSoundEngine(h.options);

    expect(engine.has("chime")).toBe(true);
    engine.play("tick");
    expect(h.ctx().nodesOf("oscillator")[0]?.frequency?.calls[0]?.value).toBe(
      1000,
    );
  });

  it("can unregister presets", () => {
    const engine = createSoundEngine();
    expect(engine.unregister("tick")).toBe(true);
    expect(engine.has("tick")).toBe(false);
  });

  it("keeps registries of separate engines independent", () => {
    const a = createSoundEngine();
    const b = createSoundEngine();
    a.register("chime", chime);
    a.unregister("tick");
    expect(b.has("chime")).toBe(false);
    expect(b.has("tick")).toBe(true);
  });
});

describe("createSoundEngine: validation", () => {
  const invalid: [
    string,
    unknown,
    string,
  ][] = [
    [
      "not an object",
      42,
      "definition must be an object with a `voices` array",
    ],
    [
      "no voices",
      {
        voices: [],
      },
      "`voices` must contain at least one voice",
    ],
    [
      "voice not an object",
      {
        voices: [
          null,
        ],
      },
      "voices[0] must be an object",
    ],
    [
      "bad waveform",
      {
        voices: [
          {
            ...chime.voices[0],
            waveform: "piano",
          },
        ],
      },
      "voices[0].waveform must be one of sine, square, sawtooth, triangle, noise",
    ],
    [
      "zero duration",
      {
        voices: [
          {
            ...chime.voices[0],
            duration: 0,
          },
        ],
      },
      "voices[0].duration must be a positive number of seconds",
    ],
    [
      "missing tone frequency",
      {
        voices: [
          {
            duration: 0.1,
            waveform: "sine",
          },
        ],
      },
      'voices[0].frequency is required for "sine" voices',
    ],
    [
      "negative frequency",
      {
        voices: [
          {
            ...chime.voices[0],
            frequency: -1,
          },
        ],
      },
      "voices[0].frequency must be a positive number",
    ],
    [
      "NaN frequencyEnd",
      {
        voices: [
          {
            ...chime.voices[0],
            frequencyEnd: Number.NaN,
          },
        ],
      },
      "voices[0].frequencyEnd must be a positive number",
    ],
    [
      "noise glide without frequency",
      {
        voices: [
          {
            duration: 0.1,
            frequencyEnd: 200,
            waveform: "noise",
          },
        ],
      },
      "voices[0].frequencyEnd requires frequency",
    ],
    [
      "negative delay",
      {
        voices: [
          {
            ...chime.voices[0],
            delay: -0.1,
          },
        ],
      },
      "voices[0].delay must be a non-negative number of seconds",
    ],
    [
      "gain above 1",
      {
        voices: [
          {
            ...chime.voices[0],
            gain: 2,
          },
        ],
      },
      "voices[0].gain must be a number from 0 to 1",
    ],
  ];

  it.each(invalid)("register() rejects %s", (_label, sound, reason) => {
    const engine = createSoundEngine();
    let thrown: unknown;
    try {
      engine.register("bad", sound as SynthSound);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidSoundError);
    const error = thrown as InvalidSoundError;
    expect(error.code).toBe("INVALID_SOUND");
    expect(error.sound).toBe("bad");
    expect(error.message).toBe(`Invalid sound "bad": ${reason}`);
    expect(engine.has("bad")).toBe(false);
  });

  it("register() rejects empty names", () => {
    const engine = createSoundEngine();
    expect(() => engine.register("  ", chime)).toThrow(
      'Invalid sound "  ": name must be a non-empty string',
    );
  });

  it("accepts unfiltered noise without frequency", () => {
    const engine = createSoundEngine();
    expect(() =>
      engine.register("hiss", {
        voices: [
          {
            duration: 0.05,
            waveform: "noise",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("validates options.sounds at creation", () => {
    expect(() =>
      createSoundEngine({
        sounds: {
          bad: {
            voices: [],
          },
        },
      }),
    ).toThrow(InvalidSoundError);
  });
});

describe("createSoundEngine: dispose", () => {
  it("is safe before any context exists, and twice", () => {
    const engine = createSoundEngine();
    expect(() => {
      engine.dispose();
      engine.dispose();
    }).not.toThrow();
  });

  it("closes a context it created itself", () => {
    const contexts: FakeAudioContext[] = [];
    setGlobal("AudioContext", function FakeAudioContextConstructor() {
      const ctx = createFakeAudioContext();
      contexts.push(ctx);
      return ctx;
    });
    const engine = createSoundEngine();
    engine.play("tick");

    engine.dispose();

    expect(contexts[0]?.closeCalls).toBe(1);
    expect(contexts[0]?.state).toBe("closed");
  });

  it("disconnects but doesn't close a context from a custom factory", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);
    engine.play("tick");
    const ctx = h.ctx();

    engine.dispose();

    expect(ctx.closeCalls).toBe(0);
    expect(isConnected(ctx, master(ctx), ctx.destination)).toBe(false);
  });

  it("recreates the context lazily after dispose (StrictMode)", async () => {
    const h = harness();
    const engine = createSoundEngine(h.options);

    await engine.unlock();
    engine.dispose();
    await engine.unlock();
    engine.play("tick");

    expect(h.contexts).toHaveLength(2);
    expect(h.ctx().nodesOf("oscillator").length).toBeGreaterThan(0);
    expect(h.errors).toHaveLength(0);
  });

  it("ignores a pending resume from a disposed context", async () => {
    const h = harness({}, "suspended");
    const engine = createSoundEngine(h.options);

    engine.play("tick");
    const first = h.ctx();
    engine.dispose();
    await flush();

    expect(first.nodesOf("oscillator")).toHaveLength(0);
  });

  it("recreates the context if it was closed externally", () => {
    const h = harness();
    const engine = createSoundEngine(h.options);
    engine.play("tick");
    h.ctx().state = "closed";

    engine.play("tick");
    expect(h.contexts).toHaveLength(2);
  });
});
