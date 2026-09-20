import { describe, it, expect } from "vitest";
import { toUnits, fromUnits, formatUsd } from "./units";

describe("units", () => {
  it("round trips 7 decimals", () => {
    expect(toUnits(1)).toBe(10_000_000n);
    expect(fromUnits(12_345_678n)).toBeCloseTo(1.2345678, 7);
    expect(fromUnits(toUnits(10_000_000))).toBe(10_000_000);
  });
  it("formats usd", () => {
    expect(formatUsd(10_000_000)).toBe("$10.00M");
    expect(formatUsd(4_070_000)).toBe("$4.07M");
    expect(formatUsd(950_000)).toBe("$950.00K");
    expect(formatUsd(12.34)).toBe("$12.34");
  });
});
