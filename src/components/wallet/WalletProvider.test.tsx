import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletProvider } from "./WalletProvider";

describe("WalletProvider", () => {
  it("renders its children (config/theme setup at module load doesn't throw)", () => {
    render(
      <WalletProvider>
        <span>ok</span>
      </WalletProvider>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});
