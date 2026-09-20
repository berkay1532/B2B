import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTokenBalances } from "./useTokenBalances";
import { TOKENS } from "@/config/tokens";

const { readTokenBalance } = vi.hoisted(() => ({ readTokenBalance: vi.fn() }));
vi.mock("@/lib/chain/tokenBalance", () => ({ readTokenBalance }));

const HOLDER = "CBWSKKTJLKBYC2FS6PX54QI7LCWXSJWSKDZ2YE5WZZIOCFRBI4WE7BXG";

describe("useTokenBalances", () => {
  it("reads all pool tokens in parallel on mount", async () => {
    readTokenBalance.mockImplementation((contractId: string) =>
      Promise.resolve(BigInt(TOKENS.findIndex((t) => t.contractId === contractId) + 1) * 10n ** 7n),
    );

    const { result } = renderHook(() => useTokenBalances(HOLDER));

    await waitFor(() => expect(result.current.status).toBe("success"));

    expect(result.current.balances.USDC).toBe(10_000_000n);
    expect(result.current.balances.USDT).toBe(20_000_000n);
    expect(result.current.balances.USDX).toBe(30_000_000n);
    expect(readTokenBalance).toHaveBeenCalledTimes(3);
  });

  it("stays idle with null balances when there is no address", () => {
    const { result } = renderHook(() => useTokenBalances(null));
    expect(result.current.status).toBe("idle");
    expect(result.current.balances.USDC).toBeNull();
  });

  it("refresh() re-reads balances", async () => {
    readTokenBalance.mockResolvedValue(1n);
    const { result } = renderHook(() => useTokenBalances(HOLDER));
    await waitFor(() => expect(result.current.status).toBe("success"));

    readTokenBalance.mockClear();
    result.current.refresh();

    await waitFor(() => expect(readTokenBalance).toHaveBeenCalledTimes(3));
  });
});
