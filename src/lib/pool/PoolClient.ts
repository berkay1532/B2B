export type TokenId = string; // token code from config

export type PoolErrorCode =
  | "InsufficientLiquidity" | "SlippageExceeded" | "ProportionMismatch"
  | "NotImplemented" | "Rejected" | "Unknown";

export class PoolError extends Error {
  constructor(public code: PoolErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PoolError";
  }
}

export interface TickInfo {
  depegBps: number;
  radius: bigint;
  state: "interior" | "boundary";
  capEff: number;
}

export interface PoolState {
  tokens: TokenId[];
  reserves: bigint[];   // real reserves, 7 decimals
  ticks: TickInfo[];
  tvl: bigint;
}

export interface Quote {
  amountOut: bigint;
  ticksCrossed: number;
  priceBefore: number;  // tokenOut priced in tokenIn
  priceAfter: number;
}

export interface PoolClient {
  getState(): Promise<PoolState>;
  quote(tokenIn: TokenId, tokenOut: TokenId, amountIn: bigint): Promise<Quote>;
  swap(args: { from: string; tokenIn: TokenId; tokenOut: TokenId; amountIn: bigint; minOut: bigint }): Promise<{ amountOut: bigint; txHash?: string }>;
  deposit(args: { from: string; amounts: bigint[]; depegBps: number }): Promise<{ shares: bigint; txHash?: string }>;
  reset?(): Promise<void>;
  subscribe(cb: (s: PoolState) => void): () => void;
}
