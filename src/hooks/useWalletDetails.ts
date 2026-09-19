"use client";
import { useCallback } from "react";
import {
  useWalletAddress,
  useWalletBalance,
  type UseWalletAddressResult,
  type UseWalletBalanceResult,
} from "@sembol/passkey-react";

/**
 * `useWalletAddress()` / `useWalletBalance()` both call `usePasskeyWalletContext()`
 * internally and throw outside `<PasskeyWalletProvider>` — same shape as
 * `usePasskeyWallet()` in `useWallet.ts`. Catch that throw here too so panels built on
 * this hook are safe to render (or unit-test) without the provider.
 */
function useOptionalWalletAddress(): UseWalletAddressResult | null {
  try {
    return useWalletAddress();
  } catch {
    return null;
  }
}

function useOptionalWalletBalance(): UseWalletBalanceResult | null {
  try {
    return useWalletBalance();
  } catch {
    return null;
  }
}

export interface WalletDetails {
  address: string | null;
  explorerUrl: string | null;
  copy: (() => Promise<boolean>) | undefined;
  balance: {
    formatted: string | null;
    symbol: string | null;
    status: UseWalletBalanceResult["status"];
  };
  refetch: () => void;
}

/**
 * Thin wrapper around Sembol's address/balance display hooks, shaped for the wallet
 * panel. Kept separate from `useWallet()` so components that only need the connect
 * state (e.g. the collapsed pill) don't pay for balance polling.
 */
export function useWalletDetails(): WalletDetails {
  const addressResult = useOptionalWalletAddress();
  const balanceResult = useOptionalWalletBalance();

  const refetch = useCallback(() => {
    if (!balanceResult) return;
    void balanceResult.refetch();
  }, [balanceResult]);

  return {
    address: addressResult?.address ?? null,
    explorerUrl: addressResult?.explorerUrl ?? null,
    copy: addressResult?.copy,
    balance: {
      formatted: balanceResult?.formatted ?? null,
      symbol: balanceResult?.symbol ?? "XLM",
      status: balanceResult?.status ?? "idle",
    },
    refetch,
  };
}
