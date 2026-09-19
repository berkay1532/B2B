import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttackView } from "./AttackView";

describe("AttackView", () => {
  it("shows both panels and reacts to the slider", () => {
    render(<AttackView />);
    const slider = screen.getByLabelText("attack budget");
    fireEvent.change(slider, { target: { value: "8" } }); // 10^8
    expect(screen.getByTestId("ob-price").textContent).toContain("107");
    expect(screen.getByTestId("orb-capped")).toBeInTheDocument();
  });
});
