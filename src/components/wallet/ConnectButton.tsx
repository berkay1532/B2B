"use client";
import { useWallet } from "@/hooks/useWallet";

export function ConnectButton() {
  const { address, connect, disconnect } = useWallet();
  if (address) {
    return (
      <button type="button" onClick={disconnect} className="rounded border border-line px-3 py-1 font-mono text-xs text-muted">
        {address.slice(0, 4)}…{address.slice(-4)}
      </button>
    );
  }
  return (
    <button type="button" onClick={connect} className="rounded bg-accent px-3 py-1 font-mono text-xs text-bg">
      CONNECT
    </button>
  );
}
