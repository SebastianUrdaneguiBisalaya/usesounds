/**
 * Thrown at render time when a usesounds hook is used outside a
 * `<SoundProvider>`. This is a programmer error: wrap the component (or the
 * whole app) in `<SoundProvider>`.
 *
 * @example
 * ```tsx
 * <SoundProvider>
 *   <App />
 * </SoundProvider>
 * ```
 */
export class MissingSoundProviderError extends Error {
  override name = "MissingSoundProviderError";

  /** Machine-readable code identifying this error. */
  readonly code = "MISSING_SOUND_PROVIDER" as const;

  /** Name of the hook that was called outside a provider (e.g. `"useSoundEngine"`). */
  readonly hook: string;

  /** @param hook - Name of the hook that was called outside a provider. */
  constructor(hook: string) {
    super(
      `${hook}() must be used inside a <SoundProvider>. Wrap your app (or this part of the tree) in <SoundProvider> from @usesounds/react.`,
    );
    this.hook = hook;
  }
}
