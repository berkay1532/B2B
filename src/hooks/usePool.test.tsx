import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePool } from "./usePool";
import { toUnits } from "@/lib/pool";

describe("usePool", () => {
  it("loads state and updates after a swap", async () => {
    const { result } = renderHook(() => usePool());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    const before = result.current.state!.reserves[0];
    await act(async () => {
      await result.current.client.swap({ from: "G", tokenIn: "USDC", tokenOut: "USDT", amountIn: toUnits(1000), minOut: 0n });
    });
    await waitFor(() => expect(result.current.state!.reserves[0]).toBeGreaterThan(before));
  });
});
