import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { isBrowser, prefersReducedMotion } from "../src/environment.js";

const saved = new Map<string, PropertyDescriptor | undefined>();

/** Temporarily removes or replaces a global; restored after each test. */
function setGlobal(key: string, value?: unknown): void {
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

function fakeMatchMedia(matches: boolean) {
  const queries: string[] = [];
  const matchMedia = (query: string) => {
    queries.push(query);
    return {
      matches: query === "(prefers-reduced-motion: reduce)" && matches,
      media: query,
    };
  };
  return {
    matchMedia,
    queries,
  };
}

beforeEach(() => {
  saved.clear();
});

afterEach(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, key);
    } else {
      Object.defineProperty(globalThis, key, descriptor);
    }
  }
});

describe("isBrowser", () => {
  it("is true when window and document exist", () => {
    expect(isBrowser()).toBe(true);
  });

  it("is false without window", () => {
    setGlobal("window");
    expect(Reflect.has(globalThis, "window")).toBe(false);
    expect(isBrowser()).toBe(false);
  });

  it("is false without document", () => {
    setGlobal("document");
    expect(isBrowser()).toBe(false);
  });
});

describe("prefersReducedMotion", () => {
  it("is true when the media query matches", () => {
    const { matchMedia, queries } = fakeMatchMedia(true);
    setGlobal("matchMedia", matchMedia);

    expect(prefersReducedMotion()).toBe(true);
    expect(queries).toEqual([
      "(prefers-reduced-motion: reduce)",
    ]);
  });

  it("is false when the media query doesn't match", () => {
    setGlobal("matchMedia", fakeMatchMedia(false).matchMedia);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reads the media query lazily on each call", () => {
    setGlobal("matchMedia", fakeMatchMedia(false).matchMedia);
    expect(prefersReducedMotion()).toBe(false);

    setGlobal("matchMedia", fakeMatchMedia(true).matchMedia);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when matchMedia is missing", () => {
    setGlobal("matchMedia");
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is false when matchMedia throws", () => {
    setGlobal("matchMedia", () => {
      throw new Error("unsupported");
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is false on the server (no window), without calling matchMedia", () => {
    const { matchMedia, queries } = fakeMatchMedia(true);
    setGlobal("matchMedia", matchMedia);
    setGlobal("window");

    expect(prefersReducedMotion()).toBe(false);
    expect(queries).toEqual([]);
  });
});
