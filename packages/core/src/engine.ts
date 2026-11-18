import { isBrowser, prefersReducedMotion } from "./environment.js";
import {
  SoundPlaybackError,
  type SoundPlaybackErrorOptions,
} from "./errors.js";
import { presets, type SoundName } from "./presets.js";
import { playSynth, type SynthSound } from "./synth.js";
import { assertValidName, assertValidSynthSound } from "./validate.js";

/** Options for {@link createSoundEngine}. Every option is optional. */
export type SoundEngineOptions = {
  /** Whether sounds play at all. Default `true`. Change later with `setEnabled`. */
  enabled?: boolean;
  /** Master volume from `0` to `1`. Default `1`. Change later with `setVolume`. */
  volume?: number;
  /**
   * Mute while the user has `prefers-reduced-motion: reduce` set. Checked on
   * every `play()`, so it follows changes of the setting. Default `true`.
   */
  respectReducedMotion?: boolean;
  /**
   * Extra sound definitions, keyed by name. They are validated like
   * `register()` and can override built-in presets.
   */
  sounds?: Readonly<Record<string, SynthSound>>;
  /**
   * Creates the `AudioContext`, called lazily on the first `unlock()`/`play()`
   * (and again after `dispose()`). Use it to share an existing context or to
   * inject a fake in tests. Contexts returned by a custom factory are never
   * closed by the engine. Default: `() => new AudioContext()`.
   */
  audioContextFactory?: () => AudioContext;
  /**
   * Called when a sound fails to play (unknown name, audio unavailable, …).
   * `play()` itself never throws.
   */
  onError?: (error: SoundPlaybackError) => void;
};

/** Per-call options for {@link SoundEngine.play}. */
export type SoundPlayOptions = {
  /** Volume of this sound from `0` to `1`, multiplied by the master volume. Default `1`. */
  volume?: number;
  /** Frequency multiplier: `2` = one octave up, `0.5` = one octave down. Default `1`. */
  pitch?: number;
};

/** A sound engine created by {@link createSoundEngine}. */
export type SoundEngine = {
  /**
   * Plays a sound. Silently does nothing when disabled, on the server, at
   * volume `0`, or when reduced motion applies. Never throws: failures are
   * reported to `onError` as {@link SoundPlaybackError}.
   */
  play(name: SoundName, options?: SoundPlayOptions): void;
  /**
   * Registers (or replaces) a synthesized sound.
   *
   * @throws {InvalidSoundError} if the name or definition is invalid.
   */
  register(name: string, sound: SynthSound): void;
  /** Removes a sound (presets included). Returns `true` if it existed. */
  unregister(name: string): boolean;
  /** Whether a sound with this name can be played. */
  has(name: string): boolean;
  /** Names of every playable sound: presets plus registered sounds. */
  names(): string[];
  /** Enables or mutes every sound. */
  setEnabled(enabled: boolean): void;
  /** Sets the master volume (`0`–`1`), applied immediately. */
  setVolume(volume: number): void;
  /** Enables or disables muting under `prefers-reduced-motion: reduce`. */
  setRespectReducedMotion(respect: boolean): void;
  /**
   * Creates the `AudioContext` if needed and resumes it. Call it from a user
   * gesture (`pointerdown`/`keydown`) so later sounds play without delay.
   * Resolves once done; never rejects. No-op when disabled or on the server.
   */
  unlock(): Promise<void>;
  /**
   * Releases audio resources (closes the context the engine created). The
   * engine stays usable: the next `unlock()`/`play()` creates a new context.
   */
  dispose(): void;
};

type AudioState = {
  ctx: AudioContext;
  master: GainNode;
  owned: boolean;
};

/** A `resume()` that settles later than this plays nothing (avoids bursts of stale sounds). */
const MAX_RESUME_DELAY_MS = 250;

