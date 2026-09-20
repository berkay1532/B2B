import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PoolView } from "./PoolView";

describe("PoolView", () => {
  it("previews live, then commits", async () => {
    render(<PoolView />);
    await waitFor(() => expect(screen.getByText("$30.00M")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("$30.00M")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("$30.00M")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("$30.00M")).toBeInTheDocument());
    // 20,000,000 in: the classic preview reserve (cp[i] ≈ 30M) runs well past the
    // stretch of hyperbola the panel samples (2.2 × classic[i] = 22M).
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
    await waitFor(() => expect(screen.getByText("$30.00M")).toBeInTheDocument());
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
});
