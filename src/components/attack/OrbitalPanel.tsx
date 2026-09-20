import { formatUsd } from "@/lib/pool";
import type { OrbitalOutcome } from "@/lib/attack/orderbook";

export function OrbitalPanel({ o }: { o: OrbitalOutcome }) {
  return (
    <section
      aria-label="Orbital pool, 10 percent outer tick"
      className="flex flex-col gap-3 rounded-[18px] border border-line bg-bg-2/60 px-6 py-5"
    >
      <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.16em] text-muted-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
        ORBITAL POOL · 10% OUTER TICK
      </div>
      <div data-testid="orb-price" className="text-[44px] font-semibold tracking-[-0.01em] text-accent">
        ${o.price.toFixed(4)}
      </div>
      <div className="font-mono text-[11px] text-muted">
        marginal price · spent {formatUsd(o.spent)} · received {formatUsd(o.received)}
      </div>
      {o.capped && (
        <div data-testid="orb-capped" className="font-mono text-[11px] text-boundary">
          liquidity exhausted at {formatUsd(o.maxSpend)} · price cannot leave the tick bound
        </div>
      )}
      <p className="font-mono text-[11px] text-muted">
        Every tick exits to its plane before any coin leaves its declared band. Past that
        point there is nothing left to buy, so the readable price stops.
      </p>
    </section>
  );
}
