import { describe, expect, it } from "bun:test";
import {
  InvalidSoundError,
  SoundPlaybackError,
  UsesoundsError,
  type UsesoundsErrorCode,
} from "../src/index.js";

describe("UsesoundsError", () => {
  it("is an Error with a name, code and message", () => {
    const error = new UsesoundsError("INVALID_SOUND", "boom");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UsesoundsError);
    expect(error.name).toBe("UsesoundsError");
    expect(error.code).toBe("INVALID_SOUND");
    expect(error.message).toBe("boom");
    expect(error.cause).toBeUndefined();
    expect("cause" in error).toBe(false);
  });

  it("keeps the cause", () => {
    const cause = new Error("root");
    const error = new UsesoundsError("SOUND_PLAYBACK_FAILED", "boom", {
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

describe("InvalidSoundError", () => {
  it("is an instance of Error, UsesoundsError and itself", () => {
    const error = new InvalidSoundError("tick", "already registered");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UsesoundsError);
    expect(error).toBeInstanceOf(InvalidSoundError);
    expect(error).not.toBeInstanceOf(SoundPlaybackError);
  });

  it("exposes name, code, sound and a descriptive message", () => {
    const error = new InvalidSoundError("", "name must be a non-empty string");

    expect(error.name).toBe("InvalidSoundError");
    expect(error.code).toBe("INVALID_SOUND");
    expect(error.sound).toBe("");
    expect(error.message).toBe(
      'Invalid sound "": name must be a non-empty string',
    );
    expect(error.cause).toBeUndefined();
  });

  it("keeps the cause", () => {
    const cause = new TypeError("bad shape");
    const error = new InvalidSoundError("pop", "malformed definition", {
      cause,
    });

    expect(error.cause).toBe(cause);
  });

  it("can be thrown and caught by type", () => {
    const run = () => {
      throw new InvalidSoundError("tick", "nope");
    };

    expect(run).toThrow(InvalidSoundError);
    expect(run).toThrow('Invalid sound "tick": nope');
  });
});

describe("SoundPlaybackError", () => {
  it("is an instance of Error, UsesoundsError and itself", () => {
    const error = new SoundPlaybackError("tick");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UsesoundsError);
    expect(error).toBeInstanceOf(SoundPlaybackError);
    expect(error).not.toBeInstanceOf(InvalidSoundError);
  });

  it("exposes name, code, sound and a message without cause", () => {
    const error = new SoundPlaybackError("tick");

    expect(error.name).toBe("SoundPlaybackError");
    expect(error.code).toBe("SOUND_PLAYBACK_FAILED");
    expect(error.sound).toBe("tick");
    expect(error.message).toBe('Failed to play sound "tick"');
    expect(error.cause).toBeUndefined();
  });

  it("keeps an Error cause and appends its message", () => {
    const cause = new DOMException("Unable to decode audio data");
    const error = new SoundPlaybackError("chime", {
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(error.message).toBe(
      'Failed to play sound "chime": Unable to decode audio data',
    );
  });

  it("appends a string cause", () => {
    const error = new SoundPlaybackError("pop", {
      cause: "context blocked",
    });

    expect(error.cause).toBe("context blocked");
    expect(error.message).toBe('Failed to play sound "pop": context blocked');
  });

  it("keeps a non-Error cause without changing the message", () => {
    const cause = {
      status: 404,
    };
    const error = new SoundPlaybackError("pop", {
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Failed to play sound "pop"');
  });
});

describe("error codes", () => {
  it("let consumers narrow errors with a switch", () => {
    const kindOf = (error: UsesoundsError): string => {
      const code: UsesoundsErrorCode = error.code;
      switch (code) {
        case "INVALID_SOUND":
          return "setup";
        case "SOUND_PLAYBACK_FAILED":
          return "playback";
      }
    };

    expect(kindOf(new InvalidSoundError("a", "b"))).toBe("setup");
    expect(kindOf(new SoundPlaybackError("a"))).toBe("playback");
  });
});
