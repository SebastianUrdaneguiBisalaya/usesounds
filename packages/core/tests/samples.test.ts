import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createSoundEngine,
  InvalidSoundError,
  type SoundDefinition,
  type SoundEngineOptions,
  type SoundPlaybackError,
} from "../src/index.js";
import {
  createFakeAudioContext,
  type FakeAudioBuffer,
  type FakeAudioContext,
  type FakeAudioContextState,
  type FakeAudioNode,
} from "./fake-audio-context.js";
import { restoreGlobals, setGlobal, setReducedMotion } from "./globals.js";

const URL_A = "https://cdn.example.com/a.mp3";
const URL_B = "https://cdn.example.com/b.mp3";

type FetchMock = {
  calls: string[];
  /** Response for a URL: bytes (200), an HTTP status, or an Error to reject with. */
  routes: Map<string, Uint8Array<ArrayBuffer> | number | Error>;
};

function mockFetch(
  routes: Record<string, Uint8Array<ArrayBuffer> | number | Error> = {},
): FetchMock {
  const mock: FetchMock = {
    calls: [],
    routes: new Map(Object.entries(routes)),
  };
  setGlobal("fetch", (input: string) => {
    mock.calls.push(input);
    const route = mock.routes.get(input) ?? 404;
    if (route instanceof Error) {
      return Promise.reject(route);
    }
    if (typeof route === "number") {
      return Promise.resolve(
        new Response(null, {
          status: route,
          statusText: route === 404 ? "Not Found" : "",
        }),
      );
    }
    return Promise.resolve(new Response(route));
  });
  return mock;
}

type Harness = {
  contexts: FakeAudioContext[];
  errors: SoundPlaybackError[];
  options: SoundEngineOptions;
  ctx(): FakeAudioContext;
};

function harness(
  overrides: SoundEngineOptions = {},
  state: FakeAudioContextState = "running",
): Harness {
  const contexts: FakeAudioContext[] = [];
  const errors: SoundPlaybackError[] = [];
  return {
    contexts,
    ctx() {
      const last = contexts.at(-1);
      if (last === undefined) {
        throw new Error("no AudioContext was created");
      }
      return last;
    },
    errors,
    options: {
      audioContextFactory() {
        const ctx = createFakeAudioContext({
          state,
        });
        contexts.push(ctx);
        return ctx.asReal();
      },
      onError(error) {
        errors.push(error);
      },
      ...overrides,
    },
  };
}

function sample(src: string | ArrayBuffer): SoundDefinition {
  return {
    src,
    type: "sample",
  };
}

