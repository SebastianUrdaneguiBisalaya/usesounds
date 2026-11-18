import { describe, expect, it, spyOn } from "bun:test";
import { renderHook } from "@testing-library/react";
import type {
  SoundEngine,
  SoundPlayOptions,
  SynthSound,
} from "@usesounds/core";
import type { ReactNode } from "react";
import {
  createFakeAudioContext,
  type FakeAudioContext,
} from "../../core/tests/fake-audio-context.js";
import {
  MissingSoundProviderError,
  type PlaySound,
  SoundProvider,
  useSound,
  useSoundEngine,
} from "../src/index.js";

const chime: SynthSound = {
  voices: [
    {
      duration: 0.05,
      frequency: 777,
      waveform: "sine",
    },
  ],
};

const sounds = {
  chime,
};

type Setup = {
  contexts: FakeAudioContext[];
  wrapper: (props: { children: ReactNode }) => ReactNode;
};

function setup(): Setup {
  const contexts: FakeAudioContext[] = [];
  const factory = (): AudioContext => {
    const ctx = createFakeAudioContext({
      state: "running",
    });
    contexts.push(ctx);
    return ctx.asReal();
  };
  return {
    contexts,
    wrapper: ({ children }) => (
      <SoundProvider
        audioContextFactory={factory}
        sounds={sounds}
      >
        {children}
      </SoundProvider>
    ),
  };
}

function oscillatorFrequencies(contexts: FakeAudioContext[]): number[] {
  return contexts.flatMap((ctx) =>
    ctx
      .nodesOf("oscillator")
      .map((node) => node.frequency?.calls[0]?.value ?? Number.NaN),
  );
}

type HookProps = {
  name: string;
  options?: SoundPlayOptions;
};

/** Renders `useSound` with a spy on the provider engine's `play`. */
function renderWithSpy(initialProps: HookProps) {
  const { wrapper } = setup();
  const result = renderHook(
    ({ name, options }: HookProps) => ({
      engine: useSoundEngine(),
      play: useSound(name, options),
    }),
    {
      initialProps,
      wrapper,
    },
  );
  const engine: SoundEngine = result.result.current.engine;
  const spy = spyOn(engine, "play");
  return {
    ...result,
    spy,
  };
}

describe("useSound", () => {
  it("plays a preset", () => {
    const { contexts, wrapper } = setup();
    const { result } = renderHook(() => useSound("tick"), {
      wrapper,
    });

    result.current();

    expect(oscillatorFrequencies(contexts)).toEqual([
      1800,
    ]);
  });

  it("plays a sound registered on the provider", () => {
    const { contexts, wrapper } = setup();
    const { result } = renderHook(() => useSound("chime"), {
      wrapper,
    });

    result.current();

    expect(oscillatorFrequencies(contexts)).toEqual([
      777,
    ]);
  });

  it("applies the hook's pitch to playback", () => {
    const { contexts, wrapper } = setup();
    const { result } = renderHook(
      () =>
        useSound("chime", {
          pitch: 2,
        }),
      {
        wrapper,
      },
    );

    result.current();

    expect(oscillatorFrequencies(contexts)).toEqual([
      1554,
    ]);
  });

  it("does not throw for an unknown sound", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSound("missing"), {
      wrapper,
    });

    expect(() => result.current()).not.toThrow();
  });

  it("keeps play stable while name and option values don't change", () => {
    const { result, rerender } = renderHook(
      ({ name, options }: HookProps) => useSound(name, options),
      {
        initialProps: {
          name: "tick",
          options: {
            pitch: 1.2,
            volume: 0.5,
          },
        } as HookProps,
        wrapper: setup().wrapper,
      },
    );
    const first: PlaySound = result.current;

    // New options object with the same values.
    rerender({
      name: "tick",
      options: {
        pitch: 1.2,
        volume: 0.5,
      },
    });
    expect(result.current).toBe(first);

    rerender({
      name: "tick",
      options: {
        pitch: 1.2,
        volume: 0.3,
      },
    });
    expect(result.current).not.toBe(first);
    const second = result.current;

    rerender({
      name: "pop",
      options: {
        pitch: 1.2,
        volume: 0.3,
      },
    });
    expect(result.current).not.toBe(second);
  });

  it("plays with the latest name and options after a change", () => {
    const { result, rerender, spy } = renderWithSpy({
      name: "tick",
      options: {
        volume: 0.5,
      },
    });

    rerender({
      name: "pop",
      options: {
        pitch: 2,
      },
    });
    result.current.play();

    expect(spy).toHaveBeenLastCalledWith("pop", {
      pitch: 2,
    });
  });

  it("passes empty options when there are no options or overrides", () => {
    const { result, spy } = renderWithSpy({
      name: "tick",
    });

    result.current.play();

    expect(spy).toHaveBeenLastCalledWith("tick", {});
  });

  it("uses the hook's options when there are no overrides", () => {
    const { result, spy } = renderWithSpy({
      name: "tick",
      options: {
        pitch: 1.5,
        volume: 0.4,
      },
    });

    result.current.play();

    expect(spy).toHaveBeenLastCalledWith("tick", {
      pitch: 1.5,
      volume: 0.4,
    });
  });

  it("merges per-call overrides over the hook's options field by field", () => {
    const { result, spy } = renderWithSpy({
      name: "tick",
      options: {
        pitch: 1.5,
        volume: 0.4,
      },
    });

    result.current.play({
      volume: 0.9,
    });
    expect(spy).toHaveBeenLastCalledWith("tick", {
      pitch: 1.5,
      volume: 0.9,
    });

    result.current.play({
      pitch: 0.5,
    });
    expect(spy).toHaveBeenLastCalledWith("tick", {
      pitch: 0.5,
      volume: 0.4,
    });

    result.current.play({
      pitch: 2,
      volume: 0,
    });
    expect(spy).toHaveBeenLastCalledWith("tick", {
      pitch: 2,
      volume: 0,
    });
  });

  it("uses overrides alone when the hook has no options", () => {
    const { result, spy } = renderWithSpy({
      name: "chime",
    });

    result.current.play({
      volume: 0.2,
    });

    expect(spy).toHaveBeenLastCalledWith("chime", {
      volume: 0.2,
    });
  });

  it("throws MissingSoundProviderError outside a provider", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {
      // React logs render errors; keep the output clean.
    });
    let thrown: unknown;
    try {
      renderHook(() => useSound("tick"));
    } catch (error) {
      thrown = error;
    }
    consoleError.mockRestore();

    expect(thrown).toBeInstanceOf(MissingSoundProviderError);
    const error = thrown as MissingSoundProviderError;
    expect(error.code).toBe("MISSING_SOUND_PROVIDER");
    expect(error.hook).toBe("useSound");
    expect(error.message).toStartWith(
      "useSound() must be used inside a <SoundProvider>.",
    );
  });
});

describe("re-exports", () => {
  it("exposes core values consumers need without importing core", async () => {
    const react = await import("../src/index.js");
    const core = await import("@usesounds/core");

    expect(react.presetNames).toBe(core.presetNames);
    expect(react.InvalidSoundError).toBe(core.InvalidSoundError);
    expect(react.SoundPlaybackError).toBe(core.SoundPlaybackError);
    expect(react.UsesoundsError).toBe(core.UsesoundsError);
  });
});
