"use client";
import { useMemo, useState } from "react";
import { THIN_BOOK, sweep, orbitalOutcome } from "@/lib/attack/orderbook";
import { formatUsd } from "@/lib/pool";
import { OrderbookPanel } from "./OrderbookPanel";
import { OrbitalPanel } from "./OrbitalPanel";

export function AttackView() {
  const [exp, setExp] = useState(2); // budget = 10^exp, 0..8
  const budget = Math.pow(10, exp);
  const ob = useMemo(() => sweep(THIN_BOOK, budget), [budget]);
  const orb = useMemo(() => orbitalOutcome(budget), [budget]);

  return (
    <div className="flex flex-col gap-7 px-9 pt-6 pb-9">
      <p className="max-w-[760px] font-sans text-[22px] leading-snug text-fg">
        Same attacker, same budget, two price sources. Only one of them has a ceiling.
      </p>

      <section aria-label="Stage" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OrderbookPanel r={ob} />
        <OrbitalPanel o={orb} />
      </section>

      <section
        aria-label="Attack budget"
        className="grid grid-cols-1 items-center gap-6 rounded-[18px] border border-line bg-bg-2/80 px-[22px] pt-[18px] pb-5 lg:grid-cols-[240px_1fr_160px]"
      >
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] tracking-[0.14em] text-muted">ATTACK BUDGET</span>
          <span className="text-[34px] font-semibold tracking-[-0.01em] text-fg">{formatUsd(budget)}</span>
        </div>

        <div className="relative flex h-6 items-center">
          <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
          <div
            className="absolute left-0 h-[3px] rounded-full bg-accent shadow-[0_0_10px_var(--accent)]"
            style={{ width: `${(exp / 8) * 100}%` }}
          />
          <input
            aria-label="attack budget"
            type="range"
            min={0}
            max={8}
            step={0.1}
            value={exp}
            onChange={(e) => setExp(Number(e.target.value))}
            className="orbital-slider absolute inset-x-0"
          />
        </div>

        <span className="justify-self-start font-mono text-[10px] tracking-[0.06em] text-muted lg:justify-self-end">
          $1 … $100M
        </span>
      </section>
    </div>
  );
}
