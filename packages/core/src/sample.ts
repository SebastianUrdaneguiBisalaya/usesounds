/**
 * An audio sample provided by the consumer (`.wav`, `.mp3`, `.ogg`… whatever
 * the browser can decode). It's decoded once into an `AudioBuffer`, cached by
 * the engine, and played with no delay afterwards.
 *
 * @example
 * ```ts
 * engine.register("chime", { type: "sample", src: "/sounds/chime.mp3" });
 * engine.register("click", { type: "sample", src: await file.arrayBuffer() });
 * ```
 */
export type SampleSound = {
  type: "sample";
  /**
   * Where the audio comes from:
   * - a URL, downloaded with `fetch`. Under a Content Security Policy the URL's
   *   origin must be allowed by `connect-src` (not `media-src`: no media
   *   elements are used). Cross-origin URLs also need CORS headers.
   * - an `ArrayBuffer` with the encoded file. It is copied before decoding, so
   *   the caller's buffer is never detached.
   */
  src: string | ArrayBuffer;
};

/** Per-play options for {@link playSample}. */
export type SamplePlayOptions = {
  /** Gain from `0` to `1`. */
  volume: number;
  /** Playback rate: `2` = one octave up and twice as fast. */
  pitch: number;
};

/** Why loading a sample failed, mapped to a `SoundPlaybackReason`. */
export type SampleLoadFailure = {
  reason: "sample-load-failed" | "sample-decode-failed";
  cause: unknown;
};

function failure(
  reason: SampleLoadFailure["reason"],
  cause: unknown,
): SampleLoadFailure {
  return {
    cause,
    reason,
  };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available");
  }
  const response = await fetch(url);
  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim();
    throw new Error(`HTTP ${status} while fetching ${url}`);
  }
  return response.arrayBuffer();
}

/**
 * Downloads (for URLs) or copies (for `ArrayBuffer`s) the sample's bytes and
 * decodes them on `ctx`.
 *
 * Rejects with a {@link SampleLoadFailure} describing which step failed.
 */
export async function loadSample(
  ctx: BaseAudioContext,
  sound: SampleSound,
): Promise<AudioBuffer> {
  let bytes: ArrayBuffer;
  try {
    bytes =
      typeof sound.src === "string"
        ? await fetchBytes(sound.src)
        : sound.src.slice(0);
  } catch (cause) {
    throw failure("sample-load-failed", cause);
  }
  try {
    return await ctx.decodeAudioData(bytes);
  } catch (cause) {
    throw failure("sample-decode-failed", cause);
  }
}

/** Type guard for the rejection value of {@link loadSample}. */
export function isSampleLoadFailure(
  value: unknown,
): value is SampleLoadFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "reason" in value &&
    "cause" in value &&
    (value.reason === "sample-load-failed" ||
      value.reason === "sample-decode-failed")
  );
}

/**
 * Plays a decoded buffer now through an `AudioBufferSourceNode` and a gain,
 * connected to `destination`. Nodes are disconnected when playback ends.
 * Nothing is created when `volume` is `0`. May throw; the caller reports it.
 */
export function playSample(
  ctx: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  options: SamplePlayOptions,
): void {
  const volume = Math.min(1, Math.max(0, options.volume));
  if (volume === 0) {
    return;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = options.pitch;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(destination);
  source.addEventListener(
    "ended",
    () => {
      source.disconnect();
      gain.disconnect();
    },
    {
      once: true,
    },
  );
  source.start(ctx.currentTime);
}
