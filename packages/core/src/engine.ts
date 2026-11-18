import { isBrowser, prefersReducedMotion } from "./environment.js";
import {
  SoundPlaybackError,
  type SoundPlaybackErrorOptions,
} from "./errors.js";
import { presets, type SoundName } from "./presets.js";
import {
  isSampleLoadFailure,
  loadSample,
  playSample,
  type SampleSound,
} from "./sample.js";
import { playSynth } from "./synth.js";
import {
  assertValidName,
  assertValidSound,
  isSampleSound,
  type SoundDefinition,
} from "./validate.js";

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
   * Extra sound definitions (synthesized or samples), keyed by name. They are
   * validated like `register()` and can override built-in presets.
   */
  sounds?: Readonly<Record<string, SoundDefinition>>;
  /**
   * Creates the `AudioContext`, called lazily on the first `unlock()`,
   * `play()` or `preload()` (and again after `dispose()`). Use it to share an
   * existing context or to inject a fake in tests. Contexts returned by a
   * custom factory are never closed by the engine.
   * Default: `() => new AudioContext()`.
   */
  audioContextFactory?: () => AudioContext;
  /**
   * Called when a sound fails to play or a sample fails to load (unknown
   * name, audio unavailable, HTTP or decode error, …). Never thrown.
   */
  onError?: (error: SoundPlaybackError) => void;
};

/** Per-call options for {@link SoundEngine.play}. */
export type SoundPlayOptions = {
  /** Volume of this sound from `0` to `1`, multiplied by the master volume. Default `1`. */
  volume?: number;
  /**
   * Pitch multiplier: `2` = one octave up, `0.5` = one octave down. Default
   * `1`. For samples it's the playback rate, so it also changes the speed.
   */
  pitch?: number;
};

/** A sound engine created by {@link createSoundEngine}. */
export type SoundEngine = {
  /**
   * Plays a sound. Silently does nothing when disabled, on the server, at
   * volume `0`, or when reduced motion applies. Never throws: failures are
   * reported to `onError` as {@link SoundPlaybackError}.
   *
   * A sample that isn't decoded yet starts loading and that play is skipped
   * (it never plays late). Use `preload()` to have it ready in advance.
   */
  play(name: SoundName, options?: SoundPlayOptions): void;
  /**
   * Registers (or replaces) a synthesized sound or a sample. If the
   * `AudioContext` already exists, a sample starts loading right away.
   *
   * @throws {InvalidSoundError} if the name or definition is invalid.
   *
   * @example
   * ```ts
   * engine.register("chime", { type: "sample", src: "/sounds/chime.mp3" });
   * ```
   */
  register(name: string, sound: SoundDefinition): void;
  /** Removes a sound (presets included) and its cached sample. Returns `true` if it existed. */
  unregister(name: string): boolean;
  /** Whether a sound with this name is registered. */
  has(name: string): boolean;
  /** Names of every registered sound: presets plus registered sounds. */
  names(): string[];
  /**
   * Loads and decodes samples now, creating the `AudioContext` if needed.
   * With no argument, loads every registered sample. Samples that failed
   * before are retried. Resolves when every load has settled; never rejects
   * (failures go to `onError`). No-op on the server.
   *
   * @example
   * ```ts
   * await engine.preload(["chime"]);
   * engine.play("chime"); // plays immediately
   * ```
   */
  preload(names?: readonly string[]): Promise<void>;
  /** Enables or mutes every sound. */
  setEnabled(enabled: boolean): void;
  /** Sets the master volume (`0`–`1`), applied immediately. */
  setVolume(volume: number): void;
  /** Enables or disables muting under `prefers-reduced-motion: reduce`. */
  setRespectReducedMotion(respect: boolean): void;
  /**
   * Creates the `AudioContext` if needed and resumes it, and starts loading
   * registered samples. Call it from a user gesture (`pointerdown`/`keydown`)
   * so later sounds play without delay. Resolves once done; never rejects.
   * No-op when disabled or on the server.
   */
  unlock(): Promise<void>;
  /**
   * Releases audio resources (closes the context the engine created). The
   * engine stays usable: the next `unlock()`/`play()` creates a new context.
   * Decoded samples stay cached.
   */
  dispose(): void;
};

type AudioState = {
  ctx: AudioContext;
  master: GainNode;
  owned: boolean;
};

