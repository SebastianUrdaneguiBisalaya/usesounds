import type { SoundName, SoundPlayOptions } from "@usesounds/core";
import { useCallback } from "react";
import { useSoundContext } from "./context.js";

/** Plays the sound bound by {@link useSound}, optionally overriding its options. */
export type PlaySound = (overrides?: SoundPlayOptions) => void;

/**
 * Returns a `play()` function for a sound of the closest `<SoundProvider>`:
 * a preset (`"tick"`, `"pop"`…) or a sound registered on the provider.
 *
 * `play` keeps the same identity while `name` and the option values don't
 * change, so it's safe in dependency arrays. Per-call `overrides` replace the
 * hook's options field by field. Like the engine, `play()` never throws.
 *
 * @param name - Name of the sound to play.
 * @param options - Default `volume` and `pitch` for every play.
 * @throws {MissingSoundProviderError} when used outside a `<SoundProvider>`.
 *
 * @example
 * ```tsx
 * const play = useSound("tick", { volume: 0.5 });
 * <button onClick={() => { play(); save(); }}>Save</button>
 * play({ pitch: 1.5 }); // volume 0.5, pitch 1.5
 * ```
 */
export function useSound(
  name: SoundName,
  options?: SoundPlayOptions,
): PlaySound {
  const { engine } = useSoundContext("useSound");
  const volume = options?.volume;
  const pitch = options?.pitch;

  return useCallback<PlaySound>(
    (overrides) => {
      const playOptions: SoundPlayOptions = {};
      const finalVolume = overrides?.volume ?? volume;
      const finalPitch = overrides?.pitch ?? pitch;
      if (finalVolume !== undefined) {
        playOptions.volume = finalVolume;
      }
      if (finalPitch !== undefined) {
        playOptions.pitch = finalPitch;
      }
      engine.play(name, playOptions);
    },
    [
      engine,
      name,
      volume,
      pitch,
    ],
  );
}
