import { PoolError, type PoolClient, type PoolState, type Quote, type TokenId } from "./PoolClient";

export interface SorobanOptions { rpcUrl: string; contractId: string; networkPassphrase: string }

/** Placeholder until the contract is deployed. Every call throws NotImplemented. */
export class SorobanPoolClient implements PoolClient {
  constructor(public readonly opts: SorobanOptions) {}
  async getState(): Promise<PoolState> { throw new PoolError("NotImplemented"); }
  async quote(_i: TokenId, _o: TokenId, _a: bigint): Promise<Quote> { throw new PoolError("NotImplemented"); }
  async swap(): Promise<{ amountOut: bigint; txHash?: string }> { throw new PoolError("NotImplemented"); }
  async deposit(): Promise<{ shares: bigint; txHash?: string }> { throw new PoolError("NotImplemented"); }
  subscribe(): () => void { return () => {}; }
}
