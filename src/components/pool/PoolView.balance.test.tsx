import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MockPoolClient } from "@/lib/pool/MockPoolClient";
import { toUnits } from "@/lib/pool/units";
import type { PoolClient, PoolState, Quote, SwapArgs, TokenId } from "@/lib/pool/PoolClient";
import { PoolView } from "./PoolView";

const WALLET_ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV234";

/** Same math as `MockPoolClient`, but reports itself as the Soroban backend — the wallet
 *  balance cap in `PoolView` only engages for a `kind: "soroban"` client. Composition, not
 *  subclassing: `MockPoolClient.kind` is narrowed to the literal `"mock"`, so a subclass
 *  can't widen it back to `"soroban"`. */
class FakeSorobanClient implements PoolClient {
  private readonly inner = new MockPoolClient();
  readonly mode = this.inner.mode;
  readonly kind = "soroban" as const;
  getState(): Promise<PoolState> { return this.inner.getState(); }
  getTicks() { return this.inner.getTicks(); }
  quote(a: TokenId, b: TokenId, amountIn: bigint): Promise<Quote> { return this.inner.quote(a, b, amountIn); }
  swap(args: SwapArgs) { return this.inner.swap(args); }
  deposit(args: Parameters<PoolClient["deposit"]>[0]) { return this.inner.deposit(args); }
  reset() { return this.inner.reset(); }
  subscribe(cb: (s: PoolState) => void) { return this.inner.subscribe(cb); }
}

/** Swapped in via the `getPoolClient` mock below, same pattern as `PoolView.test.tsx`. */
let clientOverride: PoolClient | null = null;

vi.mock("@/lib/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pool")>();
  return { ...actual, getPoolClient: () => clientOverride ?? actual.getPoolClient() };
});

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    address: WALLET_ADDRESS,
    error: null,
    status: "connected",
    connect: vi.fn(),
    createWallet: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

const refreshBalances = vi.fn();
/** 998,000 USDC — the wallet balance from the reported bug (a 1,597,144 USDC swap against
 *  a wallet holding less than that, capped by the pool's much larger `maxIn` at the time). */
const USDC_BALANCE = 998_000;
let balancesOverride: Record<string, bigint | null> = { USDC: toUnits(USDC_BALANCE), USDT: null, USDX: null };

vi.mock("@/hooks/useTokenBalances", () => ({
  useTokenBalances: () => ({ balances: balancesOverride, status: "success", refresh: refreshBalances }),
}));

describe("PoolView wallet balance cap", () => {
  afterEach(() => {
    clientOverride = null;
    balancesOverride = { USDC: toUnits(USDC_BALANCE), USDT: null, USDX: null };
    refreshBalances.mockClear();
  });

  it("caps the slider at the wallet balance for an on-chain client", async () => {
    clientOverride = new FakeSorobanClient();
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
    const slider = screen.getByLabelText("amount slider") as HTMLInputElement;
    expect(slider.max).toBe(String(USDC_BALANCE));
    expect(screen.getByText(/wallet balance/)).toBeInTheDocument();
  });

  it("disables COMMIT and warns when the typed amount exceeds the wallet balance", async () => {
    clientOverride = new FakeSorobanClient();
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("amount in"), { target: { value: "1500000" } });
    await waitFor(() => expect(screen.getByTestId("insufficient-balance")).toBeInTheDocument());
    expect(screen.getByTestId("insufficient-balance").textContent).toBe(
      `insufficient USDC balance (${USDC_BALANCE.toLocaleString("en-US", { minimumFractionDigits: 2 })})`,
    );
    expect(screen.getByRole("button", { name: "COMMIT SWAP" })).toBeDisabled();
  });

  it("keeps the pool's own liquidity edge for the mock client", async () => {
    clientOverride = new MockPoolClient();
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
    const slider = screen.getByLabelText("amount slider") as HTMLInputElement;
    expect(slider.max).not.toBe(String(USDC_BALANCE));
    expect(screen.getByText(/liquidity edge/)).toBeInTheDocument();
  });
});
