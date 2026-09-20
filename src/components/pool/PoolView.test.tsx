import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MockPoolClient } from "@/lib/pool/MockPoolClient";
import type { PoolClient, PoolState, Quote, SwapArgs, TokenId } from "@/lib/pool/PoolClient";
import { PoolView } from "./PoolView";

/** Swapped in for a single test via the `getPoolClient` mock below. */
let clientOverride: PoolClient | null = null;

vi.mock("@/lib/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pool")>();
  return { ...actual, getPoolClient: () => clientOverride ?? actual.getPoolClient() };
});

const HASH = "7f3a91c2d4e5b6a708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f";

/** Mock pool with a deliberately slow, hash-returning `swap` — stands in for the wallet. */
class SlowSwapClient implements PoolClient {
  private readonly inner = new MockPoolClient();
  readonly mode = this.inner.mode;
  readonly kind = this.inner.kind;
  getState(): Promise<PoolState> { return this.inner.getState(); }
  getTicks() { return this.inner.getTicks(); }
  quote(a: TokenId, b: TokenId, amountIn: bigint): Promise<Quote> { return this.inner.quote(a, b, amountIn); }
  deposit(args: Parameters<PoolClient["deposit"]>[0]) { return this.inner.deposit(args); }
  subscribe(cb: (s: PoolState) => void) { return this.inner.subscribe(cb); }
  async swap(args: SwapArgs) {
    args.onStatus?.("signing");
    await new Promise((r) => setTimeout(r, 50));
    args.onStatus?.("submitting");
    const res = await this.inner.swap({ ...args, onStatus: undefined });
    return { ...res, txHash: HASH };
  }
}

/** Mock pool whose `quote` parks until the test releases it, newest-first if it wants. */
class GatedQuoteClient implements PoolClient {
  private readonly inner = new MockPoolClient();
  readonly mode = this.inner.mode;
  readonly kind = this.inner.kind;
  readonly pending: (() => void)[] = [];
  getState(): Promise<PoolState> { return this.inner.getState(); }
  getTicks() { return this.inner.getTicks(); }
  async quote(a: TokenId, b: TokenId, amountIn: bigint): Promise<Quote> {
    const q = await this.inner.quote(a, b, amountIn);
    await new Promise<void>((r) => this.pending.push(r));
    return q;
  }
  swap(args: SwapArgs) { return this.inner.swap(args); }
  deposit(args: Parameters<PoolClient["deposit"]>[0]) { return this.inner.deposit(args); }
  subscribe(cb: (s: PoolState) => void) { return this.inner.subscribe(cb); }
}

const commitButton = () => screen.getByRole("button", { name: /COMMIT SWAP|SIGNING|SUBMITTING/ });

