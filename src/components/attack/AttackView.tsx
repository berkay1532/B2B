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
    <div className="p-6 font-mono">
      <p className="mb-4 text-sm text-muted">Same attacker, same budget, two price sources. Only one of them has a ceiling.</p>
      <label className="mb-6 block text-xs text-muted">
        attack budget: <span className="text-fg">{formatUsd(budget)}</span>
        <input aria-label="attack budget" type="range" min={0} max={8} step={0.1} value={exp} onChange={(e) => setExp(Number(e.target.value))} className="mt-2 w-full" />
      </label>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OrderbookPanel r={ob} />
        <OrbitalPanel o={orb} />
      </div>
    </div>
  );
}
