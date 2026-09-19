import { formatUsd } from "@/lib/pool";
import type { SweepResult } from "@/lib/attack/orderbook";

export function OrderbookPanel({ r }: { r: SweepResult }) {
  return (
    <section className="border border-line p-4 font-mono text-sm">
      <h2 className="mb-2 text-xs text-muted">// THIN ORDERBOOK · VWAP ORACLE</h2>
      <div className="text-4xl" data-testid="ob-price">${r.lastPrice.toFixed(2)}</div>
      <div className="mt-1 text-xs text-muted">last trade price · {r.levelsHit} levels hit · spent {formatUsd(r.spent)}</div>
      {r.exhausted && <div className="mt-3 text-xs text-boundary">book exhausted, oracle keeps reporting the last print</div>}
      <p className="mt-4 text-xs text-muted">22 Feb 2026: one trade on a market with under $1 of hourly volume moved USTRY from ~$1 to ~$107. YieldBlox accepted that print as collateral value.</p>
    </section>
  );
}
