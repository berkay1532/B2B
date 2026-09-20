import { describe, it, expect } from "vitest";
import { cpQuote, classicApply, classicSeed } from "./constantProduct";

describe("constant product", () => {
  it("conserves k and returns less than input at equal reserves", () => {
    const q = cpQuote(10_000_000, 10_000_000, 1_000_000);
    expect(q.reserveIn * q.reserveOut).toBeCloseTo(1e14, -2);
    expect(q.amountOut).toBeLessThan(1_000_000);
    expect(q.amountOut).toBeGreaterThan(900_000);
    expect(q.priceAfter).toBeGreaterThan(1);
  });
  it("classicApply updates only the two reserves involved", () => {
    const r = classicSeed([10, 10, 10]);
    const n = classicApply(r, 0, 1, 5);
    expect(n[0]).toBe(15);
    expect(n[1]).toBeCloseTo(100 / 15, 9);
    expect(n[2]).toBe(10);
    expect(r[0]).toBe(10); // input untouched
  });
  it("classicSeed balances a skewed pool at the same TVL, not the current skew", () => {
    // a prior swap could leave the Orbital pool's real reserves skewed like this
    const skewed = [20, 5, 5];
    const r = classicSeed(skewed);
    expect(r).toEqual([10, 10, 10]); // 30 total / 3 tokens, evenly
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(skewed.reduce((a, b) => a + b, 0), 9);
  });
});
