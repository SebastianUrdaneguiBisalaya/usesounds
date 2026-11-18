/** Waveform of a synthesized voice: an oscillator type, or white `"noise"`. */
export type SynthWaveform =
  | "sine"
  | "square"
  | "sawtooth"
  | "triangle"
  | "noise";

type SynthVoiceTiming = {
  /** Seconds to wait after `play()` before this voice starts. Default `0`. */
  delay?: number;
  /** Seconds for the gain to rise from silence to its peak. Default `0.002`. */
  attack?: number;
  /** Total length of the voice in seconds, attack included. */
  duration: number;
  /** Peak gain of this voice, from `0` to `1`. Default `1`. */
  gain?: number;
};

/** A voice driven by an oscillator. */
export type SynthToneVoice = SynthVoiceTiming & {
  waveform: Exclude<SynthWaveform, "noise">;
  /** Starting frequency in Hz. */
  frequency: number;
  /** Frequency in Hz reached at the end of the voice (exponential glide). */
  frequencyEnd?: number;
};

/** A voice driven by white noise, optionally band-passed. */
export type SynthNoiseVoice = SynthVoiceTiming & {
  waveform: "noise";
  /** Center frequency in Hz of a band-pass filter. Omit for unfiltered noise. */
  frequency?: number;
  /** Center frequency in Hz reached at the end of the voice (exponential glide). Requires `frequency`. */
  frequencyEnd?: number;
  /** Quality factor of the band-pass filter. Default `1`. */
  q?: number;
};

/**
 * One layer of a synthesized sound: a waveform with a short gain envelope.
 * Times are in seconds, frequencies in Hz.
 */
export type SynthVoice = SynthToneVoice | SynthNoiseVoice;

/**
 * A synthesized sound: plain data describing one or more voices that play
 * together (each one can be offset with `delay`).
 *
 * @example
 * ```ts
 * const tick: SynthSound = {
 *   voices: [{ waveform: "sine", frequency: 1800, frequencyEnd: 1200, duration: 0.03, gain: 0.6 }],
 * };
 * ```
 */
export type SynthSound = {
  voices: readonly SynthVoice[];
};

/** Playback options applied on top of a {@link SynthSound}. */
export type SynthPlayOptions = {
  /** Multiplier applied to every voice's gain, from `0` to `1`. */
  volume: number;
  /** Multiplier applied to every frequency (`2` = one octave up). */
  pitch: number;
};

/** Gain used instead of `0`, since exponential ramps can't reach zero. */
const SILENCE = 0.0001;
const DEFAULT_ATTACK = 0.002;
const DEFAULT_Q = 1;
const NOISE_SECONDS = 1;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Returns a 1-second mono white-noise buffer, created once per context. */
export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached !== undefined) {
    return cached;
  }
  const length = Math.max(1, Math.round(ctx.sampleRate * NOISE_SECONDS));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

function scheduleFrequency(
  param: AudioParam,
  voice: SynthVoice,
  frequency: number,
  pitch: number,
  start: number,
  end: number,
): void {
  param.setValueAtTime(frequency * pitch, start);
  if (voice.frequencyEnd !== undefined) {
    param.exponentialRampToValueAtTime(voice.frequencyEnd * pitch, end);
  }
}

function scheduleEnvelope(
  param: AudioParam,
  peak: number,
  attack: number,
  start: number,
  end: number,
): void {
  if (attack > 0) {
    param.setValueAtTime(SILENCE, start);
    param.exponentialRampToValueAtTime(peak, start + attack);
  } else {
    param.setValueAtTime(peak, start);
  }
  param.exponentialRampToValueAtTime(SILENCE, end);
}

function createSource(
  ctx: BaseAudioContext,
  voice: SynthVoice,
  pitch: number,
  start: number,
  end: number,
): {
  source: AudioScheduledSourceNode;
  output: AudioNode;
  nodes: AudioNode[];
} {
  if (voice.waveform !== "noise") {
    const oscillator = ctx.createOscillator();
    oscillator.type = voice.waveform;
    scheduleFrequency(
      oscillator.frequency,
      voice,
      voice.frequency,
      pitch,
      start,
      end,
    );
    return {
      nodes: [
        oscillator,
      ],
      output: oscillator,
      source: oscillator,
    };
  }

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  noise.loop = end - start > NOISE_SECONDS;
  if (voice.frequency === undefined) {
    return {
      nodes: [
        noise,
      ],
      output: noise,
      source: noise,
    };
  }

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.setValueAtTime(voice.q ?? DEFAULT_Q, start);
  scheduleFrequency(
    filter.frequency,
    voice,
    voice.frequency,
    pitch,
    start,
    end,
  );
  noise.connect(filter);
  return {
    nodes: [
      noise,
      filter,
    ],
    output: filter,
    source: noise,
  };
}

/**
 * Schedules a synthesized sound on `ctx`, starting at `ctx.currentTime`.
 *
 * Each voice gets its own source (oscillator, or noise optionally band-passed)
 * and gain envelope, connected to `destination`. Every node is disconnected
 * when its source ends. Voices that would be silent are skipped.
 *
 * May throw if the context rejects a value; the caller is responsible for
 * reporting it (playback must never throw to consumers).
 */
export function playSynth(
  ctx: BaseAudioContext,
  destination: AudioNode,
  sound: SynthSound,
  options: SynthPlayOptions,
): void {
  const volume = Math.min(1, Math.max(0, options.volume));
  const now = ctx.currentTime;

  for (const voice of sound.voices) {
    const peak = (voice.gain ?? 1) * volume;
    if (peak <= SILENCE || voice.duration <= 0) {
      continue;
    }
    const start = now + Math.max(0, voice.delay ?? 0);
    const end = start + voice.duration;
    const attack = Math.min(
      Math.max(0, voice.attack ?? DEFAULT_ATTACK),
      voice.duration,
    );

    const { source, output, nodes } = createSource(
      ctx,
      voice,
      options.pitch,
      start,
      end,
    );
    const gain = ctx.createGain();
    scheduleEnvelope(gain.gain, peak, attack, start, end);
    output.connect(gain);
    gain.connect(destination);

    source.addEventListener(
      "ended",
      () => {
        for (const node of nodes) {
          node.disconnect();
        }
        gain.disconnect();
      },
      {
        once: true,
      },
    );
    source.start(start);
    source.stop(end);
  }
}
