import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { NETWORK } from "@/config/tokens";

// Any account that exists on the target network works as the simulation
// source — `balance` is a read-only call, no auth or signature required.
// The pool token issuer is guaranteed to exist on testnet.
const SIMULATION_SOURCE = "GBF7D4OLVZUPVMXZEXHCKRN7B6HFZSY4AHOUGOGGG2GIIIIOYYSI2FSE";

export interface ReadTokenBalanceDeps {
  server?: Pick<rpc.Server, "simulateTransaction">;
}

/**
 * Reads a SEP-41 / Stellar Asset Contract `balance(id: Address) -> i128` via
 * simulation (no signature, no submission, no fee spent). Browser-safe: only
 * uses `@stellar/stellar-sdk`'s pure-JS transaction building + RPC client.
 */
export async function readTokenBalance(
  contractId: string,
  holder: string,
  deps: ReadTokenBalanceDeps = {},
): Promise<bigint> {
  const server = deps.server ?? new rpc.Server(NETWORK.rpcUrl);

  const sourceAccount = new Account(SIMULATION_SOURCE, "0");
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(contract.call("balance", new Address(holder).toScVal()))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);

  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    const errorDetail = "error" in sim ? sim.error : "unknown simulation failure";
    throw new Error(`readTokenBalance(${contractId}) simulation failed: ${errorDetail}`);
  }

  const native = scValToNative(sim.result.retval);
  return BigInt(native as bigint | number | string);
}
