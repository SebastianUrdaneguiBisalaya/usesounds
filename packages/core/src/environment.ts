const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Returns `true` when running in a browser-like environment (browser, Electron renderer). */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Returns `true` when the user has `prefers-reduced-motion: reduce` set.
 *
 * Read lazily on each call. Returns `false` on the server or when `matchMedia`
 * is unavailable.
 */
export function prefersReducedMotion(): boolean {
  if (!isBrowser() || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}
