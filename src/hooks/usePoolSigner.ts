"use client";
import { useEffect } from "react";
import { usePasskeyWallet, useSignTransaction, type PasskeyWalletContextValue, type UseSignTransactionResult } from "@sembol/passkey-react";
import { getPoolClient } from "@/lib/pool";
import { SorobanPoolClient } from "@/lib/pool/SorobanPoolClient";

/**
 * `usePasskeyWallet()` / `useSignTransaction()` throw when called outside
 * `<PasskeyWalletProvider>` — see the identical rationale in `useWallet.ts`. Swallow that
 * throw here too so `usePoolSigner()` is safe to call from any component, including in tests
 * without the provider.
 */
function useOptionalPasskeyWallet(): PasskeyWalletContextValue | null {
  try {
    return usePasskeyWallet();
  } catch {
    return null;
  }
}

function useOptionalSignTransaction(): UseSignTransactionResult | null {
  try {
    return useSignTransaction();
  } catch {
    return null;
  }
}

/**
 * Wires the connected passkey wallet into the pool client's signer whenever the active
 * backend is `SorobanPoolClient`. No-op for the mock backend, and while disconnected the
 * client's `swap`/`deposit` fall back to their own "connect a wallet first" `Rejected` error.
 *
 * Called once from `PoolView`; owns no rendering of its own.
 */
export function usePoolSigner(): void {
  const wallet = useOptionalPasskeyWallet();
  const signAndSubmit = useOptionalSignTransaction()?.signAndSubmit;
  const client = getPoolClient();

  useEffect(() => {
    if (!(client instanceof SorobanPoolClient)) return;
    if (wallet?.isConnected && wallet.kit && signAndSubmit) {
      client.setSigner({ kit: wallet.kit, signAndSubmit });
    } else {
      client.setSigner(null);
    }
  }, [client, wallet?.isConnected, wallet?.kit, signAndSubmit]);
}
