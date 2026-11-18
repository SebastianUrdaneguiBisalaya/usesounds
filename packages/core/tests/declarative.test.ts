import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  bindDeclarativeListener,
  bindUnlockListener,
  type DeclarativeTarget,
} from "../src/declarative.js";
import type { SoundPlayOptions } from "../src/engine.js";
import { createSoundEngine } from "../src/index.js";
import {
  createFakeAudioContext,
  type FakeAudioContext,
} from "./fake-audio-context.js";
import { restoreGlobals, setGlobal, setReducedMotion } from "./globals.js";

type Recorder = DeclarativeTarget & {
  plays: [
    string,
    SoundPlayOptions | undefined,
  ][];
  unlocks: number;
};

function recorder(): Recorder {
  const rec: Recorder = {
    play(name, options) {
      rec.plays.push([
        name,
        options,
      ]);
    },
    plays: [],
    unlock() {
      rec.unlocks++;
      return Promise.resolve();
    },
    unlocks: 0,
  };
  return rec;
}

function names(rec: Recorder): string[] {
  return rec.plays.map(([name]) => name);
}

let root: HTMLElement;
const unbinds: (() => void)[] = [];

function track(unbind: () => void): () => void {
  unbinds.push(unbind);
  return unbind;
}

function mount(html: string): void {
  root.innerHTML = html;
}

function el(selector: string): Element {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new Error(`No element matches ${selector}`);
  }
  return element;
}

function pointerDown(target: Element, button = 0): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button,
      cancelable: true,
    }),
  );
}

function keyDown(target: Element, key: string, repeat = false): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
      repeat,
    }),
  );
}

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  for (const unbind of unbinds.splice(0)) {
    unbind();
  }
  root.remove();
  restoreGlobals();
});

describe("pointer activation", () => {
  it("plays the data-sound of the target on primary pointerdown", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<button data-sound="tick">Save</button>');

    pointerDown(el("button"));

    expect(names(rec)).toEqual([
      "tick",
    ]);
  });

  it("uses the closest [data-sound] ancestor of a nested target", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount(
      '<div data-sound="pop"><button data-sound="tick"><span><b>Save</b></span></button><i>other</i></div>',
    );

    pointerDown(el("b"));
    pointerDown(el("i"));

    expect(names(rec)).toEqual([
      "tick",
      "pop",
    ]);
  });

  it("ignores non-primary buttons", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<button data-sound="tick">Save</button>');

    pointerDown(el("button"), 2);
    pointerDown(el("button"), 1);

    expect(rec.plays).toHaveLength(0);
  });

  it("ignores elements without data-sound or with an empty value", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<button id="a">A</button><button id="b" data-sound="  ">B</button>');

    pointerDown(el("#a"));
    pointerDown(el("#b"));

    expect(rec.plays).toHaveLength(0);
  });

  it("only handles events inside its root", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    const outside = document.createElement("button");
    outside.setAttribute("data-sound", "tick");
    document.body.append(outside);

    pointerDown(outside);
    outside.remove();

    expect(rec.plays).toHaveLength(0);
  });

  it("still runs when a handler stops propagation (capture phase)", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<button data-sound="tick">Save</button>');
    el("button").addEventListener("pointerdown", (event) =>
      event.stopPropagation(),
    );

    pointerDown(el("button"));

    expect(names(rec)).toEqual([
      "tick",
    ]);
  });
});

describe("keyboard activation", () => {
  it("plays on Enter on a focused [data-sound] element", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<a href="#" data-sound="tap">Link</a>');

    keyDown(el("a"), "Enter");

    expect(names(rec)).toEqual([
      "tap",
    ]);
  });

  it("doesn't play on Enter inside a [data-sound] container", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<form data-sound="pop"><input type="text" /></form>');

    keyDown(el("input"), "Enter");

    expect(rec.plays).toHaveLength(0);
  });

  it.each([
    '<button data-sound="toggle">x</button>',
    '<div role="button" tabindex="0" data-sound="toggle">x</div>',
    '<div role="switch" tabindex="0" data-sound="toggle">x</div>',
    '<span role="checkbox" tabindex="0" data-sound="toggle">x</span>',
    '<input type="checkbox" data-sound="toggle" />',
    '<input type="radio" data-sound="toggle" />',
    '<input type="submit" data-sound="toggle" />',
  ])("plays on Space for %s", (html) => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount(html);

    keyDown(el("[data-sound]"), " ");

    expect(names(rec)).toEqual([
      "toggle",
    ]);
  });

  it.each([
    '<a href="#" data-sound="tap">x</a>',
    '<div tabindex="0" data-sound="tap">x</div>',
    '<input type="text" data-sound="tap" />',
  ])("doesn't play on Space for %s", (html) => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount(html);

    keyDown(el("[data-sound]"), " ");

    expect(rec.plays).toHaveLength(0);
  });

  it("ignores repeated keys", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<button data-sound="tick">x</button>');

    keyDown(el("button"), "Enter", true);
    keyDown(el("button"), " ", true);

    expect(rec.plays).toHaveLength(0);
  });

  it("ignores other keys", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<button data-sound="tick">x</button>');

    keyDown(el("button"), "a");
    keyDown(el("button"), "Tab");

    expect(rec.plays).toHaveLength(0);
  });
});

