"use client";
// Note: Sembol ships styled `<ConnectWalletButton />` / `<CreateWalletButton />` components
// (see @sembol/passkey-react) that would work here too — we build our own pills instead so
// they match the Observatory look (accent outline / fill pills, font-mono tracking) rather
// than the kit's own button styling.
import { useWallet } from "@/hooks/useWallet";

export function ConnectButton() {
  const { address, error, connect, createWallet, disconnect } = useWallet();

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
        onClick={() => {
          void connect();
        }}
        className="h-[34px] rounded-full border border-accent bg-accent/5 px-4 font-mono text-xs tracking-[0.12em] text-accent"
      >
        CONNECT
      </button>
      <button
        type="button"
        onClick={() => {
          void createWallet();
        }}
        className="h-[34px] rounded-full border border-accent bg-accent px-4 font-mono text-xs tracking-[0.12em] text-bg"
      >
        CREATE
      </button>
      {error && <span className="font-mono text-xs text-boundary">{error}</span>}
    </div>
  );
}
