/** Plain x*y=k pool, no fee. Prices are "out token in units of in token". */
export function cpQuote(reserveIn: number, reserveOut: number, amountIn: number) {
  if (!(amountIn > 0)) return { amountOut: 0, priceAfter: reserveIn / reserveOut, reserveIn, reserveOut };
  const k = reserveIn * reserveOut;
  const newIn = reserveIn + amountIn;
  const newOut = k / newIn;
  return { amountOut: reserveOut - newOut, priceAfter: newIn / newOut, reserveIn: newIn, reserveOut: newOut };
}

export const classicSeed = (realReserves: number[]): number[] => [...realReserves];

export function classicApply(reserves: number[], i: number, j: number, amountIn: number): number[] {
  const q = cpQuote(reserves[i], reserves[j], amountIn);
  const next = [...reserves];
  next[i] = q.reserveIn;
  next[j] = q.reserveOut;
  return next;
}