describe("PoolView", () => {
  afterEach(() => { clientOverride = null; });

  it("previews live, then commits", async () => {
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
    const input = screen.getByLabelText("amount in");
    fireEvent.change(input, { target: { value: "6000000" } });
    // preview: ticks flip and the reserves table moves before any commit
    await waitFor(() => expect(screen.getAllByText("BOUNDARY").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByTestId("quote-out").textContent).toMatch(/\$/));
    expect(screen.getByTestId("preview-badge")).toBeInTheDocument();
    fireEvent.click(screen.getByText("COMMIT SWAP"));
    // committed: preview badge gone, boundary states persist, amount cleared
    await waitFor(() => expect(screen.queryByTestId("preview-badge")).not.toBeInTheDocument());
    expect(screen.getAllByText("BOUNDARY").length).toBeGreaterThan(0);
    expect((screen.getByLabelText("amount in") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByText("RESET"));
    await waitFor(() => expect(screen.queryAllByText("BOUNDARY").length).toBe(0));
  });

  it("shows the classic comparison and moves it with the slider", async () => {
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("amount in"), { target: { value: "6000000" } });
    await waitFor(() => expect(screen.getByTestId("classic-out").textContent).toMatch(/\$/));
    // classic moves instantly with the slider (synchronous), but the comparison also
    // needs the debounced Orbital quote to have resolved before comparing the two.
    await waitFor(() => {
      expect(screen.getByTestId("quote-out").getAttribute("data-value")).not.toBe("");
      expect(screen.getByTestId("classic-out").getAttribute("data-value")).not.toBe("");
    });
    // classic gives less than orbital for the same input
    const classic = Number(screen.getByTestId("classic-out").getAttribute("data-value"));
    const orbital = Number(screen.getByTestId("quote-out").getAttribute("data-value"));
    expect(classic).toBeLessThan(orbital);
  });

  it("never quotes past what the pool can fill at the max slider amount", async () => {
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
    const slider = screen.getByLabelText("amount slider") as HTMLInputElement;
    const max = slider.max;
    fireEvent.change(slider, { target: { value: max } });
    fireEvent.change(screen.getByLabelText("amount in"), { target: { value: max } });
    await waitFor(() => expect(screen.getByTestId("preview-badge")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("quote-out").textContent).toMatch(/\$/));
    expect(screen.queryByText(/InsufficientLiquidity/)).not.toBeInTheDocument();
  });

  it("keeps the classic dot on-chart at a large slider amount", async () => {
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
    // 20,000,000 in: the classic preview reserve (cp[i] ≈ 30M) runs well past the
    // committed Orbital pool's own liquidity edge (~8.8M), which now bounds the
    // stretch of hyperbola the panel samples — the dot must still stay on-chart.
    fireEvent.change(screen.getByLabelText("amount in"), { target: { value: "20000000" } });
    await waitFor(() => expect(screen.getByTestId("classic-dot")).toBeInTheDocument());
    const svg = screen.getByRole("img", { name: "classic curve" });
    const [, , w, h] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const dot = screen.getByTestId("classic-dot");
    const cx = Number(dot.getAttribute("cx"));
    const cy = Number(dot.getAttribute("cy"));
    expect(cx).toBeGreaterThanOrEqual(0);
    expect(cx).toBeLessThanOrEqual(w);
    expect(cy).toBeGreaterThanOrEqual(0);
    expect(cy).toBeLessThanOrEqual(h);
    // the Orbital pool is no longer drawn in this panel
    expect(screen.queryByTestId("orbital-dot")).not.toBeInTheDocument();
  });

  it("marks the slider where each tick lands on its plane", async () => {
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());
    const slider = screen.getByLabelText("amount slider") as HTMLInputElement;
    const max = Number(slider.max);
    // three of the four seed ticks land inside the slider range; the widest one lands
    // exactly at the liquidity edge, which the right-hand caption already labels.
    const markers = document.querySelectorAll('[title$="tick lands here"]');
    expect(markers.length).toBe(3);
    const lefts = [...markers].map((m) => parseFloat((m as HTMLElement).style.left));
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    expect(lefts[0]).toBeGreaterThan(0);
    expect(lefts[lefts.length - 1]).toBeLessThanOrEqual(100);
    expect(max).toBeGreaterThan(0);
  });
  it("re-enables COMMIT once a new amount is entered after a swap", async () => {
    clientOverride = new SlowSwapClient();
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("amount in"), { target: { value: "1000" } });
    await waitFor(() => expect(commitButton()).toBeEnabled());
    fireEvent.click(commitButton());

    // in flight: the button says so, and nothing else can be touched
    await waitFor(() => expect(commitButton()).toHaveTextContent(/SIGNING|SUBMITTING/));
    expect(commitButton()).toBeDisabled();
    expect(screen.getByLabelText("amount in")).toBeDisabled();
    expect(screen.getByRole("button", { name: "RESET" })).toBeDisabled();

    // settled: confirmation line with an explorer link, amount cleared by design
    await waitFor(() => expect(screen.getByTestId("swap-status")).toHaveTextContent(/confirmed/));
    expect(within(screen.getByTestId("swap-status")).getByRole("link")).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    );
    expect(commitButton()).toHaveTextContent("COMMIT SWAP");
    expect(commitButton()).toBeDisabled();
    expect(screen.getByLabelText("amount in")).toBeEnabled();

    // the regression: a fresh amount must arm the button again
    fireEvent.change(screen.getByLabelText("amount in"), { target: { value: "2000" } });
    await waitFor(() => expect(commitButton()).toBeEnabled());
    expect(screen.queryByTestId("swap-status")).not.toBeInTheDocument();
    // …and the HUD keeps the receipt
    expect(screen.getByTestId("hud-last-tx")).toHaveTextContent("1,000.00 USDC → USDT");
  });

  it("ignores a quote that resolves after a newer one", async () => {
    const client = new GatedQuoteClient();
    clientOverride = client;
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30,000,000.00")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("amount in"), { target: { value: "1000" } });
    await waitFor(() => expect(client.pending.length).toBe(1));
    fireEvent.change(screen.getByLabelText("amount in"), { target: { value: "2000" } });
    await waitFor(() => expect(client.pending.length).toBe(2));

    // newest first, then the stale one lands — it must not clobber the live quote
    await act(async () => { client.pending[1](); });
    await waitFor(() => expect(commitButton()).toBeEnabled());
    await act(async () => { client.pending[0](); });
    expect(commitButton()).toBeEnabled();
  });
});
