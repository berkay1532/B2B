import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

if (typeof window !== "undefined") {
  // Node >= 25 ships an experimental global `localStorage` that shadows jsdom's.
  // Note: vitest's jsdom environment does NOT copy `localStorage` from the jsdom
  // window onto globalThis (it's absent from vitest's internal key list), so on
  // Node 25 `window.localStorage` here is just an alias back to that same
  // Node-global (broken, no .clear()/.setItem()) implementation, not jsdom's
  // real Storage. Reach through vitest's internal `globalThis.jsdom` (the JSDOM
  // instance it constructs) to grab jsdom's actual localStorage, falling back
  // to window.localStorage if that internal isn't present.
  const jsdomWindow = (globalThis as unknown as { jsdom?: { window?: Window } }).jsdom?.window;
  Object.defineProperty(globalThis, "localStorage", {
    value: jsdomWindow?.localStorage ?? window.localStorage,
    configurable: true,
  });
}

afterEach(cleanup);
