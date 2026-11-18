import {
  createSoundEngine,
  presets,
  type SoundDefinition,
  type SoundEngine,
  type SoundEngineOptions,
  type SoundPlaybackError,
} from "@usesounds/core";
import {
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SoundContext, type SoundContextValue } from "./context.js";

type SoundMap = Readonly<Record<string, SoundDefinition>>;

/** Props of {@link SoundProvider}. Every prop is optional. */
export type SoundProviderProps = {
  /** Whether sounds play at all (e.g. bound to a user setting). Default `true`. */
  enabled?: boolean;
  /** Master volume from `0` to `1`. Default `1`. */
  volume?: number;
  /** Mute while the user has `prefers-reduced-motion: reduce` set. Default `true`. */
  respectReducedMotion?: boolean;
  /**
   * Extra sounds (synthesized or samples), keyed by name. Changes are synced
   * by comparing each definition by reference, so define them outside the
   * component (or memoize them) to avoid re-registering on every render.
   */
  sounds?: SoundMap;
  /**
   * Play `data-sound` attributes in this provider's tree. When `false`, only
   * unlocks audio on the first user gesture. Default `true`.
   */
  declarative?: boolean;
  /** Called when a sound fails to play or load. Can change between renders. */
  onError?: (error: SoundPlaybackError) => void;
  /**
   * Creates the `AudioContext` (e.g. to share an existing one). Only read when
   * the provider mounts; later changes are ignored.
   */
  audioContextFactory?: () => AudioContext;
  children?: ReactNode;
};

/** Applies the difference between two `sounds` maps to the engine. */
function syncSounds(
  engine: SoundEngine,
  previous: SoundMap | undefined,
  next: SoundMap | undefined,
): void {
  if (previous === next) {
    return;
  }
  for (const [name, sound] of Object.entries(next ?? {})) {
    if (previous?.[name] !== sound) {
      engine.register(name, sound);
    }
  }
  for (const name of Object.keys(previous ?? {})) {
    if (next !== undefined && Object.hasOwn(next, name)) {
      continue;
    }
    const preset = Object.hasOwn(presets, name)
      ? presets[name as keyof typeof presets]
      : undefined;
    if (preset === undefined) {
      engine.unregister(name);
    } else {
      // The removed sound was overriding a preset: bring the preset back.
      engine.register(name, preset);
    }
  }
}

/**
 * Provides a sound engine to its subtree and, by default, plays `data-sound`
 * attributes.
 *
 * Each provider owns one engine, created on first render without touching any
 * browser API (SSR-safe). Prop changes are applied through the engine setters.
 * The engine is released on unmount, and works under `<StrictMode>`.
 *
 * When providers are nested, the innermost mounted one plays `data-sound`
 * attributes.
 *
 * @example
 * ```tsx
 * <SoundProvider volume={0.4} enabled={settings.uiSounds}>
 *   <button data-sound="tick">Save</button>
 * </SoundProvider>
 * ```
 */
export function SoundProvider({
  enabled = true,
  volume = 1,
  respectReducedMotion = true,
  sounds,
  declarative = true,
  onError,
  audioContextFactory,
  children,
}: SoundProviderProps): ReactNode {
  const parent = useContext(SoundContext);
  const depth = parent === null ? 0 : parent.depth + 1;

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [
    onError,
  ]);

  const [engine] = useState(() => {
    const options: SoundEngineOptions = {
      enabled,
      onError: (error) => onErrorRef.current?.(error),
      respectReducedMotion,
      volume,
    };
    if (sounds !== undefined) {
      options.sounds = sounds;
    }
    if (audioContextFactory !== undefined) {
      options.audioContextFactory = audioContextFactory;
    }
    return createSoundEngine(options);
  });

  useEffect(() => {
    engine.setEnabled(enabled);
  }, [
    engine,
    enabled,
  ]);

  useEffect(() => {
    engine.setVolume(volume);
  }, [
    engine,
    volume,
  ]);

  useEffect(() => {
    engine.setRespectReducedMotion(respectReducedMotion);
  }, [
    engine,
    respectReducedMotion,
  ]);

  const syncedSounds = useRef(sounds);
  useEffect(() => {
    syncSounds(engine, syncedSounds.current, sounds);
    syncedSounds.current = sounds;
  }, [
    engine,
    sounds,
  ]);

  useEffect(
    () =>
      declarative
        ? engine.bindDeclarative(undefined, {
            priority: depth,
          })
        : engine.bindUnlock(),
    [
      engine,
      declarative,
      depth,
    ],
  );

  useEffect(
    () => () => {
      engine.dispose();
    },
    [
      engine,
    ],
  );

  const value = useMemo<SoundContextValue>(
    () => ({
      depth,
      engine,
    }),
    [
      engine,
      depth,
    ],
  );

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}
