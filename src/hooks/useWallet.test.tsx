import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useWallet, __setKitForTests } from "./useWallet";

describe("useWallet", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    __setKitForTests(null);
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

  it("swallows a user-closed-modal rejection from connect() without setting error", async () => {
    __setKitForTests({
      authModal: () => Promise.reject({ code: -1, message: "The user closed the modal." }),
    });
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await expect(result.current.connect()).resolves.toBeUndefined();
    });
    expect(result.current.address).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("stores a non-cancel rejection from connect() as error", async () => {
    __setKitForTests({
      authModal: () => Promise.reject(new Error("boom")),
    });
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await expect(result.current.connect()).resolves.toBeUndefined();
    });
    expect(result.current.address).toBeNull();
    expect(result.current.error).toBe("boom");
  });
});
