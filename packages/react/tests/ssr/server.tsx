/**
 * Runs in a separate `bun` process with no DOM preload (see `../ssr.test.ts`),
 * like a server runtime: no `window`, `document`, `AudioContext` or
 * `matchMedia`. Prints a JSON report on stdout.
 */
import type { ReactNode } from "react";

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

const { SoundProvider, presetNames, useSound, useSoundEngine } = await import(
  "../../src/index.js"
);
const { renderToString } = await import("react-dom/server");

const sounds = {
  chime: {
    src: "/sounds/chime.mp3",
    type: "sample",
  },
} as const;

let factoryCalls = 0;
const errors: string[] = [];

function SaveButton(): ReactNode {
  const play = useSound("tick", {
    volume: 0.5,
  });
  const chime = useSound("chime");
  const engine = useSoundEngine();
  // Playing during render is a mistake, but must still be a server no-op.
  play();
  chime({
    pitch: 2,
  });
  void engine.preload();
  return (
    <button
      data-sound="tick"
      onClick={() => play()}
      type="button"
    >
      Save
    </button>
  );
}

const html = renderToString(
  <SoundProvider
    audioContextFactory={() => {
      factoryCalls += 1;
      throw new Error("AudioContext created on the server");
    }}
    onError={(error) => errors.push(error.message)}
    sounds={sounds}
    volume={0.4}
  >
    <SaveButton />
    <SoundProvider declarative={false}>
      <button
        data-sound="pop"
        type="button"
      >
        Delete
      </button>
    </SoundProvider>
    <ul>
      {presetNames.map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  </SoundProvider>,
);

// Let any stray promise (preload, unlock) settle before reporting.
await new Promise((resolve) => setTimeout(resolve, 0));

console.log(
  JSON.stringify({
    accessed,
    environment,
    errors,
    factoryCalls,
    html,
  }),
);
