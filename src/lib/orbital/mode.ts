import { maxFillable, quote, tickLandingAmounts } from "./swap";
import { maxFillableV2, quoteV2, tickLandingAmountsV2 } from "./torus";
import type { QuoteResult, Tick } from "./types";

/**
 * Which Orbital math the app runs on.
 *
 * - `v1` (default) — boundary ticks freeze at their plane (`./swap.ts`), and is
 *   what the deployed Soroban contract implements.
 * - `v2` — the paper's torus consolidation (`./torus.ts`): boundary ticks keep
 *   trading on their own circles.
 *
 * Set `NEXT_PUBLIC_ORBITAL_MODE=v2` to switch the whole mock demo over.
 * `SorobanPoolClient` deliberately ignores this: the on-chain pool is v1.
 */
export const ORBITAL_MODE: "v1" | "v2" =
  process.env.NEXT_PUBLIC_ORBITAL_MODE === "v2" ? "v2" : "v1";

export const isV2 = (): boolean => ORBITAL_MODE === "v2";

export function quoteAuto(
  ticks: Tick[],
  tokenIn: number,
  tokenOut: number,
  amountIn: number,
): QuoteResult {
  return isV2()
    ? quoteV2(ticks, tokenIn, tokenOut, amountIn)
    : quote(ticks, tokenIn, tokenOut, amountIn);
}

export function maxFillableAuto(ticks: Tick[], tokenIn: number, tokenOut: number): number {
  return isV2() ? maxFillableV2(ticks, tokenIn, tokenOut) : maxFillable(ticks, tokenIn, tokenOut);
}

export function tickLandingAmountsAuto(
  ticks: Tick[],
  tokenIn: number,
  tokenOut: number,
): { depegBps: number; amountIn: number }[] {
  return isV2()
    ? tickLandingAmountsV2(ticks, tokenIn, tokenOut)
    : tickLandingAmounts(ticks, tokenIn, tokenOut);
}
