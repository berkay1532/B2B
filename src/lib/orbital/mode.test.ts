import { describe, it, expect, vi, afterEach } from "vitest";
import { createTick } from "./tick";
import { maxFillable, quote, tickLandingAmounts } from "./swap";
import { maxFillableV2, quoteV2, tickLandingAmountsV2 } from "./torus";
import { maxFillableAuto, ORBITAL_MODE, quoteAuto, tickLandingAmountsAuto } from "./mode";

const seed = () => [10, 100, 500, 1000].map((bps) => createTick(`t${bps}`, bps, 2_500_000, 3));

/** Re-evaluate mode.ts with NEXT_PUBLIC_ORBITAL_MODE set to `value`. */
async function loadModeWith(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("NEXT_PUBLIC_ORBITAL_MODE", "");
  else vi.stubEnv("NEXT_PUBLIC_ORBITAL_MODE", value);
  return import("./mode");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("ORBITAL_MODE", () => {
  it("reflects the ambient env var (v1 unless the gate run sets v2)", () => {
    // mode-aware on purpose: the v2 gate run sets NEXT_PUBLIC_ORBITAL_MODE=v2
    // for the whole process, and this constant is supposed to follow it.
    expect(ORBITAL_MODE).toBe(process.env.NEXT_PUBLIC_ORBITAL_MODE === "v2" ? "v2" : "v1");
  });

  it("is v1 unless the env var says exactly v2", async () => {
    for (const value of [undefined, "v1", "V2", "true", "2"]) {
      expect((await loadModeWith(value)).ORBITAL_MODE).toBe("v1");
    }
  });

  it("is v2 when NEXT_PUBLIC_ORBITAL_MODE=v2", async () => {
    expect((await loadModeWith("v2")).ORBITAL_MODE).toBe("v2");
  });
});

describe("the Auto helpers dispatch on their explicit mode argument", () => {
  it("quoteAuto matches quote / quoteV2", () => {
    const amountIn = 7_000_000;
    expect(quoteAuto("v1", seed(), 0, 1, amountIn).amountOut).toBe(
      quote(seed(), 0, 1, amountIn).amountOut,
    );
    expect(quoteAuto("v2", seed(), 0, 1, amountIn).amountOut).toBe(
      quoteV2(seed(), 0, 1, amountIn).amountOut,
    );
    // and the two modes really do differ on this trade
    expect(quoteAuto("v2", seed(), 0, 1, amountIn).amountOut).not.toBe(
      quoteAuto("v1", seed(), 0, 1, amountIn).amountOut,
    );
  });

  it("maxFillableAuto matches maxFillable / maxFillableV2", () => {
    expect(maxFillableAuto("v1", seed(), 0, 1)).toBe(maxFillable(seed(), 0, 1));
    expect(maxFillableAuto("v2", seed(), 0, 1)).toBe(maxFillableV2(seed(), 0, 1));
  });

  it("tickLandingAmountsAuto matches tickLandingAmounts / ...V2", () => {
    expect(tickLandingAmountsAuto("v1", seed(), 0, 1)).toEqual(tickLandingAmounts(seed(), 0, 1));
    expect(tickLandingAmountsAuto("v2", seed(), 0, 1)).toEqual(tickLandingAmountsV2(seed(), 0, 1));
  });

  it("ignores the env var entirely — the argument decides", async () => {
    const m = await loadModeWith("v2");
    expect(m.ORBITAL_MODE).toBe("v2");
    expect(m.quoteAuto("v1", seed(), 0, 1, 7_000_000).amountOut).toBe(
      quote(seed(), 0, 1, 7_000_000).amountOut,
    );
  });
});
