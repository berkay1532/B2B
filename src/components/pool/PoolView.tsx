"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePool } from "@/hooks/usePool";
import { useWallet } from "@/hooks/useWallet";
import { usePoolSigner } from "@/hooks/usePoolSigner";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { TOKENS, tokenIndex } from "@/config/tokens";
import { fromUnits, toUnits, PoolError, type Quote, type SwapReceipt, type SwapStatus } from "@/lib/pool";
import { ticksFromState } from "@/lib/pool/reconstruct";
import { capitalEfficiency, maxFillableAuto, poolPrice, poolRealReserves, pricingTicks, quoteAuto as mathQuote, tickLandingAmountsAuto, type Tick } from "@/lib/orbital";
import { cpQuote, classicApply, classicSeed } from "@/lib/classic/constantProduct";
import { TickPlanes } from "./TickPlanes";
import { ClassicCurve } from "./ClassicCurve";
import { ControlBar } from "./ControlBar";
import { Hud } from "./Hud";

type WithTicks = { getTicks?: () => Tick[] };

/** Short message for the caption plus the raw diagnostic text (if any) for a `title` tooltip. */
type UiError = { message: string; details?: string };

function toUiError(e: unknown): UiError {
  if (e instanceof PoolError) return { message: e.message, details: e.details };
  return { message: String(e) };
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.16em] text-muted-2">
      <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
      {children}
    </div>
  );
}

