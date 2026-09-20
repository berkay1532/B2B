import { describe, it, expect, vi } from "vitest";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { TOKENS } from "@/config/tokens";
import { SorobanPoolClient } from "./SorobanPoolClient";
import { PoolError } from "./PoolClient";

const CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

function tickScVal(depegBps: number, radius: bigint, x: bigint[], boundary: boolean): xdr.ScVal {
  return nativeToScVal(
    { depeg_bps: depegBps, radius, plane_sum: 0n, x_min: 0n, x, boundary },
    {
      type: {
        depeg_bps: ["symbol", "u32"],
        radius: ["symbol", "i128"],
        plane_sum: ["symbol", "i128"],
        x_min: ["symbol", "i128"],
        x: ["symbol", "i128"],
        boundary: ["symbol", null],
      },
    },
  );
}

function stateScVal(): xdr.ScVal {
  const ticks = [
    tickScVal(10, 7_000_000_000_000n, [2_300_000_000_000n, 2_300_000_000_000n, 2_300_000_000_000n], false),
    tickScVal(100, 2_500_000_000_000n, [800_000_000_000n, 800_000_000_000n, 800_000_000_000n], false),
  ];
  return nativeToScVal(
    {
      tokens: TOKENS.map((t) => t.contractId),
      reserves: [5_000_000_000_000n, 5_000_000_000_000n, 5_000_000_000_000n],
      ticks,
      tvl: 15_000_000_000_000n,
    },
    {
      type: {
        tokens: ["symbol", "address"],
        reserves: ["symbol", "i128"],
        ticks: ["symbol", null],
        tvl: ["symbol", "i128"],
      },
    },
  );
}

function quoteScVal(amountOut: bigint, ticksCrossed: number): xdr.ScVal {
  return nativeToScVal(
    { amount_out: amountOut, ticks_crossed: ticksCrossed },
    { type: { amount_out: ["symbol", "i128"], ticks_crossed: ["symbol", "u32"] } },
  );
}

function successSim(retval: xdr.ScVal) {
  return { transactionData: {}, result: { retval } };
}

function errorSim(message: string) {
  return { error: message };
}

const BASE_OPTS = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: CONTRACT_ID,
  networkPassphrase: "Test SDF Network ; September 2015",
};

