export type TickState = "interior" | "boundary";

export interface Tick {
  id: string;
  depegBps: number;
  radius: number;      // R
  kappa: number;       // normalized plane constant; boundary when sum(x) >= kappa*R*sqrt(n)
  xMinNorm: number;    // normalized minimum effective reserve per token
  x: number[];         // effective reserves, absolute token units
  state: TickState;
}

export interface QuoteResult {
  amountOut: number;
  ticksCrossed: number;
  ticks: Tick[];       // post-swap copies
  priceBefore: number; // price of tokenOut in tokenIn
  priceAfter: number;
}

export type OrbitalErrorCode =
  | "SameToken" | "InvalidAmount" | "InsufficientLiquidity" | "NoConvergence" | "InvalidTick";

export class OrbitalError extends Error {
  constructor(public code: OrbitalErrorCode, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.name = "OrbitalError";
  }
}
