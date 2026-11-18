import { describe, expect, it, spyOn } from "bun:test";
import { act, render, renderHook } from "@testing-library/react";
import type {
  SoundDefinition,
  SoundEngine,
  SoundPlaybackError,
} from "@usesounds/core";
import { type ReactNode, StrictMode } from "react";
import {
  createFakeAudioContext,
  type FakeAudioContext,
  type FakeAudioContextState,
} from "../../core/tests/fake-audio-context.js";
import {
  MissingSoundProviderError,
  SoundProvider,
  type SoundProviderProps,
  useSoundEngine,
} from "../src/index.js";

type Audio = {
  contexts: FakeAudioContext[];
  factory: () => AudioContext;
};

function fakeAudio(state: FakeAudioContextState = "running"): Audio {
  const contexts: FakeAudioContext[] = [];
  return {
    contexts,
    factory() {
      const ctx = createFakeAudioContext({
        state,
      });
      contexts.push(ctx);
      return ctx.asReal();
    },
  };
}

/** Captures the engine of the closest provider. */
function EngineProbe({
  onEngine,
}: {
  onEngine: (engine: SoundEngine) => void;
}): ReactNode {
  onEngine(useSoundEngine());
  return null;
}

function oscillators(audio: Audio): number {
  return audio.contexts.reduce(
    (count, ctx) => count + ctx.nodesOf("oscillator").length,
    0,
  );
}

function pointerDown(target: Element): void {
  act(() => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
      }),
    );
  });
}

function button(container: HTMLElement, sound = "tick"): Element {
  const element = container.querySelector(`[data-sound="${sound}"]`);
  if (element === null) {
    throw new Error(`No [data-sound="${sound}"] element`);
  }
  return element;
}

function Tree(
  props: SoundProviderProps & {
    audio: Audio;
  },
): ReactNode {
  const { audio, children, ...rest } = props;
  return (
    <SoundProvider
      audioContextFactory={audio.factory}
      {...rest}
    >
      <button
        data-sound="tick"
        type="button"
      >
        Save
      </button>
      {children}
    </SoundProvider>
  );
}

describe("useSoundEngine", () => {
  it("throws MissingSoundProviderError outside a provider", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {
      // React logs render errors; keep the output clean.
    });
    let thrown: unknown;
    try {
      renderHook(() => useSoundEngine());
    } catch (error) {
      thrown = error;
    }
    consoleError.mockRestore();

    expect(thrown).toBeInstanceOf(MissingSoundProviderError);
    const error = thrown as MissingSoundProviderError;
    expect(error.name).toBe("MissingSoundProviderError");
    expect(error.code).toBe("MISSING_SOUND_PROVIDER");
    expect(error.hook).toBe("useSoundEngine");
    expect(error.message).toBe(
      "useSoundEngine() must be used inside a <SoundProvider>. Wrap your app (or this part of the tree) in <SoundProvider> from @usesounds/react.",
    );
  });

  it("returns a stable engine across re-renders", () => {
    const engines: SoundEngine[] = [];
    const audio = fakeAudio();
    const { rerender } = render(
      <Tree
        audio={audio}
        volume={0.5}
      >
        <EngineProbe onEngine={(engine) => engines.push(engine)} />
      </Tree>,
    );
    rerender(
      <Tree
        audio={audio}
        volume={0.2}
      >
        <EngineProbe onEngine={(engine) => engines.push(engine)} />
      </Tree>,
    );

    expect(engines.length).toBeGreaterThanOrEqual(2);
    expect(new Set(engines).size).toBe(1);
  });

  it("creates no AudioContext on render (SSR-safe, lazy)", () => {
    const audio = fakeAudio();
    render(<Tree audio={audio} />);
    expect(audio.contexts).toHaveLength(0);
  });
});

