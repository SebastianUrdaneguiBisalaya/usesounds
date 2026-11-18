import { describe, expect, it } from "bun:test";

describe("@usesounds/core", () => {
  it("loads the public entry", async () => {
    const core = await import("../src/index.js");
    expect(core).toBeDefined();
  });

  it("runs tests against a registered DOM", () => {
    const button = document.createElement("button");
    button.setAttribute("data-sound", "tick");
    document.body.append(button);

    expect(document.querySelector("[data-sound]")).toBe(button);

    button.remove();
  });
});
