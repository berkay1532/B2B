import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Set the env flag *before* the module graph is evaluated, so `ORBITAL_MODE`
// (and therefore the MockPoolClient default) really is "v2" in this file.
const h = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_ORBITAL_MODE = "v2";
  return { client: null as unknown as import("@/lib/pool").PoolClient };
});

// usePool() calls getPoolClient(); hand it a client we control.
vi.mock("@/lib/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pool")>();
  return { ...actual, getPoolClient: () => h.client };
});

import { MockPoolClient } from "@/lib/pool/MockPoolClient";
import { createTick, ORBITAL_MODE, quote, quoteV2 } from "@/lib/orbital";
import { PoolView } from "./PoolView";

const AMOUNT = 6_000_000;
const seed = () => [10, 100, 500, 1000].map((bps) => createTick(`t${bps}`, bps, 2_500_000, 3));

async function renderWith(mode: "v1" | "v2") {
  h.client = new MockPoolClient({ mode });
  render(<PoolView />);
  await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("amount in"), { target: { value: String(AMOUNT) } });
  await waitFor(() =>
    expect(screen.getByTestId("quote-out").getAttribute("data-value")).not.toBe(""),
  );
  return Number(screen.getByTestId("quote-out").getAttribute("data-value"));
}

describe("PoolView takes its math from the client, not the environment", () => {
  it("the env flag in this file really is v2", () => {
    expect(ORBITAL_MODE).toBe("v2");
    expect(new MockPoolClient().mode).toBe("v2");
  });

  it("a v1 client shows v1 numbers even though NEXT_PUBLIC_ORBITAL_MODE=v2", async () => {
    const shown = await renderWith("v1");
    const v1 = quote(seed(), 0, 1, AMOUNT).amountOut;
    const v2 = quoteV2(seed(), 0, 1, AMOUNT).amountOut;
    // the two differ by ~0.23 here, well above the 1e-7 display resolution
    expect(Math.abs(v2 - v1)).toBeGreaterThan(0.1);
    expect(Math.abs(shown - v1)).toBeLessThan(1e-5);
    expect(Math.abs(shown - v2)).toBeGreaterThan(0.1);
  });

  it("a v2 client shows v2 numbers", async () => {
    const shown = await renderWith("v2");
    const v2 = quoteV2(seed(), 0, 1, AMOUNT).amountOut;
    expect(Math.abs(shown - v2)).toBeLessThan(1e-5);
  });
});