function bytes(...values: number[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array(values);
}

/** Waits for pending fetch/decode promises to settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function sources(ctx: FakeAudioContext): FakeAudioNode[] {
  return ctx.nodesOf("bufferSource");
}

beforeEach(() => {
  setReducedMotion(false);
});

afterEach(() => {
  restoreGlobals();
});

describe("samples from a URL", () => {
  it("skips the first play, loads, then plays from the decoded buffer", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1, 2, 3),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);

    engine.play("chime");
    const ctx = h.ctx();
    expect(sources(ctx)).toHaveLength(0);
    expect(fetch.calls).toEqual([
      URL_A,
    ]);

    await settle();
    expect(ctx.decoded).toHaveLength(1);
    expect(sources(ctx)).toHaveLength(0);

    engine.play("chime");
    const [source] = sources(ctx);
    expect(source?.buffer).toBe(ctx.buffers[0] as FakeAudioBuffer);
    expect(source?.startedAt).toBe(0);
    expect(h.errors).toHaveLength(0);
  });

  it("plays through a gain into the master gain", async () => {
    mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);
    await engine.preload();

    engine.play("chime");
    const ctx = h.ctx();
    const [master, gain] = ctx.nodesOf("gain");
    const [source] = sources(ctx);
    const edges = [
      ...ctx.connections,
    ];
    expect(edges.some(([a, b]) => a === source && b === gain)).toBe(true);
    expect(edges.some(([a, b]) => a === gain && b === master)).toBe(true);
  });

  it("fetches and decodes once, even with concurrent loads", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1, 2),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);

    engine.play("chime");
    engine.play("chime");
    const preloads = Promise.all([
      engine.preload([
        "chime",
      ]),
      engine.preload(),
    ]);
    await preloads;
    engine.play("chime");
    engine.play("chime");

    expect(fetch.calls).toHaveLength(1);
    expect(h.ctx().decoded).toHaveLength(1);
    expect(sources(h.ctx())).toHaveLength(2);
  });

  it("applies per-play volume and pitch (playbackRate)", async () => {
    mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
      volume: 0.5,
    });
    const engine = createSoundEngine(h.options);
    await engine.preload();

    engine.play("chime", {
      pitch: 1.5,
      volume: 0.4,
    });

    const ctx = h.ctx();
    const [master, gain] = ctx.nodesOf("gain");
    expect(master?.gain?.value).toBe(0.5);
    expect(gain?.gain?.value).toBe(0.4);
    expect(sources(ctx)[0]?.playbackRate?.value).toBe(1.5);
  });

  it("creates no nodes for a per-play volume of 0", async () => {
    mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);
    await engine.preload();

    engine.play("chime", {
      volume: 0,
    });
    expect(sources(h.ctx())).toHaveLength(0);
  });

  it("disconnects everything when playback ends", async () => {
    mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);
    await engine.preload();
    engine.play("chime");
    const ctx = h.ctx();
    const baseline = 1; // master -> destination

    expect(ctx.connections.size).toBe(baseline + 2);
    ctx.endAll();
    expect(ctx.connections.size).toBe(baseline);
  });

  it("does not fetch while muted", () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      enabled: false,
      sounds: {
        chime: sample(URL_A),
      },
    });
    createSoundEngine(h.options).play("chime");
    expect(fetch.calls).toHaveLength(0);
    expect(h.contexts).toHaveLength(0);
  });
});

describe("samples from an ArrayBuffer", () => {
  it("decodes a copy, leaving the caller's buffer intact", async () => {
    mockFetch();
    const original = bytes(9, 8, 7).buffer;
    const h = harness({
      sounds: {
        click: sample(original),
      },
    });
    const engine = createSoundEngine(h.options);

    await engine.preload();

    const ctx = h.ctx();
    expect(original.detached).toBe(false);
    expect(original.byteLength).toBe(3);
    expect(ctx.decoded).toHaveLength(1);
    expect(ctx.decoded[0]).not.toBe(original);
    expect([
      ...new Uint8Array(ctx.decoded[0] as ArrayBuffer),
    ]).toEqual([
      9,
      8,
      7,
    ]);

    engine.play("click");
    expect(sources(ctx)).toHaveLength(1);
  });

  it("can decode the same buffer again after re-registering", async () => {
    const original = bytes(1, 2).buffer;
    const h = harness();
    const engine = createSoundEngine(h.options);
    engine.register("click", sample(original));
    await engine.preload();
    engine.register("click", sample(original));
    await engine.preload();

    expect(h.ctx().decoded).toHaveLength(2);
    expect(h.errors).toHaveLength(0);
  });
});

describe("when samples start loading", () => {
  it("doesn't load anything before an AudioContext exists", () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness();
    const engine = createSoundEngine(h.options);
    engine.register("chime", sample(URL_A));

    expect(fetch.calls).toHaveLength(0);
    expect(h.contexts).toHaveLength(0);
  });

  it("loads every registered sample on unlock()", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
      [URL_B]: bytes(2),
    });
    const h = harness({
      sounds: {
        a: sample(URL_A),
        b: sample(URL_B),
      },
    });
    const engine = createSoundEngine(h.options);

    await engine.unlock();
    expect(fetch.calls.sort()).toEqual([
      URL_A,
      URL_B,
    ]);
    await settle();
    engine.play("a");
    engine.play("b");
    expect(sources(h.ctx())).toHaveLength(2);
  });

  it("loads on register() once the context exists", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness();
    const engine = createSoundEngine(h.options);
    await engine.unlock();

    engine.register("chime", sample(URL_A));
    expect(fetch.calls).toEqual([
      URL_A,
    ]);
  });

  it("reloads when a name is re-registered with another source", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
      [URL_B]: bytes(2, 2),
    });
    const h = harness();
    const engine = createSoundEngine(h.options);
    await engine.unlock();
    engine.register("chime", sample(URL_A));
    await settle();

    engine.register("chime", sample(URL_B));
    engine.play("chime");
    expect(sources(h.ctx())).toHaveLength(0);
    await settle();
    engine.play("chime");

    expect(fetch.calls).toEqual([
      URL_A,
      URL_B,
    ]);
    expect(sources(h.ctx())[0]?.buffer?.length).toBe(2);
  });

  it("drops the cache on unregister()", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);
    await engine.preload();

    engine.unregister("chime");
    engine.play("chime");
    expect(h.errors[0]?.reason).toBe("unknown-sound");

    engine.register("chime", sample(URL_A));
    await settle();
    expect(fetch.calls).toHaveLength(2);
  });
});

describe("preload()", () => {
  it("resolves once the samples are decoded, so play is immediate", async () => {
    mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);

    await engine.preload([
      "chime",
    ]);
    engine.play("chime");
    expect(sources(h.ctx())).toHaveLength(1);
  });

  it("only loads the requested names", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
      [URL_B]: bytes(1),
    });
    const h = harness();
    const engine = createSoundEngine(h.options);
    engine.register("a", sample(URL_A));
    engine.register("b", sample(URL_B));

    await engine.preload([
      "b",
    ]);
    // Creating the context also starts loading the other samples.
    expect(fetch.calls).toContain(URL_B);
  });

  it("ignores synthesized sounds without creating a context", async () => {
    const h = harness();
    await createSoundEngine(h.options).preload([
      "tick",
    ]);
    await createSoundEngine(h.options).preload();
    expect(h.contexts).toHaveLength(0);
  });

  it("reports unknown names", async () => {
    const h = harness();
    await createSoundEngine(h.options).preload([
      "nope",
    ]);
    expect(h.errors[0]?.reason).toBe("unknown-sound");
    expect(h.errors[0]?.sound).toBe("nope");
  });

  it("is a no-op on the server", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
    });
    setGlobal("window");
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    await createSoundEngine(h.options).preload();
    expect(fetch.calls).toHaveLength(0);
    expect(h.contexts).toHaveLength(0);
  });

  it("reports audio-unavailable when the context can't be created", async () => {
    const errors: SoundPlaybackError[] = [];
    const engine = createSoundEngine({
      audioContextFactory() {
        throw new Error("blocked");
      },
      onError: (error) => errors.push(error),
      sounds: {
        chime: sample(URL_A),
      },
    });
    await expect(engine.preload()).resolves.toBeUndefined();
    expect(errors[0]?.reason).toBe("audio-unavailable");
  });

  it("never rejects and retries failed samples", async () => {
    const fetch = mockFetch({
      [URL_A]: 500,
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);

    await expect(engine.preload()).resolves.toBeUndefined();
    expect(h.errors).toHaveLength(1);

    fetch.routes.set(URL_A, bytes(1));
    await engine.preload();
    engine.play("chime");

    expect(fetch.calls).toHaveLength(2);
    expect(sources(h.ctx())).toHaveLength(1);
  });
});

describe("sample errors", () => {
  it("reports an HTTP error status as sample-load-failed", async () => {
    mockFetch({
      [URL_A]: 404,
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);

    engine.play("chime");
    await settle();

    expect(h.errors).toHaveLength(1);
    const [error] = h.errors;
    expect(error?.reason).toBe("sample-load-failed");
    expect(error?.sound).toBe("chime");
    expect(error?.message).toBe(
      `Failed to play sound "chime": HTTP 404 Not Found while fetching ${URL_A}`,
    );
  });

  it("reports a network failure as sample-load-failed with its cause", async () => {
    const cause = new TypeError("Failed to fetch");
    mockFetch({
      [URL_A]: cause,
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    await createSoundEngine(h.options).preload();

    expect(h.errors[0]?.reason).toBe("sample-load-failed");
    expect(h.errors[0]?.cause).toBe(cause);
  });

  it("reports a missing fetch as sample-load-failed", async () => {
    setGlobal("fetch");
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    await createSoundEngine(h.options).preload();

    expect(h.errors[0]?.reason).toBe("sample-load-failed");
    expect(h.errors[0]?.message).toBe(
      'Failed to play sound "chime": fetch is not available',
    );
  });

  it("reports a decode failure as sample-decode-failed", async () => {
    mockFetch({
      [URL_A]: bytes(1),
    });
    const cause = new DOMException("Unable to decode audio data");
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine({
      ...h.options,
      audioContextFactory() {
        const ctx = createFakeAudioContext();
        ctx.decodeImpl = () => Promise.reject(cause);
        h.contexts.push(ctx);
        return ctx.asReal();
      },
    });

    await engine.preload();

    expect(h.errors[0]?.reason).toBe("sample-decode-failed");
    expect(h.errors[0]?.cause).toBe(cause);
    expect(h.errors[0]?.message).toBe(
      'Failed to play sound "chime": Unable to decode audio data',
    );
  });

  it("reports a failed sample on each play without refetching", async () => {
    const fetch = mockFetch({
      [URL_A]: 404,
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);
    await engine.preload();

    expect(() => engine.play("chime")).not.toThrow();
    engine.play("chime");

    expect(fetch.calls).toHaveLength(1);
    expect(h.errors).toHaveLength(3);
    expect(h.errors.every((e) => e.reason === "sample-load-failed")).toBe(true);
  });

  it("doesn't report failures of a context disposed mid-load", async () => {
    mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine({
      ...h.options,
      audioContextFactory() {
        const ctx = createFakeAudioContext();
        ctx.decodeImpl = () =>
          Promise.reject(new DOMException("context closed"));
        h.contexts.push(ctx);
        return ctx.asReal();
      },
    });

    engine.play("chime");
    engine.dispose();
    await settle();

    expect(h.errors).toHaveLength(0);
  });
});

describe("samples across dispose()", () => {
  it("keeps decoded buffers cached for the next context", async () => {
    const fetch = mockFetch({
      [URL_A]: bytes(1),
    });
    const h = harness({
      sounds: {
        chime: sample(URL_A),
      },
    });
    const engine = createSoundEngine(h.options);
    await engine.preload();

    engine.dispose();
    engine.play("chime");

    expect(h.contexts).toHaveLength(2);
    expect(fetch.calls).toHaveLength(1);
    expect(sources(h.ctx())).toHaveLength(1);
  });
});

describe("sample validation", () => {
  it.each([
    [
      "an unknown type",
      {
        src: URL_A,
        type: "stream",
      },
      '`type` must be "sample" (or omitted for synthesized sounds)',
    ],
    [
      "an empty URL",
      {
        src: " ",
        type: "sample",
      },
      "sample `src` must be a non-empty URL string or an ArrayBuffer",
    ],
    [
      "a non-string, non-ArrayBuffer src",
      {
        src: 42,
        type: "sample",
      },
      "sample `src` must be a non-empty URL string or an ArrayBuffer",
    ],
    [
      "a missing src",
      {
        type: "sample",
      },
      "sample `src` must be a non-empty URL string or an ArrayBuffer",
    ],
  ])("register() rejects %s", (_label, sound, reason) => {
    const engine = createSoundEngine();
    let thrown: unknown;
    try {
      engine.register("bad", sound as unknown as SoundDefinition);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidSoundError);
    expect((thrown as InvalidSoundError).message).toBe(
      `Invalid sound "bad": ${reason}`,
    );
  });

  it("validates samples given through options", () => {
    expect(() =>
      createSoundEngine({
        sounds: {
          bad: {
            src: "",
            type: "sample",
          },
        },
      }),
    ).toThrow(InvalidSoundError);
  });
});