/** Cache entry of one sample, keyed by sound name. */
type SampleEntry = {
  sound: SampleSound;
  /** Settles when the load is done; never rejects. */
  promise: Promise<void>;
  status: "loading" | "ready" | "failed";
  buffer?: AudioBuffer;
  failure?: SoundPlaybackErrorOptions;
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
 * created lazily on the first `unlock()`, `play()` or `preload()`.
 *
 * Samples given by URL are downloaded with `fetch`: under a Content Security
 * Policy, their origin must be allowed by `connect-src`.
 *
 * @throws {InvalidSoundError} if `options.sounds` contains an invalid definition.
 *
 * @example
 * ```ts
 * const engine = createSoundEngine({
 *   volume: 0.4,
 *   sounds: { chime: { type: "sample", src: "/sounds/chime.mp3" } },
 *   onError: (error) => console.warn(error.reason, error.message),
 * });
 *
 * button.addEventListener("pointerdown", () => engine.play("tick"));
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

  const sounds = new Map<string, SoundDefinition>(Object.entries(presets));
  for (const [name, sound] of Object.entries(options.sounds ?? {})) {
    assertValidName(name);
    assertValidSound(name, sound);
    sounds.set(name, sound);
  }

  const samples = new Map<string, SampleEntry>();
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

  /**
   * Starts loading a sample on `ctx` unless it's already loading or ready
   * (or failed, unless `retry`). Concurrent callers share one promise.
   */
  function startLoad(
    name: string,
    sound: SampleSound,
    ctx: AudioContext,
    retry = false,
  ): Promise<void> {
    const existing = samples.get(name);
    if (
      existing !== undefined &&
      existing.sound === sound &&
      (existing.status !== "failed" || !retry)
    ) {
      return existing.promise;
    }

    const entry: SampleEntry = {
      promise: Promise.resolve(),
      sound,
      status: "loading",
    };
    entry.promise = loadSample(ctx, sound).then(
      (buffer) => {
        entry.status = "ready";
        entry.buffer = buffer;
      },
      (error: unknown) => {
        const current = samples.get(name) === entry;
        if (current && audio?.ctx !== ctx) {
          // The context was disposed mid-load: forget it and retry later.
          samples.delete(name);
          return;
        }
        entry.status = "failed";
        entry.failure = isSampleLoadFailure(error)
          ? {
              cause: error.cause,
              reason: error.reason,
            }
          : {
              cause: error,
              reason: "sample-load-failed",
            };
        if (current) {
          report(name, entry.failure);
        }
      },
    );
    samples.set(name, entry);
    return entry.promise;
  }

  function loadAllSamples(ctx: AudioContext): void {
    for (const [name, sound] of sounds) {
      if (isSampleSound(sound)) {
        void startLoad(name, sound, ctx);
      }
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
    loadAllSamples(ctx);
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
    sound: SoundDefinition,
    buffer: AudioBuffer | undefined,
    playOptions: SoundPlayOptions,
  ): void {
    const settings = {
      pitch: playOptions.pitch ?? 1,
      volume: clampVolume(playOptions.volume ?? 1, 1),
    };
    try {
      if (buffer !== undefined) {
        playSample(state.ctx, state.master, buffer, settings);
      } else if (!isSampleSound(sound)) {
        playSynth(state.ctx, state.master, sound, settings);
      }
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

    let buffer: AudioBuffer | undefined;
    if (isSampleSound(sound)) {
      const entry = samples.get(name);
      if (entry?.status === "failed" && entry.sound === sound) {
        report(name, entry.failure ?? {});
        return;
      }
      if (entry?.status !== "ready" || entry.sound !== sound) {
        // Not decoded yet: start loading and skip this play (never play late).
        void startLoad(name, sound, state.ctx);
        return;
      }
      buffer = entry.buffer;
    }

    if (state.ctx.state !== "suspended") {
      render(state, name, sound, buffer, playOptions);
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
          render(state, name, sound, buffer, playOptions);
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

  async function preload(names?: readonly string[]): Promise<void> {
    if (!isBrowser()) {
      return;
    }
    const targets: [
      string,
      SampleSound,
    ][] = [];
    for (const name of names ?? sounds.keys()) {
      const sound = sounds.get(name);
      if (sound === undefined) {
        report(name, {
          reason: "unknown-sound",
        });
      } else if (isSampleSound(sound)) {
        targets.push([
          name,
          sound,
        ]);
      }
    }
    if (targets.length === 0) {
      return;
    }

    let state: AudioState;
    try {
      state = getAudio();
    } catch (cause) {
      for (const [name] of targets) {
        report(name, {
          cause,
          reason: "audio-unavailable",
        });
      }
      return;
    }
    await Promise.all(
      targets.map(([name, sound]) => startLoad(name, sound, state.ctx, true)),
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
    preload,
    register(name, sound) {
      assertValidName(name);
      assertValidSound(name, sound);
      sounds.set(name, sound);
      samples.delete(name);
      if (
        isSampleSound(sound) &&
        audio !== null &&
        audio.ctx.state !== "closed"
      ) {
        void startLoad(name, sound, audio.ctx);
      }
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
      samples.delete(name);
      return sounds.delete(name);
    },
  };
}
