import { afterEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// DOM queries have their own timeout, separate from Vitest's test timeout.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
