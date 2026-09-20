/** Plain x*y=k pool, no fee. Prices are "out token in units of in token". */
export function cpQuote(reserveIn: number, reserveOut: number, amountIn: number) {
  if (!(amountIn > 0)) return { amountOut: 0, priceAfter: reserveIn / reserveOut, reserveIn, reserveOut };
  const k = reserveIn * reserveOut;
  const newIn = reserveIn + amountIn;
  const newOut = k / newIn;
  return { amountOut: reserveOut - newOut, priceAfter: newIn / newOut, reserveIn: newIn, reserveOut: newOut };
}

/**
 * Seeds the classic x*y=k comparison pool at the Orbital pool's TVL split evenly across
 * tokens, not at whatever (possibly skewed) reserves the Orbital pool currently holds. A
 * prior swap can leave the Orbital pool's real reserves skewed, and seeding the classic
 * pool from that skew makes the two quotes for the same trade direction incomparable —
 * the classic pool would already be pre-tilted toward or against the trade.
 */
export const classicSeed = (realReserves: number[]): number[] => {
  const tvl = realReserves.reduce((a, b) => a + b, 0);
  const share = tvl / (realReserves.length || 1);
  return realReserves.map(() => share);
};

export function classicApply(reserves: number[], i: number, j: number, amountIn: number): number[] {
  const q = cpQuote(reserves[i], reserves[j], amountIn);
  const next = [...reserves];
  next[i] = q.reserveIn;
  next[j] = q.reserveOut;
  return next;
}
