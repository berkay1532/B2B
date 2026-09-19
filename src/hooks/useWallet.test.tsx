import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWallet } from "./useWallet";

const { usePasskeyWallet } = vi.hoisted(() => ({ usePasskeyWallet: vi.fn() }));

vi.mock("@sembol/passkey-react", () => ({
  usePasskeyWallet: () => usePasskeyWallet(),
  toSembolError: (err: unknown) => {
    if (err && typeof err === "object" && "code" in err) return err;
    if (err instanceof Error) return { code: "unknown", message: err.message, userMessage: "" };
    return { code: "unknown", message: String(err), userMessage: "" };
  },
}));

function makeCtx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kit: null,
    status: "disconnected",
    address: null,
    credentialId: null,
    isConnected: false,
    error: null,
    capabilities: null,
    config: {},
    txEpoch: 0,
    signals: { on: vi.fn(), emit: vi.fn() },
    connect: vi.fn(),
    createWallet: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    fund: vi.fn(),
    ...overrides,
  };
}

describe("useWallet", () => {
  beforeEach(() => {
    usePasskeyWallet.mockReset();
  });

  it("returns a disconnected shape when there is no PasskeyWalletProvider (hook throws)", () => {
    usePasskeyWallet.mockImplementation(() => {
      throw new Error("Sembol hooks and components must be used inside <PasskeyWalletProvider />.");
    });
    const { result } = renderHook(() => useWallet());
    expect(result.current.address).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("reports the connected smart-account address from the kit", () => {
    usePasskeyWallet.mockReturnValue(
      makeCtx({ address: "CABC1234567890XYZ", status: "connected", isConnected: true }),
    );
    const { result } = renderHook(() => useWallet());
    expect(result.current.address).toBe("CABC1234567890XYZ");
  });

  it("sets a hint error when connect() resolves null (no wallet found)", async () => {
    const connect = vi.fn().mockResolvedValue(null);
    usePasskeyWallet.mockReturnValue(makeCtx({ connect }));
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(connect).toHaveBeenCalled();
    expect(result.current.address).toBeNull();
    expect(result.current.error).toBe("No passkey wallet on this device yet");
  });

  it("swallows a user-cancelled WebAuthn rejection from connect() without setting error", async () => {
    const connect = vi.fn().mockRejectedValue({ code: "user_cancelled", message: "cancelled" });
    usePasskeyWallet.mockReturnValue(makeCtx({ connect }));
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.address).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("stores a generic rejection from connect() as the curated user message", async () => {
    const connect = vi
      .fn()
      .mockRejectedValue({ code: "network_error", message: "fetch failed: ECONNRESET", userMessage: "Network hiccup — try again." });
    usePasskeyWallet.mockReturnValue(makeCtx({ connect }));
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).toBe("Network hiccup — try again.");
  });

  it("falls back to the developer message when userMessage is empty", async () => {
    const connect = vi.fn().mockRejectedValue({ code: "network_error", message: "boom", userMessage: "" });
    usePasskeyWallet.mockReturnValue(makeCtx({ connect }));
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).toBe("boom");
  });

  it("stores a generic rejection from createWallet() as the curated user message", async () => {
    const createWallet = vi
      .fn()
      .mockRejectedValue({ code: "unknown", message: "deploy failed: sim error", userMessage: "Couldn't create your wallet. Try again." });
    usePasskeyWallet.mockReturnValue(makeCtx({ createWallet }));
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.createWallet();
    });
    expect(result.current.error).toBe("Couldn't create your wallet. Try again.");
  });

  it("disconnect() calls through to the kit", () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    usePasskeyWallet.mockReturnValue(
      makeCtx({ address: "CABC1234567890XYZ", status: "connected", disconnect }),
    );
    const { result } = renderHook(() => useWallet());
    act(() => {
      result.current.disconnect();
    });
    expect(disconnect).toHaveBeenCalled();
  });

  it("disconnect() rejection is normalised into error, not an unhandled rejection", async () => {
    const disconnect = vi
      .fn()
      .mockRejectedValue({ code: "network_error", message: "boom", userMessage: "Couldn't disconnect. Try again." });
    usePasskeyWallet.mockReturnValue(
      makeCtx({ address: "CABC1234567890XYZ", status: "connected", disconnect }),
    );
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      result.current.disconnect();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(disconnect).toHaveBeenCalled();
    expect(result.current.error).toBe("Couldn't disconnect. Try again.");
  });
});
