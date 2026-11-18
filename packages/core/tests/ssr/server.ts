/**
 * Runs in a separate `bun` process with no DOM preload (see `../ssr.test.ts`),
 * like a server runtime: no `window`, `document`, `AudioContext` or
 * `matchMedia`. Prints a JSON report on stdout.
 */

const accessed: string[] = [];
globalThis.fetch = Object.assign(
  (..._args: unknown[]) => {
    accessed.push("fetch");
    return Promise.reject(new Error("fetch called on the server"));
  },
  {
    preconnect: () => undefined,
  },
) as typeof fetch;

const environment = {
  AudioContext: typeof Reflect.get(globalThis, "AudioContext"),
  document: typeof document,
  matchMedia: typeof Reflect.get(globalThis, "matchMedia"),
  window: typeof window,
};

const core = await import("../../src/index.js");

let factoryCalls = 0;
const errors: string[] = [];
const engine = core.createSoundEngine({
  audioContextFactory: () => {
    factoryCalls += 1;
    throw new Error("AudioContext created on the server");
  },
  onError: (error) => errors.push(error.message),
  sounds: {
    chime: {
      src: "/sounds/chime.mp3",
      type: "sample",
    },
  },
});

engine.register("bytes", {
  src: new ArrayBuffer(8),
  type: "sample",
});
engine.play("tick");
engine.play("chime", {
  pitch: 1.5,
  volume: 0.5,
});
engine.play("missing");
engine.setEnabled(false);
engine.setVolume(0.3);
engine.setRespectReducedMotion(false);
await engine.preload();
await engine.unlock();
const unbindDeclarative = engine.bindDeclarative();
const unbindUnlock = engine.bindUnlock();
unbindDeclarative();
unbindUnlock();
engine.dispose();

console.log(
  JSON.stringify({
    accessed,
    environment,
    errors,
    exports: Object.keys(core).sort(),
    factoryCalls,
    names: engine.names(),
  }),
);