describe("SorobanPoolClient", () => {
  describe("getState", () => {
    it("decodes the contract's PoolState into the frontend shape", async () => {
      const simulateTransaction = vi.fn().mockResolvedValue(successSim(stateScVal()));
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });

      const state = await client.getState();

      expect(state.tokens).toEqual(TOKENS.map((t) => t.code));
      expect(state.reserves).toEqual([5_000_000_000_000n, 5_000_000_000_000n, 5_000_000_000_000n]);
      expect(state.tvl).toBe(15_000_000_000_000n);
      expect(state.ticks).toHaveLength(2);
      expect(state.ticks[0]).toMatchObject({ depegBps: 10, radius: 7_000_000_000_000n, state: "interior" });
      expect(state.ticks[0].capEff).toBeGreaterThan(1);
      expect(simulateTransaction).toHaveBeenCalledTimes(1);
    });

    it("populates getTicks() with math-level ticks derived from the same state", async () => {
      const simulateTransaction = vi.fn().mockResolvedValue(successSim(stateScVal()));
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });
      await client.getState();

      const ticks = client.getTicks();
      expect(ticks).toHaveLength(2);
      for (const t of ticks) {
        expect(t.id).toBe(`t${t.depegBps}`);
        expect(t.x).toHaveLength(3);
        expect(typeof t.kappa).toBe("number");
        expect(Number.isFinite(t.kappa)).toBe(true);
        expect(t.radius).toBeGreaterThan(0);
      }
    });
  });

  describe("quote", () => {
    it("decodes amountOut/ticksCrossed from the contract's Quote", async () => {
      const simulateTransaction = vi.fn().mockResolvedValue(successSim(quoteScVal(999_000_000n, 1)));
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });

      const q = await client.quote("USDC", "USDT", 1_000_000_000n);

      expect(q.amountOut).toBe(999_000_000n);
      expect(q.ticksCrossed).toBe(1);
      expect(typeof q.priceBefore).toBe("number");
      expect(typeof q.priceAfter).toBe("number");
    });
  });

  describe("maxFillable", () => {
    it("decodes a plain i128 return value", async () => {
      const simulateTransaction = vi.fn().mockResolvedValue(successSim(nativeToScVal(42_000_000_000n, { type: "i128" })));
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });

      await expect(client.maxFillable("USDC", "USDT")).resolves.toBe(42_000_000_000n);
    });
  });

  describe("error mapping", () => {
    it("maps Error(Contract, #1) to InsufficientLiquidity with a friendly message and the raw text in details", async () => {
      const raw = "HostError: Error(Contract, #1)\nEvent log (newest first):\nsome diagnostic trace";
      const simulateTransaction = vi.fn().mockResolvedValue(errorSim(raw));
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });

      const err = await client.quote("USDC", "USDT", 1_000_000_000n).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PoolError);
      expect((err as PoolError).code).toBe("InsufficientLiquidity");
      expect((err as PoolError).message).toBe("Not enough pool liquidity for this amount");
      expect((err as PoolError).details).toBe(raw);
    });

    it("maps Error(Contract, #2) to SlippageExceeded", async () => {
      const simulateTransaction = vi.fn().mockResolvedValue(errorSim("Error(Contract, #2)"));
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });

      const err = await client.getState().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PoolError);
      expect((err as PoolError).code).toBe("SlippageExceeded");
      expect((err as PoolError).message).toBe("Price moved past your slippage limit");
    });

    it("maps Error(Contract, #10) — the SAC token contract's balance error — to a friendly wallet-balance message", async () => {
      const raw = "HostError: Error(Contract, #10)\nEvent log (newest first):\nbalance is not sufficient to spend";
      const simulateTransaction = vi.fn().mockResolvedValue(errorSim(raw));
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });

      const err = await client.quote("USDC", "USDT", 1_000_000_000n).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PoolError);
      expect((err as PoolError).message).toBe("Insufficient token balance in your wallet");
      expect((err as PoolError).details).toBe(raw);
    });

    it("falls back to Unknown for an unmapped contract error code, with a truncated raw message", async () => {
      const simulateTransaction = vi.fn().mockResolvedValue(errorSim("Error(Contract, #99)"));
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });

      const err = await client.getState().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PoolError);
      expect((err as PoolError).code).toBe("Unknown");
      expect((err as PoolError).message).toBe("Transaction simulation failed: Error(Contract, #99)");
    });
  });

  describe("swap", () => {
    it("throws Rejected when no signer is set", async () => {
      const simulateTransaction = vi.fn();
      const client = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction } });

      const err = await client
        .swap({ from: "GABC", tokenIn: "USDC", tokenOut: "USDT", amountIn: 1_000_000_000n, minOut: 0n })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PoolError);
      expect((err as PoolError).code).toBe("Rejected");
      expect(simulateTransaction).not.toHaveBeenCalled();
    });

    it("builds the call, signs, and submits when a signer is set", async () => {
      const simulateTransaction = vi.fn();
      const fakeTx = { simulation: successSim(nativeToScVal(950_000_000n, { type: "i128" })) };
      const buildCall = vi.fn().mockResolvedValue(fakeTx);
      const signAndSubmit = vi.fn().mockResolvedValue({ hash: "deadbeef" });
      const wired = new SorobanPoolClient({ ...BASE_OPTS, server: { simulateTransaction }, buildCall });
      wired.setSigner({ kit: null, signAndSubmit });

      const result = await wired.swap({
        from: "GBF7D4OLVZUPVMXZEXHCKRN7B6HFZSY4AHOUGOGGG2GIIIIOYYSI2FSE",
        tokenIn: "USDC",
        tokenOut: "USDT",
        amountIn: 1_000_000_000n,
        minOut: 0n,
      });

      expect(buildCall).toHaveBeenCalledWith(null, expect.objectContaining({ contractId: CONTRACT_ID, method: "swap" }));
      expect(signAndSubmit).toHaveBeenCalledWith(fakeTx);
      expect(result).toEqual({ amountOut: 950_000_000n, txHash: "deadbeef" });
    });
  });
});
