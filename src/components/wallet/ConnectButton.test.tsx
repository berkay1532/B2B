import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectButton } from "./ConnectButton";

const { useWallet } = vi.hoisted(() => ({ useWallet: vi.fn() }));

vi.mock("@/hooks/useWallet", () => ({ useWallet }));

describe("ConnectButton", () => {
  it("renders CONNECT and CREATE pills when disconnected", () => {
    useWallet.mockReturnValue({
      address: null,
      error: null,
      status: "disconnected",
      connect: vi.fn(),
      createWallet: vi.fn(),
      disconnect: vi.fn(),
    });
    render(<ConnectButton />);
    expect(screen.getByText("CONNECT")).toBeInTheDocument();
    expect(screen.getByText("CREATE")).toBeInTheDocument();
  });

  it("renders the truncated smart-account address when connected", () => {
    useWallet.mockReturnValue({
      address: "CABCDEFGH1234567890XYZ",
      error: null,
      status: "connected",
      connect: vi.fn(),
      createWallet: vi.fn(),
      disconnect: vi.fn(),
    });
    render(<ConnectButton />);
    expect(screen.getByText("CABC…0XYZ")).toBeInTheDocument();
    expect(screen.queryByText("CONNECT")).not.toBeInTheDocument();
  });
});
