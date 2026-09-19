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

async function getKit(): Promise<Kit> {
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

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    try {
      const a = localStorage.getItem(STORAGE_KEY);
      if (a) setAddress(a);
    } catch {
      // localStorage unavailable (private mode, SSR edge cases) — stay disconnected
    }
  }, []);

  const connect = useCallback(async () => {
    const kit = await getKit();
    const { address } = await kit.authModal();
    setAddress(address);
    try {
      localStorage.setItem(STORAGE_KEY, address);
    } catch {
      // ignore persistence failures
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore persistence failures
    }
  }, []);

  return { address, connect, disconnect };
}