describe("prop sync", () => {
  it("applies the initial props", () => {
    const audio = fakeAudio();
    const { container } = render(
      <Tree
        audio={audio}
        volume={0.3}
      />,
    );

    pointerDown(button(container));

    const master = audio.contexts[0]?.nodesOf("gain")[0];
    expect(master?.gain?.value).toBe(0.3);
  });

  it("syncs enabled, volume and respectReducedMotion through the setters", () => {
    const audio = fakeAudio();
    let engine: SoundEngine | undefined;
    const probe = (
      <EngineProbe
        onEngine={(value) => {
          engine = value;
        }}
      />
    );
    const { rerender } = render(<Tree audio={audio}>{probe}</Tree>);
    if (engine === undefined) {
      throw new Error("no engine");
    }
    const setEnabled = spyOn(engine, "setEnabled");
    const setVolume = spyOn(engine, "setVolume");
    const setRespect = spyOn(engine, "setRespectReducedMotion");

    rerender(
      <Tree
        audio={audio}
        enabled={false}
        respectReducedMotion={false}
        volume={0.25}
      >
        {probe}
      </Tree>,
    );

    expect(setEnabled).toHaveBeenLastCalledWith(false);
    expect(setVolume).toHaveBeenLastCalledWith(0.25);
    expect(setRespect).toHaveBeenLastCalledWith(false);
  });

  it("stops and resumes playing when enabled changes", () => {
    const audio = fakeAudio();
    const { container, rerender } = render(
      <Tree
        audio={audio}
        enabled={false}
      />,
    );

    pointerDown(button(container));
    expect(audio.contexts).toHaveLength(0);

    rerender(
      <Tree
        audio={audio}
        enabled
      />,
    );
    pointerDown(button(container));
    expect(oscillators(audio)).toBeGreaterThan(0);
  });

  it("calls the latest onError without recreating the engine", () => {
    const audio = fakeAudio();
    const first: SoundPlaybackError[] = [];
    const second: SoundPlaybackError[] = [];
    const engines: SoundEngine[] = [];
    const probe = <EngineProbe onEngine={(engine) => engines.push(engine)} />;
    const { rerender } = render(
      <Tree
        audio={audio}
        onError={(error) => first.push(error)}
      >
        {probe}
      </Tree>,
    );
    rerender(
      <Tree
        audio={audio}
        onError={(error) => second.push(error)}
      >
        {probe}
      </Tree>,
    );

    engines.at(-1)?.play("nope");

    expect(new Set(engines).size).toBe(1);
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
    expect(second[0]?.reason).toBe("unknown-sound");
  });
});

describe("sounds prop", () => {
  const chime: SoundDefinition = {
    voices: [
      {
        duration: 0.05,
        frequency: 1000,
        waveform: "sine",
      },
    ],
  };
  const bell: SoundDefinition = {
    voices: [
      {
        duration: 0.05,
        frequency: 2000,
        waveform: "sine",
      },
    ],
  };

  it("registers the initial sounds", () => {
    const audio = fakeAudio();
    const { container } = render(
      <Tree
        audio={audio}
        sounds={{
          chime,
        }}
      >
        <button
          data-sound="chime"
          type="button"
        >
          Chime
        </button>
      </Tree>,
    );

    pointerDown(button(container, "chime"));

    const frequency = audio.contexts[0]?.nodesOf("oscillator")[0]?.frequency;
    expect(frequency?.calls[0]?.value).toBe(1000);
  });

  it("registers changed definitions and unregisters removed ones", () => {
    const audio = fakeAudio();
    let engine: SoundEngine | undefined;
    const probe = (
      <EngineProbe
        onEngine={(value) => {
          engine = value;
        }}
      />
    );
    const { rerender } = render(
      <Tree
        audio={audio}
        sounds={{
          chime,
        }}
      >
        {probe}
      </Tree>,
    );
    if (engine === undefined) {
      throw new Error("no engine");
    }
    const register = spyOn(engine, "register");
    const unregister = spyOn(engine, "unregister");

    // A new object with the same definitions: nothing to do.
    rerender(
      <Tree
        audio={audio}
        sounds={{
          chime,
        }}
      >
        {probe}
      </Tree>,
    );
    expect(register).not.toHaveBeenCalled();

    rerender(
      <Tree
        audio={audio}
        sounds={{
          bell,
          chime: bell,
        }}
      >
        {probe}
      </Tree>,
    );
    expect(register.mock.calls.map(([name]) => name).sort()).toEqual([
      "bell",
      "chime",
    ]);

    rerender(
      <Tree
        audio={audio}
        sounds={{
          bell,
        }}
      >
        {probe}
      </Tree>,
    );
    expect(unregister).toHaveBeenCalledWith("chime");
    expect(engine.has("chime")).toBe(false);
    expect(engine.has("bell")).toBe(true);
  });

  it("restores a preset when its override is removed", () => {
    const audio = fakeAudio();
    let engine: SoundEngine | undefined;
    const probe = (
      <EngineProbe
        onEngine={(value) => {
          engine = value;
        }}
      />
    );
    const { rerender } = render(
      <Tree
        audio={audio}
        sounds={{
          tick: chime,
        }}
      >
        {probe}
      </Tree>,
    );

    rerender(<Tree audio={audio}>{probe}</Tree>);

    expect(engine?.has("tick")).toBe(true);
    engine?.play("tick");
    const frequency = audio.contexts[0]?.nodesOf("oscillator")[0]?.frequency;
    expect(frequency?.calls[0]?.value).toBe(1800);
  });
});

