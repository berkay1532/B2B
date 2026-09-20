import { formatUsd } from "@/lib/pool";
import type { SweepResult } from "@/lib/attack/orderbook";

export function OrderbookPanel({ r }: { r: SweepResult }) {
  return (
    <section
      aria-label="Thin orderbook, last-trade oracle"
      className="flex flex-col gap-3 rounded-[18px] border border-line bg-bg-2/60 px-6 py-5"
    >
      <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.16em] text-muted-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
        THIN ORDERBOOK · LAST-TRADE ORACLE
      </div>
      <div
        data-testid="ob-price"
        className={`text-[44px] font-semibold tracking-[-0.01em] ${r.exhausted ? "text-boundary" : "text-fg"}`}
      >
        ${r.lastPrice.toFixed(2)}
      </div>
      <div className="font-mono text-[11px] text-muted">
        last trade price · {r.levelsHit} levels hit · spent {formatUsd(r.spent)}
      </div>
      {r.exhausted && (
        <div className="font-mono text-[11px] text-boundary">
          book exhausted, oracle keeps reporting the last print
        </div>
      )}
      <p className="font-mono text-[11px] text-muted">
        22 Feb 2026: one trade on a market with almost no volume moved USTRY from ~$1 to
        ~$107. YieldBlox accepted that print as collateral value.
      </p>
    </section>
  );
}
