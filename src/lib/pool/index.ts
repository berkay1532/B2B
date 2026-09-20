import { NETWORK } from "@/config/tokens";
import { MockPoolClient } from "./MockPoolClient";
import { SorobanPoolClient } from "./SorobanPoolClient";
import type { PoolClient } from "./PoolClient";

let instance: PoolClient | null = null;

export function getPoolClient(): PoolClient {
  if (instance) return instance;
  if (process.env.NEXT_PUBLIC_POOL_BACKEND === "soroban") {
    instance = new SorobanPoolClient({
      rpcUrl: NETWORK.rpcUrl,
      contractId: process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ?? "",
      networkPassphrase: NETWORK.networkPassphrase,
    });
  } else {
    instance = new MockPoolClient();
  }
  return instance;
}

export * from "./PoolClient";
export * from "./units";
export { MockPoolClient } from "./MockPoolClient";
export { SorobanPoolClient } from "./SorobanPoolClient";
