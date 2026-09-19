"use client";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "orbital.address";

// Minimal shape of the kit we rely on, declared locally so this module never
// statically imports (or types against) the real package — the package is
// only touched inside the lazy `import()` below, on user interaction.
type Kit = {
  authModal(): Promise<{ address: string }>;
};

let kitPromise: Promise<Kit> | null = null;
let kitOverride: Kit | null = null;

async function getKit(): Promise<Kit> {
  if (kitOverride) return kitOverride;
  if (!kitPromise) {
    kitPromise = (async () => {
      const [{ StellarWalletsKit, Networks }, { defaultModules }] = await Promise.all([
        import("@creit.tech/stellar-wallets-kit"),
        import("@creit.tech/stellar-wallets-kit/modules/utils"),
      ]);
      StellarWalletsKit.init({ network: Networks.TESTNET, modules: defaultModules() });
      return StellarWalletsKit as unknown as Kit;
    })();
  }
  return kitPromise;
}

/**
 * Test-only escape hatch: inject a fake kit so tests never trigger the real
 * dynamic import. Pass `null` to restore normal (lazy, real-kit) behavior.
 */
export function __setKitForTests(kit: Kit | null): void {
  kitOverride = kit;
  kitPromise = null;
}

function isUserClosedModal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === -1) return true;
  // Intentional heuristic: some wallet modules in the kit reject with a plain Error
  // (no `code`) when the user closes the modal, so we also match on message text.
  // This can false-positive on an unrelated error that happens to say "closed", but
  // that's an acceptable tradeoff for a demo — worst case it swallows a real error
  // instead of surfacing one that isn't.
  return typeof e.message === "string" && e.message.toLowerCase().includes("closed");
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const a = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage on mount, not derived from props/state
      if (a) setAddress(a);
    } catch {
      // localStorage unavailable (private mode, SSR edge cases) — stay disconnected
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      const kit = await getKit();
      const { address } = await kit.authModal();
      setAddress(address);
      setError(null);
      try {
        localStorage.setItem(STORAGE_KEY, address);
      } catch {
        // ignore persistence failures
      }
    } catch (err) {
      if (isUserClosedModal(err)) return;
      setError(errorMessage(err));
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore persistence failures
    }
  }, []);

  return { address, error, connect, disconnect };
}
