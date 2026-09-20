"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TOKENS } from "@/config/tokens";
import { readTokenBalance } from "@/lib/chain/tokenBalance";

export type TokenBalances = Record<string, bigint | null>;

export type TokenBalancesStatus = "idle" | "loading" | "success" | "error";

export interface UseTokenBalancesResult {
  balances: TokenBalances;
  status: TokenBalancesStatus;
  refresh: () => void;
}

const emptyBalances = (): TokenBalances =>
  Object.fromEntries(TOKENS.map((t) => [t.code, null] as const));

/**
 * Reads the connected address's balance for every pool token in parallel, on
 * mount and whenever `refresh()` is called. A single failed read doesn't
 * blank out the others — each token resolves (or stays `null`) independently.
 */
export function useTokenBalances(address: string | null): UseTokenBalancesResult {
  const [balances, setBalances] = useState<TokenBalances>(emptyBalances);
  const [status, setStatus] = useState<TokenBalancesStatus>("idle");
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (!address) {
      // Resetting to the idle shape when the address disappears, not deriving state.
      setBalances(emptyBalances()); // eslint-disable-line react-hooks/set-state-in-effect
      setStatus("idle");
      return;
    }

    const currentRequest = ++requestId.current;
    let cancelled = false;
    // Kicking off the async balance read for the new address/refresh.
    setStatus("loading");

    void Promise.allSettled(
      TOKENS.map((token) => readTokenBalance(token.contractId, address)),
    ).then((results) => {
      if (cancelled || currentRequest !== requestId.current) return; // superseded

      const next: TokenBalances = {};
      let sawError = false;
      results.forEach((result, i) => {
        const code = TOKENS[i].code;
        if (result.status === "fulfilled") {
          next[code] = result.value;
        } else {
          next[code] = null;
          sawError = true;
        }
      });
      setBalances(next);
      setStatus(sawError ? "error" : "success");
    });

    return () => {
      cancelled = true;
    };
  }, [address, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  return { balances, status, refresh };
}