describe("disabled elements", () => {
  it.each([
    [
      "disabled button",
      '<button disabled data-sound="tick"><span>x</span></button>',
    ],
    [
      "aria-disabled",
      '<div role="button" aria-disabled="true" data-sound="tick"><span>x</span></div>',
    ],
    [
      "inside a disabled fieldset",
      '<fieldset disabled><button data-sound="tick"><span>x</span></button></fieldset>',
    ],
    [
      "inside an aria-disabled group",
      '<div aria-disabled="true"><button data-sound="tick"><span>x</span></button></div>',
    ],
  ])("don't play: %s", (_label, html) => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount(html);

    pointerDown(el("span"));
    keyDown(el("[data-sound]"), "Enter");

    expect(rec.plays).toHaveLength(0);
  });

  it("doesn't play for a disabled control inside a [data-sound] wrapper", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount(
      '<div data-sound="tick"><button disabled><span>x</span></button><i>ok</i></div>',
    );

    pointerDown(el("span"));
    expect(rec.plays).toHaveLength(0);

    pointerDown(el("i"));
    expect(rec.plays).toHaveLength(1);
  });

  it("plays with aria-disabled='false'", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<button aria-disabled="false" data-sound="tick">x</button>');

    pointerDown(el("button"));

    expect(rec.plays).toHaveLength(1);
  });
});

describe("per-element overrides", () => {
  it("passes data-sound-volume and data-sound-pitch", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount(
      '<button data-sound="tick" data-sound-volume="0.3" data-sound-pitch="1.5">x</button>',
    );

    pointerDown(el("button"));

    expect(rec.plays).toEqual([
      [
        "tick",
        {
          pitch: 1.5,
          volume: 0.3,
        },
      ],
    ]);
  });

  it("ignores missing or non-numeric overrides", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount(
      '<button data-sound="tick" data-sound-volume="loud" data-sound-pitch="">x</button>',
    );

    pointerDown(el("button"));

    expect(rec.plays).toEqual([
      [
        "tick",
        {},
      ],
    ]);
  });
});

describe("unlock", () => {
  it("unlocks on every pointer and keyboard gesture, even without data-sound", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount("<p>text</p>");

    pointerDown(el("p"));
    keyDown(el("p"), "a");
    pointerDown(el("p"), 2);

    expect(rec.unlocks).toBe(3);
    expect(rec.plays).toHaveLength(0);
  });

  it("bindUnlockListener unlocks without playing", () => {
    const rec = recorder();
    track(bindUnlockListener(root, rec));
    mount('<button data-sound="tick">x</button>');

    pointerDown(el("button"));

    expect(rec.unlocks).toBe(1);
    expect(rec.plays).toHaveLength(0);
  });

  it("unlocks each bound engine once per gesture", () => {
    const a = recorder();
    const b = recorder();
    track(bindDeclarativeListener(root, a));
    track(bindUnlockListener(root, a));
    track(bindUnlockListener(root, b));
    mount("<p>x</p>");

    pointerDown(el("p"));

    expect(a.unlocks).toBe(1);
    expect(b.unlocks).toBe(1);
  });
});

describe("nested engines", () => {
  it("only the most recently bound engine plays", () => {
    const outer = recorder();
    const inner = recorder();
    track(bindDeclarativeListener(root, outer));
    const unbindInner = track(bindDeclarativeListener(root, inner));
    mount('<button data-sound="tick">x</button>');

    pointerDown(el("button"));
    expect(names(inner)).toEqual([
      "tick",
    ]);
    expect(outer.plays).toHaveLength(0);

    unbindInner();
    pointerDown(el("button"));
    expect(names(outer)).toEqual([
      "tick",
    ]);
  });

  it("an unlock-only binding never takes over playback", () => {
    const player = recorder();
    const unlocker = recorder();
    track(bindDeclarativeListener(root, player));
    track(bindUnlockListener(root, unlocker));
    mount('<button data-sound="tick">x</button>');

    pointerDown(el("button"));

    expect(player.plays).toHaveLength(1);
    expect(unlocker.plays).toHaveLength(0);
  });
});

