import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";

describe("@usesounds/react", () => {
  it("loads the public entry", async () => {
    const react = await import("../src/index.js");
    expect(react).toBeDefined();
  });

  it("renders React components into the registered DOM", () => {
    render(
      <button
        data-sound="tick"
        type="button"
      >
        Save
      </button>,
    );

    expect(
      screen
        .getByRole("button", {
          name: "Save",
        })
        .getAttribute("data-sound"),
    ).toBe("tick");
  });
});
