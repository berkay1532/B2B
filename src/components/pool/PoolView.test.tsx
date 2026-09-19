import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PoolView } from "./PoolView";

afterEach(cleanup);

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
    // classic gives less than orbital for the same input
    const classic = Number(screen.getByTestId("classic-out").getAttribute("data-value"));
    const orbital = Number(screen.getByTestId("quote-out").getAttribute("data-value"));
    expect(classic).toBeLessThan(orbital);
  });
});
