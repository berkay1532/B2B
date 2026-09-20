import { describe, it, expect } from "vitest";
import { MockPoolClient } from "./MockPoolClient";
import { toUnits, fromUnits } from "./units";
import type { Tick } from "@/lib/orbital";

describe("MockPoolClient", () => {
  it("seeds a $30M pool with 4 interior ticks", async () => {
    const c = new MockPoolClient();
    const s = await c.getState();
    expect(s.tokens).toHaveLength(3);
    expect(fromUnits(s.tvl)).toBeCloseTo(30_000_000, 0);
    expect(s.reserves.map(fromUnits).every((r) => Math.abs(r - 10_000_000) < 1e-3)).toBe(true);
    expect(s.ticks.map((t) => t.depegBps)).toEqual([10, 100, 500, 1000]);
    expect(s.ticks.every((t) => t.state === "interior")).toBe(true);
    expect(s.ticks[1].capEff).toBeGreaterThan(100);
  });
  it("quote does not change state, swap does and notifies", async () => {
    const c = new MockPoolClient();
    const q = await c.quote("USDC", "USDT", toUnits(1_000_000));
    expect(fromUnits(q.amountOut)).toBeGreaterThan(900_000);
    const s1 = await c.getState();
    expect(fromUnits(s1.reserves[0])).toBeCloseTo(10_000_000, 3);
    let notified = 0;
    const unsub = c.subscribe(() => { notified++; });
    const r = await c.swap({ from: "G...", tokenIn: "USDC", tokenOut: "USDT", amountIn: toUnits(1_000_000), minOut: 0n });
    expect(r.amountOut).toBe(q.amountOut);
    const s2 = await c.getState();
    expect(fromUnits(s2.reserves[0])).toBeCloseTo(11_000_000, 3);
    expect(notified).toBe(1);
    unsub();
  });
  it("enforces minOut", async () => {
    const c = new MockPoolClient();
    await expect(c.swap({ from: "G", tokenIn: "USDC", tokenOut: "USDT", amountIn: toUnits(1000), minOut: toUnits(1001) }))
      .rejects.toMatchObject({ code: "SlippageExceeded" });
  });
  it("maps InsufficientLiquidity", async () => {
    const c = new MockPoolClient({ realPerTokenPerTick: 1000, depegBpsList: [100] });
    await expect(c.quote("USDC", "USDT", toUnits(1_000_000))).rejects.toMatchObject({ code: "InsufficientLiquidity" });
  });
  it("deposit into an existing tick grows tvl proportionally", async () => {
    const c = new MockPoolClient();
    const r = await c.deposit({ from: "G", amounts: [toUnits(100), toUnits(100), toUnits(100)], depegBps: 500 });
    expect(r.shares).toBeGreaterThan(0n);
    const s = await c.getState();
    expect(fromUnits(s.tvl)).toBeCloseTo(30_000_300, 0);
  });
  it("deposit rejects wrong proportions", async () => {
    const c = new MockPoolClient();
    await expect(c.deposit({ from: "G", amounts: [toUnits(100), toUnits(50), toUnits(100)], depegBps: 500 }))
      .rejects.toMatchObject({ code: "ProportionMismatch" });
  });
  it("deposit rejects a zero amount rather than dividing by it", async () => {
    const c = new MockPoolClient();
    await expect(c.deposit({ from: "G", amounts: [toUnits(100), 0n, toUnits(100)], depegBps: 500 }))
      .rejects.toMatchObject({ code: "ProportionMismatch" });
  });
  it("deposit rejects into a tick with a drained (zero) real reserve", async () => {
    const c = new MockPoolClient();
    // Force tick 0's real reserve for token 0 to exactly 0 (as if fully drained
    // toward its boundary), bypassing the swap engine to isolate this guard.
    // Draining index 0 specifically reproduces the reported bug: it makes
    // `ratio = amounts[0] / real[0]` itself Infinity, so a later
    // `finite - Infinity` / `Infinity` division degrades to NaN (not the
    // Infinity a single non-zero-numerator division would give), which the
    // unguarded `> 0.01` check silently treats as "not mismatched".
    const ticks = (c as unknown as { ticks: Tick[] }).ticks;
    ticks[0].x[0] = ticks[0].xMinNorm * ticks[0].radius;
    await expect(c.deposit({ from: "G", amounts: [toUnits(100), toUnits(100), toUnits(100)], depegBps: ticks[0].depegBps }))
      .rejects.toMatchObject({ code: "ProportionMismatch" });
  });
  it("reset restores the seed", async () => {
    const c = new MockPoolClient();
    await c.swap({ from: "G", tokenIn: "USDC", tokenOut: "USDT", amountIn: toUnits(2_000_000), minOut: 0n });
    await c.reset();
    const s = await c.getState();
    expect(s.ticks.every((t) => t.state === "interior")).toBe(true);
  });
});
