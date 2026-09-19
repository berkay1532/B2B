"use client";
import { useState } from "react";
import { useWalletDetails } from "@/hooks/useWalletDetails";
import { TOKENS } from "@/config/tokens";

export function WalletPanel({
  address,
  onDisconnect,
}: {
  address: string;
  onDisconnect: () => void;
}) {
  const { explorerUrl, copy, balance, refetch } = useWalletDetails();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    let ok = false;
    try {
      if (copy) {
        ok = await copy();
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(address);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const balanceText =
    balance.status === "loading"
      ? "loading…"
      : balance.status === "success" && balance.formatted != null
        ? `${balance.formatted} ${balance.symbol ?? "XLM"}`
        : "—";

  return (
    <div
      role="dialog"
      aria-label="wallet"
      className="absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] rounded-[14px] border border-line bg-bg-2/95 p-4 font-mono text-xs backdrop-blur"
    >
      <div>
        <div className="mb-1 text-[10px] tracking-[0.14em] text-muted-2">SMART ACCOUNT</div>
        <div className="break-all text-muted">{address}</div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            className="text-accent"
          >
            {copied ? "copied" : "COPY"}
          </button>
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noreferrer" className="text-accent">
              EXPLORER ↗
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-1 text-[10px] tracking-[0.14em] text-muted-2">BALANCE</div>
        <div className="flex items-center justify-between">
          <span className="text-muted">{balanceText}</span>
          <button
            type="button"
            onClick={() => {
              refetch();
            }}
            className="text-accent"
          >
            REFRESH
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-1 text-[10px] tracking-[0.14em] text-muted-2">TOKENS</div>
        <ul className="space-y-1">
          {TOKENS.map((token) => (
            <li key={token.code} className="flex items-center justify-between text-muted">
              <span>{token.code}</span>
              <span>—</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] text-muted-2">available once the pool contract is deployed</p>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={onDisconnect}
          className="w-full rounded-[10px] border border-line py-2 text-muted hover:border-boundary hover:text-boundary"
        >
          DISCONNECT
        </button>
      </div>
    </div>
  );
}
