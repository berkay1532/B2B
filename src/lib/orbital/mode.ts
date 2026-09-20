import { maxFillable, quote, tickLandingAmounts } from "./swap";
import { maxFillableV2, quoteV2, tickLandingAmountsV2 } from "./torus";
import type { QuoteResult, Tick } from "./types";

export type OrbitalMode = "v1" | "v2";

/**
 * Default Orbital math for the **mock** pool, read from the environment.
 *
 * - `v1` (default) — boundary ticks freeze at their plane (`./swap.ts`); this
 *   is what the deployed Soroban contract implements.
 * - `v2` — the paper's torus consolidation (`./torus.ts`): boundary ticks keep
 *   trading on their own circles.
 *
 * This is only the *seed* for `MockPoolClient`'s mode. Nothing else reads it:
 * every call site takes the mode from its `PoolClient`, so a Soroban-backed
 * pool stays on v1 whatever this says.
 */
export const ORBITAL_MODE: OrbitalMode =
  process.env.NEXT_PUBLIC_ORBITAL_MODE === "v2" ? "v2" : "v1";

export function quoteAuto(
  mode: OrbitalMode,
  ticks: Tick[],
  tokenIn: number,
  tokenOut: number,
  amountIn: number,
): QuoteResult {
  return mode === "v2"
    ? quoteV2(ticks, tokenIn, tokenOut, amountIn)
    : quote(ticks, tokenIn, tokenOut, amountIn);
}

export function maxFillableAuto(
  mode: OrbitalMode,
  ticks: Tick[],
  tokenIn: number,
  tokenOut: number,
): number {
  return mode === "v2"
    ? maxFillableV2(ticks, tokenIn, tokenOut)
    : maxFillable(ticks, tokenIn, tokenOut);
}

export function tickLandingAmountsAuto(
  mode: OrbitalMode,
  ticks: Tick[],
  tokenIn: number,
  tokenOut: number,
): { depegBps: number; amountIn: number }[] {
  return mode === "v2"
    ? tickLandingAmountsV2(ticks, tokenIn, tokenOut)
    : tickLandingAmounts(ticks, tokenIn, tokenOut);
}
