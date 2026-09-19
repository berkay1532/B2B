"use client";
import { useWallet } from "@/hooks/useWallet";

export function ConnectButton() {
  const { address, error, connect, disconnect } = useWallet();
  if (address) {
    return (
      <button type="button" onClick={disconnect} className="rounded border border-line px-3 py-1 font-mono text-xs text-muted">
        {address.slice(0, 4)}…{address.slice(-4)}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => { void connect(); }} className="rounded bg-accent px-3 py-1 font-mono text-xs text-bg">
        CONNECT
      </button>
      {error && <span className="font-mono text-xs text-boundary">{error}</span>}
    </div>
  );
}
