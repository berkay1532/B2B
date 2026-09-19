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
});
