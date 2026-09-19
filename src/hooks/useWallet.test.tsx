import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useWallet } from "./useWallet";

describe("useWallet", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts disconnected", () => {
    const { result } = renderHook(() => useWallet());
    expect(result.current.address).toBeNull();
  });

  it("picks up a pre-seeded address from localStorage on mount", async () => {
    localStorage.setItem("orbital.address", "GABC1234567890XYZ");
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.address).toBe("GABC1234567890XYZ"));
  });

  it("disconnect clears the address and localStorage", async () => {
    localStorage.setItem("orbital.address", "GABC1234567890XYZ");
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.address).toBe("GABC1234567890XYZ"));
    act(() => result.current.disconnect());
    expect(result.current.address).toBeNull();
    expect(localStorage.getItem("orbital.address")).toBeNull();
  });
});