export function PoolView() {
  const { state, client, refresh } = usePool();
  const { address } = useWallet();
  usePoolSigner();
  // On-chain balances for the connected address, read independently of pair selection — the
  // hook fetches every pool token in parallel. `null` per-token until a read resolves (or the
  // wallet disconnects), which the wallet cap below treats as "unknown, don't cap yet".
  const { balances: walletBalances, refresh: refreshWalletBalances } = useTokenBalances(address);
  const [tokenIn, setTokenIn] = useState(TOKENS[0].code);
  const [tokenOut, setTokenOut] = useState(TOKENS[1].code);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotedAmount, setQuotedAmount] = useState<number | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [prevTicks, setPrevTicks] = useState<Tick[] | undefined>();
  const [classic, setClassic] = useState<number[] | null>(null);
  const [swapStatus, setSwapStatus] = useState<SwapStatus>("idle");
  const [lastTx, setLastTx] = useState<SwapReceipt | null>(null);
  // Monotonic id for the debounced quote below: only the newest request may write state.
  const quoteSeq = useRef(0);

  // committed math-level ticks
  const ticks = useMemo<Tick[]>(() => {
    if (!state) return [];
    const g = (client as unknown as WithTicks).getTicks;
    return g ? g.call(client) : ticksFromState(state);
  }, [state, client]);

  // seed the classic comparison pool once from the committed real reserves
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed derived from the async-loaded pool state, not from props/state already in scope
    if (classic === null && ticks.length) setClassic(classicSeed(poolRealReserves(ticks)));
  }, [ticks, classic]);

  const i = tokenIndex(tokenIn), j = tokenIndex(tokenOut);
  // cap the slider at what the committed pool can actually fill, so a max-slider swap
  // never round-trips an InsufficientLiquidity error from the client.
  // the math has to match whatever backs this pool, not a global env flag:
  // a Soroban-backed pool is v1 even when the mock default says v2.
  const mode = client.mode;
  const maxIn = useMemo(
    () => (ticks.length ? Math.max(Math.floor(maxFillableAuto(mode, ticks, i, j)), 1) : 1),
    [mode, ticks, i, j],
  );
  // A Soroban-backed pool can also fail on-chain with "balance is not sufficient to spend"
  // when the connected wallet holds less than the pool could otherwise fill — the mock has no
  // real chain balance to check, so it never caps below the pool's own liquidity edge. `null`
  // here (no wallet, mock client, or the balance hasn't resolved yet) means "don't cap".
  const isOnChainClient = client.kind === "soroban";
  const walletBalanceRaw = isOnChainClient && address ? walletBalances[tokenIn] : null;
  const walletMax = walletBalanceRaw != null ? fromUnits(walletBalanceRaw) : null;
  const sliderMax = walletMax != null ? Math.max(1, Math.floor(Math.min(maxIn, walletMax))) : maxIn;
  const walletCapped = walletMax != null && walletMax < maxIn;
  // amber slider markers: where each interior tick lands on its plane
  const landingAmounts = useMemo(() => tickLandingAmountsAuto(mode, ticks, i, j), [mode, ticks, i, j]);
  const amountNum = Number(amount);
  // synchronous, independent of the debounced client round trip — the classic row and
  // classic dot must move instantly with the slider, same as the Orbital preview does.
  const classicQuote = classic && amountNum > 0 ? cpQuote(classic[i], classic[j], amountNum) : null;
  const classicPreview = classicQuote ? classicApply(classic!, i, j, amountNum) : undefined;

  // live preview from the pure math library (no client round trip)
  const previewTicks = useMemo<Tick[] | null>(() => {
    if (!(amountNum > 0) || ticks.length === 0) return null;
    try { return mathQuote(mode, ticks, i, j, amountNum).ticks; } catch { return null; }
  }, [mode, ticks, i, j, amountNum]);

  // Authoritative numeric quote from the client (debounced).
  //
  // Every run claims a new `quoteSeq`, and a resolved request writes state only if it is
  // still the newest. Without that, a slower earlier round trip landing after a faster later
  // one sets `quotedAmount` back to the *old* amount, `quoteOut` goes null, and COMMIT SWAP
  // is stuck disabled until the amount happens to change again — the reported bug. The
  // debounce alone does not cover it: it only cancels requests that have not fired yet, and
  // against testnet RPC two in-flight simulations routinely resolve out of order.
  useEffect(() => {
    const seq = ++quoteSeq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a stale debounced quote when the amount changes, not derived state
    if (!(amountNum > 0)) { setQuote(null); setQuotedAmount(null); setError(null); return; }
    const h = setTimeout(async () => {
      try {
        const q = await client.quote(tokenIn, tokenOut, toUnits(amountNum));
        if (quoteSeq.current !== seq) return;
        setQuote(q); setQuotedAmount(amountNum); setError(null);
      } catch (e) {
        if (quoteSeq.current !== seq) return;
        setQuote(null); setQuotedAmount(null); setError(toUiError(e));
      }
    }, 80);
    return () => clearTimeout(h);
  }, [amountNum, tokenIn, tokenOut, client]);

  // Typing or dragging clears the aftermath of the previous swap — that's the "next action"
  // the confirmation line waits for. `lastTx` survives: the HUD keeps showing it.
  const onAmount = useCallback((v: string) => {
    setAmount(v);
    setSwapStatus((s) => (s === "confirmed" || s === "failed" ? "idle" : s));
  }, []);

  if (!state) return <div className="p-9 font-mono text-xs text-muted">loading…</div>;

  const shown = previewTicks ?? ticks;                 // what every visual and table renders
  const ghost = previewTicks ? ticks : prevTicks;      // grey dot: committed state during preview, else last committed
  const numeraire = [0, 1, 2].find((k) => k !== i && k !== j) ?? 0;
  const prices = shown.length ? [0, 1, 2].map((k) => poolPrice(pricingTicks(shown), k, numeraire)) : [1, 1, 1];
  // Committed reserves come from the client exactly as reported (on-chain they are exact
  // integers); recomputing them from tick vectors in float drifts by ~1e-12 * radius, which on a
  // 6.5e9 radius tick shows up as a cent in the TVL. During a preview only the *delta* between
  // preview and committed ticks is taken from the float math, so the drift cancels.
  const committedReserves = state.reserves.map(fromUnits);
  const reserves = previewTicks && ticks.length
    ? (() => { const before = poolRealReserves(ticks); const after = poolRealReserves(previewTicks);
               return committedReserves.map((r, k) => r + (after[k] - before[k])); })()
    : committedReserves;
  const tvl = reserves.reduce((a, b) => a + b, 0);
  const tickRows = shown.map((t) => ({ depegBps: t.depegBps, capEff: capitalEfficiency(t.depegBps, 3), state: t.state }));

  const commit = async () => {
    // The button is disabled unless these hold, but a stale quote must never be committed.
    if (!quote || quotedAmount !== amountNum) return;
    const amountIn = amountNum;
    setBusy(true); setError(null); setSwapStatus("signing");
    try {
      setPrevTicks(ticks);
      const res = await client.swap({
        from: address ?? "", tokenIn, tokenOut,
        amountIn: toUnits(amountIn),
        minOut: (quote.amountOut * 995n) / 1000n,
        onStatus: setSwapStatus,
      });
      setClassic((c) => (c ? classicApply(c, i, j, amountIn) : c));
      setLastTx({
        hash: res.txHash,
        amountIn,
        // the backend may not be able to read the fill back off-chain; fall back to the quote
        amountOut: fromUnits(res.amountOut > 0n ? res.amountOut : quote.amountOut),
        tokenIn, tokenOut, at: Date.now(),
      });
      setSwapStatus("confirmed");
      setAmount(""); setQuote(null); setQuotedAmount(null);
      // Pull the committed state before COMMIT can be armed again: the slider cap and the
      // quotes both read from it, and an on-chain backend's own poll lands seconds later.
      try { await refresh(); } catch { /* the subscription poll retries */ }
      // The wallet's balance just moved too — refresh it so the wallet cap (and the
      // insufficient-balance check) reflect what's actually left to spend.
      refreshWalletBalances();
    } catch (e) { setSwapStatus("failed"); setError(toUiError(e)); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    await client.reset?.();
    setPrevTicks(undefined); setAmount(""); setClassic(null); setQuote(null); setQuotedAmount(null);
    setSwapStatus("idle");
  };
  // changing the pair counts as the "next action" too — same rule as `onAmount`
  const clearAftermath = () => setSwapStatus((s) => (s === "confirmed" || s === "failed" ? "idle" : s));
  const flip = () => { clearAftermath(); setTokenIn(tokenOut); setTokenOut(tokenIn); };
  const pickIn = (c: string) => { clearAftermath(); if (c === tokenOut) setTokenOut(tokenIn); setTokenIn(c); };
  const pickOut = (c: string) => { clearAftermath(); if (c === tokenIn) setTokenIn(tokenOut); setTokenOut(c); };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-60px)]">
      <section
        aria-label="Stage"
        className="grid grid-cols-1 items-stretch gap-7 px-9 pt-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[620px_1fr_320px]"
      >
        <div className="relative flex min-h-0 flex-col gap-1.5">
          <PanelLabel>
            TICK PLANES
            {previewTicks && (
              <span
                data-testid="preview-badge"
                className="ml-2 rounded-full border border-accent/35 px-2 py-0.5 text-[10px] tracking-[0.14em] text-accent"
              >
                PREVIEW
              </span>
            )}
          </PanelLabel>
          {shown.length > 0 && <TickPlanes ticks={shown} prev={ghost} previewing={!!previewTicks} />}
        </div>

        <div className="relative flex min-h-0 flex-col gap-1.5 lg:pt-10">
          <PanelLabel>{tokenIn} / {tokenOut} CURVE</PanelLabel>
          {shown.length > 0 && (
            <ClassicCurve
              i={i} j={j}
              classic={classic ?? reserves} classicCurrent={classicPreview ?? classic ?? reserves}
            />
          )}
        </div>

        <Hud reserves={reserves} prices={prices} tvl={tvl} ticks={tickRows} lastTx={lastTx} />
      </section>

      <div className="px-9 pt-4 pb-7">
        <ControlBar
          tokenIn={tokenIn} tokenOut={tokenOut} amount={amount} maxAmount={sliderMax} walletMax={walletMax}
          walletCapped={walletCapped} landingAmounts={landingAmounts}
          quoteOut={quote && quotedAmount === amountNum ? fromUnits(quote.amountOut) : null} price={quote?.priceAfter ?? null}
          error={error} busy={busy} swapStatus={swapStatus} lastTx={lastTx}
          classic={classicQuote ? { amountOut: classicQuote.amountOut, price: classicQuote.priceAfter } : null}
          onTokenIn={pickIn} onTokenOut={pickOut} onAmount={onAmount} onFlip={flip} onCommit={commit} onReset={reset} />
      </div>
    </div>
  );
}
