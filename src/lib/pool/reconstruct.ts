import { createTick, type Tick } from "@/lib/orbital";
import type { PoolState } from "./PoolClient";
import { fromUnits } from "./units";

/** Display-only fallback when the client cannot expose math ticks. */
export function ticksFromState(state: PoolState): Tick[] {
  const n = state.tokens.length;
  const total = fromUnits(state.tvl) / n; // real per token if balanced
  return state.ticks.map((ti) => {
    const t = createTick(`t${ti.depegBps}`, ti.depegBps, Math.max(total / state.ticks.length, 1e-9), n);
    t.state = ti.state;
    return t;
  });
}
