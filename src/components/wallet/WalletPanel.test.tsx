import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectButton } from "./ConnectButton";

const { useWallet } = vi.hoisted(() => ({ useWallet: vi.fn() }));
const { useWalletDetails } = vi.hoisted(() => ({ useWalletDetails: vi.fn() }));

vi.mock("@/hooks/useWallet", () => ({ useWallet }));
vi.mock("@/hooks/useWalletDetails", () => ({ useWalletDetails }));

const ADDRESS = "CABCDEFGH1234567890XYZ";

function setup(disconnect = vi.fn()) {
  useWallet.mockReturnValue({
    address: ADDRESS,
    error: null,
    status: "connected",
    connect: vi.fn(),
    createWallet: vi.fn(),
    disconnect,
  });
  useWalletDetails.mockReturnValue({
    address: ADDRESS,
    explorerUrl: "https://stellar.expert/explorer/testnet/contract/" + ADDRESS,
    copy: undefined,
    balance: { formatted: "123.4560000", symbol: "XLM", status: "success" },
    refetch: vi.fn(),
  });
  return render(<ConnectButton />);
}

describe("WalletPanel", () => {
  it("is closed by default and opens on pill click, showing full address and balance", () => {
    setup();
    expect(screen.queryByRole("dialog", { name: "wallet" })).not.toBeInTheDocument();

    const pill = screen.getByText("CABC…0XYZ");
    expect(pill).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(pill);

    expect(pill).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("dialog", { name: "wallet" });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByText("123.4560000 XLM")).toBeInTheDocument();
    expect(screen.getByText("DISCONNECT")).toBeInTheDocument();
  });

  it("calls disconnect when DISCONNECT is clicked", () => {
    const disconnect = vi.fn();
    setup(disconnect);
    fireEvent.click(screen.getByText("CABC…0XYZ"));
    fireEvent.click(screen.getByText("DISCONNECT"));
    expect(disconnect).toHaveBeenCalled();
  });

  it("closes the panel on Escape", () => {
    setup();
    fireEvent.click(screen.getByText("CABC…0XYZ"));
    expect(screen.getByRole("dialog", { name: "wallet" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "wallet" })).not.toBeInTheDocument();
  });

  it("closes the panel on outside click", () => {
    setup();
    fireEvent.click(screen.getByText("CABC…0XYZ"));
    expect(screen.getByRole("dialog", { name: "wallet" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("dialog", { name: "wallet" })).not.toBeInTheDocument();
  });
});
