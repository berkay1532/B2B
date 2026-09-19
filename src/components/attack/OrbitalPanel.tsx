import { formatUsd } from "@/lib/pool";

export function OrbitalPanel({ o }: { o: { price: number; capped: boolean; spent: number; received: number; maxSpend: number } }) {
  return (
    <section className="border border-line p-4 font-mono text-sm">
      <h2 className="mb-2 text-xs text-muted">{"// ORBITAL POOL · 10% OUTER TICK"}</h2>
      <div className="text-4xl" data-testid="orb-price">${o.price.toFixed(4)}</div>
      <div className="mt-1 text-xs text-muted">marginal price · spent {formatUsd(o.spent)} · received {formatUsd(o.received)}</div>
      {o.capped && <div className="mt-3 text-xs text-boundary" data-testid="orb-capped">liquidity exhausted at {formatUsd(o.maxSpend)} · price cannot leave the tick bound</div>}
      <p className="mt-4 text-xs text-muted">Every tick exits to its plane before any coin leaves its declared band. Past that point there is nothing left to buy, so the readable price stops.</p>
    </section>
  );
}
