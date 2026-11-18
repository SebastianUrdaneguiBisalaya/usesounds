/**
 * Temporarily removes or replaces globals (`window`, `matchMedia`,
 * `AudioContext`…) in tests. Call `restoreGlobals()` in `afterEach`.
 */

const saved = new Map<string, PropertyDescriptor | undefined>();

/** Replaces a global, or deletes it when `value` is omitted. */
export function setGlobal(key: string, value?: unknown): void {
  if (!saved.has(key)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, key);
  } else {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
}

/** Restores every global changed with `setGlobal`. */
export function restoreGlobals(): void {
  for (const [key, descriptor] of saved) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, key);
    } else {
      Object.defineProperty(globalThis, key, descriptor);
    }
  }
  saved.clear();
}

/** Installs a `matchMedia` that reports `prefers-reduced-motion: reduce` as `reduce`. */
export function setReducedMotion(reduce: boolean): void {
  setGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" && reduce,
    media: query,
  }));
}
