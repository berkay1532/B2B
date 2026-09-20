"use client";
// Note: Sembol ships styled `<ConnectWalletButton />` / `<CreateWalletButton />` components
// (see @sembol/passkey-react) that would work here too — we build our own pills instead so
// they match the Observatory look (accent outline / fill pills, font-mono tracking) rather
// than the kit's own button styling.
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { WalletPanel } from "./WalletPanel";

export function ConnectButton() {
  const { address, error, connect, createWallet, disconnect } = useWallet();
  const [panelOpen, setPanelOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPanelOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panelOpen]);

  if (address) {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          className="h-[34px] rounded-full border border-accent bg-accent/5 px-4 font-mono text-xs tracking-[0.12em] text-muted"
        >
          {address.slice(0, 4)}…{address.slice(-4)}
        </button>
        {panelOpen && (
          <WalletPanel
            address={address}
            onDisconnect={() => {
              setPanelOpen(false);
              disconnect();
            }}
          />
        )}
      </div>
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
