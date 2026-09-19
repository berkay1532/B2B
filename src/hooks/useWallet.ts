"use client";
import { useCallback, useState } from "react";
import { usePasskeyWallet, toSembolError, type PasskeyWalletContextValue } from "@sembol/passkey-react";

/**
 * `usePasskeyWallet()` throws when called outside `<PasskeyWalletProvider>` (see
 * `usePasskeyWalletContext` in the kit). We want `useWallet()` to be safe to call from any
 * component — including ones rendered in tests without the provider — so we catch that
 * throw and fall back to a disconnected shape instead of crashing the caller.
 *
 * This is safe with respect to the rules of hooks: the kit's implementation is just
 * `useContext(...)` followed by a plain `if (!ctx) throw ...`, so the underlying hook call
 * always executes in the same order every render — only the (non-hook) throw afterwards is
 * conditional on whether a provider is present.
 */
function useOptionalPasskeyWallet(): PasskeyWalletContextValue | null {
  try {
    return usePasskeyWallet();
  } catch {
    return null;
  }
}

/**
 * Thin wrapper around Sembol's passkey smart-wallet hook, shaped for this app's needs.
 * Public shape kept stable (`address`, `error`, `connect`, `disconnect`) so consumers like
 * `PoolView` don't need to change; `createWallet` and `status` are additive.
 */
export function useWallet() {
  const ctx = useOptionalPasskeyWallet();
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!ctx) return;
    setError(null);
    try {
      const result = await ctx.connect();
      if (!result) {
        setError("No passkey wallet on this device yet");
      }
    } catch (err) {
      const sembolError = toSembolError(err);
      // User-cancelled WebAuthn prompts (closed the dialog, backed out) are a normal
      // non-event, not an error worth surfacing.
      if (sembolError.code === "user_cancelled") return;
      setError(sembolError.message);
    }
  }, [ctx]);

  const createWallet = useCallback(async () => {
    if (!ctx) return;
    setError(null);
    try {
      await ctx.createWallet();
    } catch (err) {
      const sembolError = toSembolError(err);
      if (sembolError.code === "user_cancelled") return;
      setError(sembolError.message);
    }
  }, [ctx]);

  const disconnect = useCallback(() => {
    if (!ctx) return;
    setError(null);
    void ctx.disconnect();
  }, [ctx]);

  return {
    address: ctx?.address ?? null,
    error,
    status: ctx?.status ?? "disconnected",
    connect,
    createWallet,
    disconnect,
  };
}
