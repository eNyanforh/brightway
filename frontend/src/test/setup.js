import { afterEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import { setReadIdentity } from "../api/read-cache";

// jsdom does not implement native dialog presentation; these stubs do not verify browser focus trapping.
Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, writable: true, value() { this.setAttribute("open", ""); } });
Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, writable: true, value() { this.removeAttribute("open"); } });

// DOM queries have their own timeout, separate from Vitest's test timeout.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  setReadIdentity("personal", null);
  setReadIdentity("management", null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
