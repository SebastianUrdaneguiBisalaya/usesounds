import type { SoundEngine } from "@usesounds/core";
import { createContext, useContext } from "react";
import { MissingSoundProviderError } from "./errors.js";

/** Value shared by a `<SoundProvider>` with its subtree. */
export type SoundContextValue = {
  engine: SoundEngine;
  /** Nesting level: `0` for the outermost provider. */
  depth: number;
};

export const SoundContext = createContext<SoundContextValue | null>(null);

/** Returns the closest provider's context value, or throws for `hook`. */
export function useSoundContext(hook: string): SoundContextValue {
  const value = useContext(SoundContext);
  if (value === null) {
    throw new MissingSoundProviderError(hook);
  }
  return value;
}

/**
 * Returns the sound engine of the closest `<SoundProvider>`: the full
 * `@usesounds/core` engine API (`play`, `register`, `preload`, setters…).
 * The returned engine is stable for the provider's lifetime.
 *
 * @throws {MissingSoundProviderError} when used outside a `<SoundProvider>`.
 *
 * @example
 * ```tsx
 * function Uploader() {
 *   const engine = useSoundEngine();
 *   return <button onClick={() => upload().then(() => engine.play("success"))}>Upload</button>;
 * }
 * ```
 */
export function useSoundEngine(): SoundEngine {
  return useSoundContext("useSoundEngine").engine;
}