describe("declarative", () => {
  it("plays data-sound attributes by default", () => {
    const audio = fakeAudio();
    const { container } = render(<Tree audio={audio} />);

    pointerDown(button(container));

    expect(oscillators(audio)).toBeGreaterThan(0);
  });

  it("only unlocks when declarative={false}", async () => {
    const audio = fakeAudio("suspended");
    const { container } = render(
      <Tree
        audio={audio}
        declarative={false}
      />,
    );

    pointerDown(button(container));
    await act(() => Promise.resolve());

    expect(audio.contexts).toHaveLength(1);
    expect(audio.contexts[0]?.resumeCalls).toBe(1);
    expect(oscillators(audio)).toBe(0);
  });

  it("rebinds when declarative changes", () => {
    const audio = fakeAudio();
    const { container, rerender } = render(
      <Tree
        audio={audio}
        declarative={false}
      />,
    );
    pointerDown(button(container));
    expect(oscillators(audio)).toBe(0);

    rerender(
      <Tree
        audio={audio}
        declarative
      />,
    );
    pointerDown(button(container));
    expect(oscillators(audio)).toBeGreaterThan(0);

    const before = oscillators(audio);
    rerender(
      <Tree
        audio={audio}
        declarative={false}
      />,
    );
    pointerDown(button(container));
    expect(oscillators(audio)).toBe(before);
  });
});

describe("lifecycle", () => {
  it("unbinds and disposes on unmount", () => {
    const audio = fakeAudio();
    let engine: SoundEngine | undefined;
    const { container, unmount } = render(
      <Tree audio={audio}>
        <EngineProbe
          onEngine={(value) => {
            engine = value;
          }}
        />
      </Tree>,
    );
    pointerDown(button(container));
    expect(audio.contexts).toHaveLength(1);
    if (engine === undefined) {
      throw new Error("no engine");
    }
    const dispose = spyOn(engine, "dispose");
    const orphan = document.createElement("button");
    orphan.setAttribute("data-sound", "tick");
    document.body.append(orphan);

    unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
    const master = audio.contexts[0]?.nodesOf("gain")[0];
    const connected = [
      ...(audio.contexts[0]?.connections ?? []),
    ].some(([from]) => from === master);
    expect(connected).toBe(false);

    const before = oscillators(audio);
    pointerDown(orphan);
    orphan.remove();
    expect(oscillators(audio)).toBe(before);
    expect(audio.contexts).toHaveLength(1);
  });

  it("works under StrictMode (one binding, engine reusable)", () => {
    const audio = fakeAudio();
    const errors: SoundPlaybackError[] = [];
    const { container } = render(
      <StrictMode>
        <Tree
          audio={audio}
          onError={(error) => errors.push(error)}
        />
      </StrictMode>,
    );

    pointerDown(button(container));
    const afterFirst = oscillators(audio);
    pointerDown(button(container));

    expect(afterFirst).toBeGreaterThan(0);
    // Exactly one binding plays: the second click adds as many nodes as the first.
    expect(oscillators(audio)).toBe(afterFirst * 2);
    expect(errors).toHaveLength(0);
  });
});

describe("nested providers", () => {
  it("the innermost provider plays, and the outer one again once it unmounts", () => {
    const outer = fakeAudio();
    const inner = fakeAudio();
    function App({ showInner }: { showInner: boolean }): ReactNode {
      return (
        <SoundProvider audioContextFactory={outer.factory}>
          <button
            data-sound="tick"
            type="button"
          >
            Outer
          </button>
          {showInner ? (
            <SoundProvider audioContextFactory={inner.factory}>
              <button
                data-sound="pop"
                type="button"
              >
                Inner
              </button>
            </SoundProvider>
          ) : null}
        </SoundProvider>
      );
    }
    const { container, rerender } = render(<App showInner />);

    pointerDown(button(container, "pop"));
    expect(oscillators(inner)).toBeGreaterThan(0);
    // The outer engine is unlocked by the gesture but doesn't play.
    expect(oscillators(outer)).toBe(0);

    rerender(<App showInner={false} />);
    pointerDown(button(container, "tick"));
    expect(oscillators(outer)).toBeGreaterThan(0);
  });

  it("gives each provider its own engine", () => {
    const engines: SoundEngine[] = [];
    render(
      <SoundProvider>
        <EngineProbe onEngine={(engine) => engines.push(engine)} />
        <SoundProvider>
          <EngineProbe onEngine={(engine) => engines.push(engine)} />
        </SoundProvider>
      </SoundProvider>,
    );

    expect(new Set(engines).size).toBe(2);
  });
});
