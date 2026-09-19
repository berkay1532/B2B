import { describe, it, expect } from "vitest";
import { THIN_BOOK, sweep, orbitalOutcome } from "./orderbook";

describe("thin orderbook", () => {
  it("a small budget stays near $1", () => {
    const r = sweep(THIN_BOOK, 100);
    expect(r.lastPrice).toBeCloseTo(1, 2);
    expect(r.exhausted).toBe(false);
  });
  it("a few thousand dollars sends the last price to 107", () => {
    const r = sweep(THIN_BOOK, 10_000);
    expect(r.lastPrice).toBe(107);
    expect(r.exhausted).toBe(true);
    expect(r.spent).toBeLessThan(10_000);
  });
  it("price is monotone in budget", () => {
    let last = 0;
    for (const b of [10, 100, 1000, 5000, 100000]) { const r = sweep(THIN_BOOK, b); expect(r.lastPrice).toBeGreaterThanOrEqual(last); last = r.lastPrice; }
  });
});

describe("orbital outcome", () => {
  it("small budget barely moves price", () => {
    const o = orbitalOutcome(10_000);
    expect(o.price).toBeLessThan(1.01);
    expect(o.capped).toBe(false);
  });
  it("huge budget is capped near 1/0.9", () => {
    const o = orbitalOutcome(100_000_000);
    expect(o.capped).toBe(true);
    expect(o.price).toBeLessThan(1.2);
    expect(o.price).toBeGreaterThan(1.05);
    expect(o.spent).toBeCloseTo(o.maxSpend, 0);
  });
});
