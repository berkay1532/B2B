"use client";
import { useWallet } from "@/hooks/useWallet";

export function ConnectButton() {
  const { address, error, connect, disconnect } = useWallet();
  if (address) {
    return (
      <button
        type="button"
        onClick={disconnect}
        className="h-[34px] rounded-full border border-accent bg-accent/5 px-4 font-mono text-xs tracking-[0.12em] text-muted"
      >
        {address.slice(0, 4)}…{address.slice(-4)}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => { void connect(); }}
        className="h-[34px] rounded-full border border-accent bg-accent/5 px-4 font-mono text-xs tracking-[0.12em] text-accent"
      >
        CONNECT
      </button>
      {error && <span className="font-mono text-xs text-boundary">{error}</span>}
    </div>
  );
}
