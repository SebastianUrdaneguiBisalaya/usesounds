/**
 * Machine-readable code carried by every usesounds error.
 *
 * Use it to branch on the kind of failure without `instanceof` (e.g. when
 * errors cross a serialization boundary or when two copies of the package are
 * bundled).
 *
 * - `"INVALID_SOUND"` — an invalid sound name or definition was registered or
 *   requested. Thrown at setup time ({@link InvalidSoundError}).
 * - `"SOUND_PLAYBACK_FAILED"` — a sound could not be played. Never thrown; it is
 *   passed to the `onError` callback ({@link SoundPlaybackError}).
 */
export type UsesoundsErrorCode = "INVALID_SOUND" | "SOUND_PLAYBACK_FAILED";

/** Options accepted by the usesounds error constructors. */
export type UsesoundsErrorOptions = {
  /** The underlying error or value that caused this error, if any. */
  cause?: unknown;
};

function toErrorOptions(
  options: UsesoundsErrorOptions | undefined,
): ErrorOptions | undefined {
  return options !== undefined && "cause" in options
    ? {
        cause: options.cause,
      }
    : undefined;
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === "string") {
    return cause;
  }
  return "";
}

/**
 * Base class of every error created by usesounds.
 *
 * @example
 * ```ts
 * try {
 *   engine.register("", { url: "/chime.mp3" });
 * } catch (error) {
 *   if (error instanceof UsesoundsError) {
 *     console.warn(error.code, error.message);
 *   }
 * }
 * ```
 */
export class UsesoundsError extends Error {
  override name = "UsesoundsError";

  /** Machine-readable code identifying the kind of failure. */
  readonly code: UsesoundsErrorCode;

  constructor(
    code: UsesoundsErrorCode,
    message: string,
    options?: UsesoundsErrorOptions,
  ) {
    super(message, toErrorOptions(options));
    this.code = code;
  }
}

/**
 * Thrown at setup time when a sound name or definition is invalid
 * (e.g. registering a preset with an empty name or a malformed definition).
 *
 * This is a programmer error: fix the call site rather than catching it.
 *
 * @example
 * ```ts
 * try {
 *   engine.register("", { url: "/chime.mp3" });
 * } catch (error) {
 *   if (error instanceof InvalidSoundError) {
 *     error.sound; // ""
 *     error.message; // 'Invalid sound "": name must be a non-empty string'
 *   }
 * }
 * ```
 */
export class InvalidSoundError extends UsesoundsError {
  override name = "InvalidSoundError";

  declare readonly code: "INVALID_SOUND";

  /** Name of the sound that was rejected. */
  readonly sound: string;

  /**
   * @param sound - Name of the offending sound.
   * @param reason - Human-readable explanation of what is wrong.
   */
  constructor(sound: string, reason: string, options?: UsesoundsErrorOptions) {
    super("INVALID_SOUND", `Invalid sound "${sound}": ${reason}`, options);
    this.sound = sound;
  }
}

/**
 * Describes a sound that failed to play (audio context blocked, sample failed
 * to load or decode, …).
 *
 * Playing a sound never throws: this error is passed to the `onError` callback
 * instead, with the original failure available as `cause`.
 *
 * @example
 * ```ts
 * const engine = createSoundEngine({
 *   onError(error) {
 *     if (error instanceof SoundPlaybackError) {
 *       reportToMonitoring(error.sound, error.message, error.cause);
 *     }
 *   },
 * });
 * ```
 */
export class SoundPlaybackError extends UsesoundsError {
  override name = "SoundPlaybackError";

  declare readonly code: "SOUND_PLAYBACK_FAILED";

  /** Name of the sound that failed to play. */
  readonly sound: string;

  /**
   * @param sound - Name of the sound that failed.
   * @param options - `cause`: the underlying failure; its message is appended
   *   to this error's message.
   */
  constructor(sound: string, options?: UsesoundsErrorOptions) {
    const detail = describeCause(options?.cause);
    super(
      "SOUND_PLAYBACK_FAILED",
      `Failed to play sound "${sound}"${detail === "" ? "" : `: ${detail}`}`,
      options,
    );
    this.sound = sound;
  }
}