describe("listeners", () => {
  it("installs one listener set per root, however many bindings", () => {
    const add = spyOn(root, "addEventListener");
    const a = track(bindDeclarativeListener(root, recorder()));
    const b = track(bindDeclarativeListener(root, recorder()));
    const c = track(bindUnlockListener(root, recorder()));

    expect(add.mock.calls.map(([type]) => type)).toEqual([
      "pointerdown",
      "keydown",
    ]);
    expect(add.mock.calls.every(([, , options]) => options !== undefined)).toBe(
      true,
    );
    a();
    b();
    c();
    add.mockRestore();
  });

  it("removes the listeners when the last binding goes away", () => {
    const remove = spyOn(root, "removeEventListener");
    const rec = recorder();
    const a = track(bindDeclarativeListener(root, rec));
    const b = track(bindUnlockListener(root, rec));
    mount('<button data-sound="tick">x</button>');

    a();
    expect(remove).not.toHaveBeenCalled();
    b();
    expect(remove.mock.calls.map(([type]) => type)).toEqual([
      "pointerdown",
      "keydown",
    ]);

    pointerDown(el("button"));
    expect(rec.plays).toHaveLength(0);
    expect(rec.unlocks).toBe(0);
    remove.mockRestore();
  });

  it("unbind is idempotent", () => {
    const keep = recorder();
    track(bindDeclarativeListener(root, keep));
    const unbind = bindDeclarativeListener(root, recorder());
    unbind();
    unbind();
    mount('<button data-sound="tick">x</button>');

    pointerDown(el("button"));

    expect(keep.plays).toHaveLength(1);
  });

  it("binding the same engine twice and unbinding once keeps it bound", () => {
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    const second = bindDeclarativeListener(root, rec);
    second();
    mount('<button data-sound="tick">x</button>');

    pointerDown(el("button"));

    expect(rec.plays).toHaveLength(1);
  });

  it("can bind again after every binding was removed", () => {
    const first = bindDeclarativeListener(root, recorder());
    first();
    const rec = recorder();
    track(bindDeclarativeListener(root, rec));
    mount('<button data-sound="tick">x</button>');

    pointerDown(el("button"));

    expect(rec.plays).toHaveLength(1);
  });

  it("never lets a throwing engine break the app's handlers", () => {
    const rec = recorder();
    rec.play = () => {
      throw new Error("boom");
    };
    track(bindDeclarativeListener(root, rec));
    mount('<button data-sound="tick">x</button>');
    let appHandlerRan = false;
    el("button").addEventListener("pointerdown", () => {
      appHandlerRan = true;
    });

    expect(() => pointerDown(el("button"))).not.toThrow();
    expect(appHandlerRan).toBe(true);
  });
});

describe("engine.bindDeclarative / engine.bindUnlock", () => {
  function engineWithFake(state: "running" | "suspended" = "running") {
    const contexts: FakeAudioContext[] = [];
    const engine = createSoundEngine({
      audioContextFactory() {
        const ctx = createFakeAudioContext({
          state,
        });
        contexts.push(ctx);
        return ctx.asReal();
      },
    });
    return {
      contexts,
      engine,
    };
  }

  beforeEach(() => {
    setReducedMotion(false);
  });

  it("plays presets from data-sound through the engine", () => {
    const { engine, contexts } = engineWithFake();
    track(engine.bindDeclarative(root));
    mount('<button data-sound="tick" data-sound-pitch="2">x</button>');

    pointerDown(el("button"));

    const ctx = contexts[0];
    expect(ctx?.nodesOf("oscillator")[0]?.frequency?.calls[0]?.value).toBe(
      3600,
    );
  });

  it("defaults to document as root", () => {
    const { engine, contexts } = engineWithFake();
    track(engine.bindDeclarative());
    mount('<button data-sound="tick">x</button>');

    pointerDown(el("button"));

    expect(contexts[0]?.nodesOf("oscillator").length).toBeGreaterThan(0);
  });

  it("bindUnlock resumes a suspended context on the first gesture", async () => {
    const { engine, contexts } = engineWithFake("suspended");
    track(engine.bindUnlock(root));
    mount("<p>x</p>");

    keyDown(el("p"), "a");
    await Promise.resolve();

    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resumeCalls).toBe(1);
    expect(contexts[0]?.nodesOf("oscillator")).toHaveLength(0);
  });

  it("is a no-op on the server", () => {
    setGlobal("window");
    const { engine } = engineWithFake();
    const unbindDeclarative = engine.bindDeclarative();
    const unbindUnlock = engine.bindUnlock();
    expect(() => {
      unbindDeclarative();
      unbindUnlock();
    }).not.toThrow();
  });
});
