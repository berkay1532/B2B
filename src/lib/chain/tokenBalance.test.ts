import { describe, it, expect, vi } from "vitest";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { readTokenBalance } from "./tokenBalance";

const CONTRACT_ID = "CBRFIFQ7O2VVQ63FMO5F3B5F4YWKQJ4534U37CJF54CK324BRNV4XW5D";
const HOLDER = "CBWSKKTJLKBYC2FS6PX54QI7LCWXSJWSKDZ2YE5WZZIOCFRBI4WE7BXG";

describe("readTokenBalance", () => {
  it("resolves the balance from a successful simulation", async () => {
    const retval = nativeToScVal(10_000_000_000_000n, { type: "i128" });
    const simulateTransaction = vi.fn().mockResolvedValue({
      transactionData: {}, // presence of this key is what rpc.Api.isSimulationSuccess checks
      result: { retval },
    });

    const balance = await readTokenBalance(CONTRACT_ID, HOLDER, {
      server: { simulateTransaction },
    });

    expect(balance).toBe(10_000_000_000_000n);
    expect(simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it("throws when the simulation fails", async () => {
    const simulateTransaction = vi.fn().mockResolvedValue({
      error: "host invocation failed",
    });

    await expect(
      readTokenBalance(CONTRACT_ID, HOLDER, { server: { simulateTransaction } }),
    ).rejects.toThrow(/simulation failed/);
  });
});
