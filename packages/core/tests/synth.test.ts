import { describe, expect, it } from "bun:test";
import { getNoiseBuffer, playSynth, type SynthSound } from "../src/synth.js";
import {
  createFakeAudioContext,
  type FakeAudioContext,
  type FakeAudioNode,
} from "./fake-audio-context.js";

const DEFAULTS = {
  pitch: 1,
  volume: 1,
};

function play(
  ctx: FakeAudioContext,
  sound: SynthSound,
  options: Partial<typeof DEFAULTS> = {},
): void {
  const real = ctx.asReal();
  playSynth(real, real.destination, sound, {
    ...DEFAULTS,
    ...options,
  });
}

function only(nodes: FakeAudioNode[]): FakeAudioNode {
  expect(nodes).toHaveLength(1);
  return nodes[0] as FakeAudioNode;
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

const tone: SynthSound = {
  voices: [
    {
      attack: 0.005,
      duration: 0.05,
      frequency: 1000,
      gain: 0.5,
      waveform: "triangle",
    },
  ],
};

describe("playSynth: tone voices", () => {
  it("creates an oscillator -> gain -> destination chain", () => {
    const ctx = createFakeAudioContext();
    play(ctx, tone);

    const oscillator = only(ctx.nodesOf("oscillator"));
    const gain = only(ctx.nodesOf("gain"));
    expect(oscillator.type).toBe("triangle");
    expect(ctx.nodesOf("bufferSource")).toHaveLength(0);
    expect(isConnected(ctx, oscillator, gain)).toBe(true);
    expect(isConnected(ctx, gain, ctx.destination)).toBe(true);
    expect(ctx.connections.size).toBe(2);
  });

  it("starts and stops at ctx.currentTime (+ delay)", () => {
    const ctx = createFakeAudioContext({
      currentTime: 10,
    });
    play(ctx, {
      voices: [
        {
          delay: 0.02,
          duration: 0.05,
          frequency: 800,
          waveform: "sine",
        },
      ],
    });

    const oscillator = only(ctx.nodesOf("oscillator"));
    expect(oscillator.startedAt).toBeCloseTo(10.02);
    expect(oscillator.stoppedAt).toBeCloseTo(10.07);
  });

  it("sets a constant frequency when there is no glide", () => {
    const ctx = createFakeAudioContext({
      currentTime: 2,
    });
    play(ctx, tone);

    expect(only(ctx.nodesOf("oscillator")).frequency?.calls).toEqual([
      {
        method: "setValueAtTime",
        time: 2,
        value: 1000,
      },
    ]);
  });

  it("glides exponentially to frequencyEnd over the duration", () => {
    const ctx = createFakeAudioContext({
      currentTime: 1,
    });
    play(ctx, {
      voices: [
        {
          duration: 0.1,
          frequency: 1800,
          frequencyEnd: 1200,
          waveform: "sine",
        },
      ],
    });

    const calls = only(ctx.nodesOf("oscillator")).frequency?.calls;
    expect(calls).toHaveLength(2);
    expect(calls?.[0]).toEqual({
      method: "setValueAtTime",
      time: 1,
      value: 1800,
    });
    expect(calls?.[1]?.method).toBe("exponentialRampToValueAtTime");
    expect(calls?.[1]?.value).toBe(1200);
    expect(calls?.[1]?.time).toBeCloseTo(1.1);
  });

  it("schedules a short exponential attack/decay envelope", () => {
    const ctx = createFakeAudioContext({
      currentTime: 3,
    });
    play(ctx, tone);

    const calls = only(ctx.nodesOf("gain")).gain?.calls ?? [];
    expect(calls.map((call) => call.method)).toEqual([
      "setValueAtTime",
      "exponentialRampToValueAtTime",
      "exponentialRampToValueAtTime",
    ]);
    expect(calls[0]?.time).toBe(3);
    expect(calls[0]?.value).toBeGreaterThan(0);
    expect(calls[0]?.value).toBeLessThan(0.001);
    expect(calls[1]?.value).toBe(0.5);
    expect(calls[1]?.time).toBeCloseTo(3.005);
    expect(calls[2]?.value).toBeLessThan(0.001);
    expect(calls[2]?.time).toBeCloseTo(3.05);
  });

  it("jumps straight to the peak when attack is 0", () => {
    const ctx = createFakeAudioContext();
    play(ctx, {
      voices: [
        {
          attack: 0,
          duration: 0.05,
          frequency: 500,
          waveform: "square",
        },
      ],
    });

    const calls = only(ctx.nodesOf("gain")).gain?.calls ?? [];
    expect(calls[0]).toEqual({
      method: "setValueAtTime",
      time: 0,
      value: 1,
    });
    expect(calls[1]?.method).toBe("exponentialRampToValueAtTime");
    expect(calls).toHaveLength(2);
  });

  it("uses a default attack and clamps it to the duration", () => {
    const ctx = createFakeAudioContext();
    play(ctx, {
      voices: [
        {
          duration: 0.05,
          frequency: 500,
          waveform: "sine",
        },
        {
          attack: 1,
          duration: 0.01,
          frequency: 500,
          waveform: "sine",
        },
      ],
    });

    const [first, second] = ctx.nodesOf("gain");
    expect(first?.gain?.calls[1]?.time).toBeCloseTo(0.002);
    expect(second?.gain?.calls[1]?.time).toBeCloseTo(0.01);
  });
});

describe("playSynth: pitch and volume", () => {
  it("scales every frequency by pitch", () => {
    const ctx = createFakeAudioContext();
    play(
      ctx,
      {
        voices: [
          {
            duration: 0.1,
            frequency: 1000,
            frequencyEnd: 500,
            waveform: "sine",
          },
          {
            duration: 0.1,
            frequency: 3000,
            waveform: "noise",
          },
        ],
      },
      {
        pitch: 2,
      },
    );

    const oscillatorCalls = only(ctx.nodesOf("oscillator")).frequency?.calls;
    expect(oscillatorCalls?.map((call) => call.value)).toEqual([
      2000,
      1000,
    ]);
    expect(only(ctx.nodesOf("biquadFilter")).frequency?.calls[0]?.value).toBe(
      6000,
    );
  });

  it("scales the envelope peak by volume", () => {
    const ctx = createFakeAudioContext();
    play(ctx, tone, {
      volume: 0.4,
    });

    expect(only(ctx.nodesOf("gain")).gain?.calls[1]?.value).toBeCloseTo(0.2);
  });

  it("clamps volume to 1", () => {
    const ctx = createFakeAudioContext();
    play(ctx, tone, {
      volume: 5,
    });

    expect(only(ctx.nodesOf("gain")).gain?.calls[1]?.value).toBe(0.5);
  });

  it("creates no nodes when volume is 0", () => {
    const ctx = createFakeAudioContext();
    play(ctx, tone, {
      volume: 0,
    });

    expect(ctx.nodes).toHaveLength(0);
  });

  it("skips silent or zero-length voices", () => {
    const ctx = createFakeAudioContext();
    play(ctx, {
      voices: [
        {
          duration: 0.05,
          frequency: 500,
          gain: 0,
          waveform: "sine",
        },
        {
          duration: 0,
          frequency: 500,
          waveform: "sine",
        },
        {
          duration: 0.05,
          frequency: 700,
          waveform: "sine",
        },
      ],
    });

    expect(only(ctx.nodesOf("oscillator")).frequency?.calls[0]?.value).toBe(
      700,
    );
  });
});

describe("playSynth: noise voices", () => {
  it("plays unfiltered noise from a buffer source", () => {
    const ctx = createFakeAudioContext();
    play(ctx, {
      voices: [
        {
          duration: 0.03,
          waveform: "noise",
        },
      ],
    });

    const noise = only(ctx.nodesOf("bufferSource"));
    const gain = only(ctx.nodesOf("gain"));
    expect(ctx.buffers).toHaveLength(1);
    expect(noise.buffer).toBe(ctx.buffers[0]);
    expect(noise.loop).toBe(false);
    expect(ctx.nodesOf("biquadFilter")).toHaveLength(0);
    expect(isConnected(ctx, noise, gain)).toBe(true);
    expect(isConnected(ctx, gain, ctx.destination)).toBe(true);
    expect(noise.startedAt).toBe(0);
    expect(noise.stoppedAt).toBeCloseTo(0.03);
  });

  it("band-passes noise when frequency is set", () => {
    const ctx = createFakeAudioContext();
    play(ctx, {
      voices: [
        {
          duration: 0.05,
          frequency: 4000,
          frequencyEnd: 2000,
          q: 3,
          waveform: "noise",
        },
      ],
    });

    const noise = only(ctx.nodesOf("bufferSource"));
    const filter = only(ctx.nodesOf("biquadFilter"));
    const gain = only(ctx.nodesOf("gain"));
    expect(filter.type).toBe("bandpass");
    expect(filter.Q?.calls[0]?.value).toBe(3);
    expect(filter.frequency?.calls.map((call) => call.value)).toEqual([
      4000,
      2000,
    ]);
    expect(isConnected(ctx, noise, filter)).toBe(true);
    expect(isConnected(ctx, filter, gain)).toBe(true);
    expect(isConnected(ctx, gain, ctx.destination)).toBe(true);
  });

  it("loops the noise buffer for voices longer than it", () => {
    const ctx = createFakeAudioContext();
    play(ctx, {
      voices: [
        {
          duration: 2,
          waveform: "noise",
        },
      ],
    });

    expect(only(ctx.nodesOf("bufferSource")).loop).toBe(true);
  });
});

describe("getNoiseBuffer", () => {
  it("creates one 1-second mono white-noise buffer per context", () => {
    const ctx = createFakeAudioContext({
      sampleRate: 8000,
    });
    const real = ctx.asReal();

    const buffer = getNoiseBuffer(real);
    expect(getNoiseBuffer(real)).toBe(buffer);
    expect(ctx.buffers).toHaveLength(1);
    expect(buffer.numberOfChannels).toBe(1);
    expect(buffer.length).toBe(8000);

    const data = buffer.getChannelData(0);
    expect(data.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
    expect(data.some((sample) => sample !== 0)).toBe(true);
  });

  it("is reused across plays and isolated between contexts", () => {
    const a = createFakeAudioContext();
    const b = createFakeAudioContext();
    const noise: SynthSound = {
      voices: [
        {
          duration: 0.02,
          waveform: "noise",
        },
      ],
    };
    play(a, noise);
    play(a, noise);
    play(b, noise);

    expect(a.buffers).toHaveLength(1);
    expect(b.buffers).toHaveLength(1);
    const [first, second] = a.nodesOf("bufferSource");
    expect(first?.buffer).toBe(second?.buffer);
  });
});

describe("playSynth: cleanup", () => {
  it("leaves nothing connected after every source has ended", () => {
    const ctx = createFakeAudioContext();
    play(ctx, {
      voices: [
        {
          duration: 0.05,
          frequency: 900,
          waveform: "sine",
        },
        {
          delay: 0.01,
          duration: 0.03,
          frequency: 3000,
          waveform: "noise",
        },
        {
          duration: 0.02,
          waveform: "noise",
        },
      ],
    });

    expect(ctx.connections.size).toBeGreaterThan(0);
    ctx.endAll();
    expect(ctx.connections.size).toBe(0);
  });

  it("only disconnects the voice whose source ended", () => {
    const ctx = createFakeAudioContext();
    play(ctx, {
      voices: [
        {
          duration: 0.05,
          frequency: 900,
          waveform: "sine",
        },
        {
          duration: 0.2,
          frequency: 300,
          waveform: "sine",
        },
      ],
    });

    const [first, second] = ctx.nodesOf("oscillator");
    first?.end?.();
    expect(ctx.connections.size).toBe(2);
    expect(
      [
        ...ctx.connections,
      ].every(([from]) => from !== first),
    ).toBe(true);
    second?.end?.();
    expect(ctx.connections.size).toBe(0);
  });
});