function clampVolume(value: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function defaultAudioContextFactory(): AudioContext {
  if (typeof AudioContext === "undefined") {
    throw new Error("Web Audio API (AudioContext) is not supported");
  }
  return new AudioContext();
}

/**
 * Creates a sound engine: the framework-agnostic core of usesounds.
 *
 * Creating it touches no browser API (safe during SSR). The `AudioContext` is
 * created lazily on the first `unlock()` or `play()`.
 *
 * @throws {InvalidSoundError} if `options.sounds` contains an invalid definition.
 *
 * @example
 * ```ts
 * const engine = createSoundEngine({
 *   volume: 0.4,
 *   onError: (error) => console.warn(error.reason, error.message),
 * });
 *
 * button.addEventListener("click", () => engine.play("tick"));
 *
 * engine.register("chime", {
 *   voices: [{ waveform: "sine", frequency: 1320, duration: 0.15, gain: 0.5 }],
 * });
 * engine.play("chime", { volume: 0.5, pitch: 1.5 });
 * ```
 */
export function createSoundEngine(
  options: SoundEngineOptions = {},
): SoundEngine {
  let enabled = options.enabled ?? true;
  let volume = clampVolume(options.volume ?? 1, 1);
  let respectReducedMotion = options.respectReducedMotion ?? true;
  const factory = options.audioContextFactory;
  const onError = options.onError;

  const sounds = new Map<string, SynthSound>(Object.entries(presets));
  for (const [name, sound] of Object.entries(options.sounds ?? {})) {
    assertValidName(name);
    assertValidSynthSound(name, sound);
    sounds.set(name, sound);
  }

  let audio: AudioState | null = null;

  function report(name: string, errorOptions: SoundPlaybackErrorOptions): void {
    if (onError === undefined) {
      return;
    }
    try {
      onError(new SoundPlaybackError(name, errorOptions));
    } catch {
      // A throwing onError must never break the caller's event handler.
    }
  }

  /** Returns the live audio state, creating it if needed. May throw. */
  function getAudio(): AudioState {
    if (audio !== null && audio.ctx.state !== "closed") {
      return audio;
    }
    const ctx = (factory ?? defaultAudioContextFactory)();
    if (ctx.state === "closed") {
      throw new Error("AudioContext is closed");
    }
    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    audio = {
      ctx,
      master,
      owned: factory === undefined,
    };
    return audio;
  }

  function isMuted(): boolean {
    return (
      !enabled ||
      !isBrowser() ||
      (respectReducedMotion && prefersReducedMotion())
    );
  }

  function render(
    state: AudioState,
    name: string,
    sound: SynthSound,
    playOptions: SoundPlayOptions,
  ): void {
    try {
      playSynth(state.ctx, state.master, sound, {
        pitch: playOptions.pitch ?? 1,
        volume: clampVolume(playOptions.volume ?? 1, 1),
      });
    } catch (cause) {
      report(name, {
        cause,
        reason: "playback-failed",
      });
    }
  }

  function play(name: SoundName, playOptions: SoundPlayOptions = {}): void {
    if (isMuted() || volume === 0) {
      return;
    }
    const sound = sounds.get(name);
    if (sound === undefined) {
      report(name, {
        reason: "unknown-sound",
      });
      return;
    }
    const pitch = playOptions.pitch ?? 1;
    if (!Number.isFinite(pitch) || pitch <= 0) {
      report(name, {
        cause: new RangeError(`pitch must be a positive number, got ${pitch}`),
        reason: "playback-failed",
      });
      return;
    }

    let state: AudioState;
    try {
      state = getAudio();
    } catch (cause) {
      report(name, {
        cause,
        reason: "audio-unavailable",
      });
      return;
    }

    if (state.ctx.state !== "suspended") {
      render(state, name, sound, playOptions);
      return;
    }

    // Suspended (autoplay policy): resume, then play only if it resumed
    // promptly, so sounds requested before a gesture don't burst out later.
    const requestedAt = Date.now();
    state.ctx.resume().then(
      () => {
        if (
          audio === state &&
          state.ctx.state === "running" &&
          Date.now() - requestedAt <= MAX_RESUME_DELAY_MS
        ) {
          render(state, name, sound, playOptions);
        }
      },
      (cause: unknown) => {
        report(name, {
          cause,
          reason: "audio-unavailable",
        });
      },
    );
  }

  async function unlock(): Promise<void> {
    if (!enabled || !isBrowser()) {
      return;
    }
    try {
      const state = getAudio();
      if (state.ctx.state === "suspended") {
        await state.ctx.resume();
      }
    } catch {
      // Best effort: a later play() reports the failure to onError.
    }
  }

  function dispose(): void {
    const state = audio;
    audio = null;
    if (state === null) {
      return;
    }
    try {
      state.master.disconnect();
      if (state.owned && state.ctx.state !== "closed") {
        state.ctx.close().catch(() => {
          // Already closed or closing: nothing to release.
        });
      }
    } catch {
      // Releasing resources must never throw.
    }
  }

  return {
    dispose,
    has(name) {
      return sounds.has(name);
    },
    names() {
      return [
        ...sounds.keys(),
      ];
    },
    play,
    register(name, sound) {
      assertValidName(name);
      assertValidSynthSound(name, sound);
      sounds.set(name, sound);
    },
    setEnabled(next) {
      enabled = next;
    },
    setRespectReducedMotion(next) {
      respectReducedMotion = next;
    },
    setVolume(next) {
      volume = clampVolume(next, volume);
      if (audio !== null) {
        try {
          audio.master.gain.setValueAtTime(volume, audio.ctx.currentTime);
        } catch {
          // Applied on the next context creation anyway.
        }
      }
    },
    unlock,
    unregister(name) {
      return sounds.delete(name);
    },
  };
}
