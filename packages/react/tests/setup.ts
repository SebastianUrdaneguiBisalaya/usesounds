import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

// Bun doesn't expose a global `afterEach`, so Testing Library can't auto-cleanup.
afterEach(() => {
  cleanup();
});
