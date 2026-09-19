import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

// `@sembol/passkey-react` pulls in `smart-account-kit`, which runs Stellar-SDK hashing at
// module-import time; that trips over jsdom's crypto shims (unrelated to our wallet logic)
// the moment ANYTHING transitively imports it — including components like `PoolView` that
// merely call `useWallet()` and never touch the kit directly. Stub it globally here so no
// test file needs its own copy of this mock just to import something that imports
// `useWallet`. Test files that care about wallet *behavior* (useWallet.test.tsx,
// ConnectButton.test.tsx) override this with their own more detailed `vi.mock`.
vi.mock("@sembol/passkey-react", () => ({
  usePasskeyWallet: () => {
    throw new Error("Sembol hooks and components must be used inside <PasskeyWalletProvider />.");
  },
  toSembolError: (err: unknown) => {
    if (err && typeof err === "object" && "code" in err) return err;
    if (err instanceof Error) return { code: "unknown", message: err.message, userMessage: "" };
    return { code: "unknown", message: String(err), userMessage: "" };
  },
  // WalletProvider.tsx spreads SEMBOL_TESTNET_ARTIFACTS and renders PasskeyWalletProvider at
  // module scope, so any test importing it (e.g. WalletProvider.test.tsx, or layout-level
  // imports) needs these to exist even though nothing here exercises real wallet behavior.
  PasskeyWalletProvider: ({ children }: { children: ReactNode }) => children,
  SEMBOL_TESTNET_ARTIFACTS: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    accountWasmHash: "stub-wasm-hash",
    webauthnVerifierAddress: "stub-webauthn-verifier",
    ed25519VerifierAddress: "stub-ed25519-verifier",
    spendingLimitPolicyAddress: "stub-spending-limit-policy",
    nativeTokenContract: "stub-native-token-contract",
  },
  sembolThemeToCss: () => "",
}));

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
