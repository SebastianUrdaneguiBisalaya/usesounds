import type { SoundPlayOptions } from "./engine.js";

/** Where declarative listeners can be installed: a document, shadow root, or element. */
export type DeclarativeRoot = Document | DocumentFragment | Element;

/** What a binding needs from an engine. */
export type DeclarativeTarget = {
  play(name: string, options?: SoundPlayOptions): void;
  unlock(): Promise<void>;
};

type RootState = {
  /** Engines bound with `bindDeclarative`, most recent last (only it plays). */
  players: DeclarativeTarget[][];
  /** Every binding (declarative or unlock-only); all of them get unlocked. */
  unlockers: DeclarativeTarget[][];
  onPointerDown: (event: Event) => void;
  onKeyDown: (event: Event) => void;
};

const SOUND_ATTRIBUTE = "data-sound";
const VOLUME_ATTRIBUTE = "data-sound-volume";
const PITCH_ATTRIBUTE = "data-sound-pitch";

const SPACE_ROLES = new Set([
  "button",
  "switch",
  "checkbox",
  "radio",
  "menuitemcheckbox",
  "menuitemradio",
]);
const SPACE_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "image",
  "checkbox",
  "radio",
]);

const roots = new WeakMap<DeclarativeRoot, RootState>();

const LISTENER_OPTIONS: AddEventListenerOptions = {
  capture: true,
};

function asElement(target: EventTarget | null): Element | null {
  return target !== null &&
    typeof (target as Partial<Element>).closest === "function"
    ? (target as Element)
    : null;
}

/** Whether `element` or one of its ancestors is disabled. */
function isDisabled(element: Element): boolean {
  try {
    if (element.closest(":disabled") !== null) {
      return true;
    }
  } catch {
    // Selector unsupported: fall through to the explicit checks.
  }
  return (
    element.closest(
      'button[disabled], input[disabled], select[disabled], textarea[disabled], fieldset[disabled], [aria-disabled="true"]',
    ) !== null
  );
}

function activatesWithSpace(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === "button") {
    return true;
  }
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    return SPACE_INPUT_TYPES.has(type);
  }
  const role = element.getAttribute("role")?.trim().toLowerCase();
  return role !== undefined && SPACE_ROLES.has(role);
}

function readNumber(element: Element, attribute: string): number | undefined {
  const raw = element.getAttribute(attribute);
  if (raw === null || raw.trim() === "") {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function playFrom(state: RootState, element: Element, origin: Element): void {
  const name = element.getAttribute(SOUND_ATTRIBUTE)?.trim();
  if (name === undefined || name === "") {
    return;
  }
  // `origin` is inside `element`, so checking it covers both.
  if (isDisabled(origin)) {
    return;
  }
  const player = state.players.at(-1)?.[0];
  if (player === undefined) {
    return;
  }
  const options: SoundPlayOptions = {};
  const volume = readNumber(element, VOLUME_ATTRIBUTE);
  const pitch = readNumber(element, PITCH_ATTRIBUTE);
  if (volume !== undefined) {
    options.volume = volume;
  }
  if (pitch !== undefined) {
    options.pitch = pitch;
  }
  player.play(name, options);
}

function unlockAll(state: RootState): void {
  const seen = new Set<DeclarativeTarget>();
  for (const [target] of state.unlockers) {
    if (target !== undefined && !seen.has(target)) {
      seen.add(target);
      void target.unlock();
    }
  }
}

function createRootState(): RootState {
  const state: RootState = {
    onKeyDown(event) {
      try {
        const key = event as KeyboardEvent;
        unlockAll(state);
        if (key.repeat) {
          return;
        }
        const target = asElement(key.target);
        if (target === null || !target.hasAttribute(SOUND_ATTRIBUTE)) {
          return;
        }
        const isEnter = key.key === "Enter";
        const isSpace = key.key === " " || key.key === "Spacebar";
        if (isEnter || (isSpace && activatesWithSpace(target))) {
          playFrom(state, target, target);
        }
      } catch {
        // Never break the app's own key handlers.
      }
    },
    onPointerDown(event) {
      try {
        unlockAll(state);
        if ((event as PointerEvent).button !== 0) {
          return;
        }
        const origin = asElement(event.target);
        const element = origin?.closest(`[${SOUND_ATTRIBUTE}]`);
        if (origin && element) {
          playFrom(state, element, origin);
        }
      } catch {
        // Never break the app's own pointer handlers.
      }
    },
    players: [],
    unlockers: [],
  };
  return state;
}

function bind(
  root: DeclarativeRoot,
  target: DeclarativeTarget,
  declarative: boolean,
): () => void {
  let state = roots.get(root);
  if (state === undefined) {
    state = createRootState();
    roots.set(root, state);
    root.addEventListener("pointerdown", state.onPointerDown, LISTENER_OPTIONS);
    root.addEventListener("keydown", state.onKeyDown, LISTENER_OPTIONS);
  }
  // A one-element tuple gives each binding its own identity, so binding the
  // same engine twice and unbinding once leaves the other binding in place.
  const entry: DeclarativeTarget[] = [
    target,
  ];
  state.unlockers.push(entry);
  if (declarative) {
    state.players.push(entry);
  }

  let bound = true;
  return () => {
    if (!bound) {
      return;
    }
    bound = false;
    const current = roots.get(root);
    if (current === undefined) {
      return;
    }
    current.unlockers = current.unlockers.filter((item) => item !== entry);
    current.players = current.players.filter((item) => item !== entry);
    if (current.unlockers.length === 0) {
      root.removeEventListener(
        "pointerdown",
        current.onPointerDown,
        LISTENER_OPTIONS,
      );
      root.removeEventListener("keydown", current.onKeyDown, LISTENER_OPTIONS);
      roots.delete(root);
    }
  };
}

/**
 * Plays the `data-sound` of activated elements under `root` with `target`.
 * One listener set per root, shared by every binding; the most recent
 * declarative binding of a root is the one that plays.
 */
export function bindDeclarativeListener(
  root: DeclarativeRoot,
  target: DeclarativeTarget,
): () => void {
  return bind(root, target, true);
}

/** Calls `target.unlock()` on every pointer/keyboard gesture under `root`. */
export function bindUnlockListener(
  root: DeclarativeRoot,
  target: DeclarativeTarget,
): () => void {
  return bind(root, target, false);
}
