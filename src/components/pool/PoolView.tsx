"use client";
import { useEffect, useMemo, useState } from "react";
import { usePool } from "@/hooks/usePool";
import { useWallet } from "@/hooks/useWallet";
import { TOKENS, tokenIndex } from "@/config/tokens";
import { fromUnits, toUnits, PoolError, type Quote } from "@/lib/pool";
import { ticksFromState } from "@/lib/pool/reconstruct";
import { capitalEfficiency, maxFillable, poolPrice, poolRealReserves, pricingTicks, quote as mathQuote, type Tick } from "@/lib/orbital";
import { cpQuote, classicApply, classicSeed } from "@/lib/classic/constantProduct";
import { TickPlanes } from "./TickPlanes";
import { TwoTokenCurve } from "./TwoTokenCurve";
import { SwapForm } from "./SwapForm";
import { ReservesTable } from "./ReservesTable";
import { TicksTable } from "./TicksTable";

type WithTicks = { getTicks?: () => Tick[] };

export function PoolView() {
  const { state, client } = usePool();
  const { address } = useWallet();
  const [tokenIn, setTokenIn] = useState(TOKENS[0].code);
  const [tokenOut, setTokenOut] = useState(TOKENS[1].code);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotedAmount, setQuotedAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prevTicks, setPrevTicks] = useState<Tick[] | undefined>();
  const [classic, setClassic] = useState<number[] | null>(null);

  // committed math-level ticks
  const ticks = useMemo<Tick[]>(() => {
    if (!state) return [];
    const g = (client as unknown as WithTicks).getTicks;
    return g ? g.call(client) : ticksFromState(state);
  }, [state, client]);

  // seed the classic comparison pool once from the committed real reserves
  useEffect(() => {
    if (classic === null && ticks.length) setClassic(classicSeed(poolRealReserves(ticks)));
  }, [ticks, classic]);

  const i = tokenIndex(tokenIn), j = tokenIndex(tokenOut);
  // cap the slider at what the committed pool can actually fill, so a max-slider swap
  // never round-trips an InsufficientLiquidity error from the client.
  const maxIn = useMemo(
    () => (ticks.length ? Math.max(Math.floor(maxFillable(ticks, i, j)), 1) : 1),
    [ticks, i, j],
  );
  const amountNum = Number(amount);
  // synchronous, independent of the debounced client round trip — the classic row and
  // classic dot must move instantly with the slider, same as the Orbital preview does.
  const classicQuote = classic && amountNum > 0 ? cpQuote(classic[i], classic[j], amountNum) : null;
  const classicPreview = classicQuote ? classicApply(classic!, i, j, amountNum) : undefined;

  // live preview from the pure math library (no client round trip)
  const previewTicks = useMemo<Tick[] | null>(() => {
    if (!(amountNum > 0) || ticks.length === 0) return null;
    try { return mathQuote(ticks, i, j, amountNum).ticks; } catch { return null; }
  }, [ticks, i, j, amountNum]);

  // authoritative numeric quote from the client (debounced)
  useEffect(() => {
    if (!(amountNum > 0)) { setQuote(null); setQuotedAmount(null); setError(null); return; }
    const h = setTimeout(async () => {
      try {
        const q = await client.quote(tokenIn, tokenOut, toUnits(amountNum));
        setQuote(q); setQuotedAmount(amountNum); setError(null);
      } catch (e) { setQuote(null); setQuotedAmount(null); setError(e instanceof PoolError ? e.message : String(e)); }
    }, 80);
    return () => clearTimeout(h);
  }, [amountNum, tokenIn, tokenOut, client]);

  if (!state) return <div className="p-6 font-mono text-muted">loading…</div>;

  const shown = previewTicks ?? ticks;                 // what every visual and table renders
  const ghost = previewTicks ? ticks : prevTicks;      // grey dot: committed state during preview, else last committed
  const numeraire = [0, 1, 2].find((k) => k !== i && k !== j) ?? 0;
  const prices = shown.length ? [0, 1, 2].map((k) => poolPrice(pricingTicks(shown), k, numeraire)) : [1, 1, 1];
  const reserves = shown.length ? poolRealReserves(shown) : state.reserves.map(fromUnits);
  const tvl = reserves.reduce((a, b) => a + b, 0);
  const tickRows = shown.map((t) => ({ depegBps: t.depegBps, capEff: capitalEfficiency(t.depegBps, 3), state: t.state }));

  const commit = async () => {
    if (!quote) return;
    setBusy(true);
    try {
      setPrevTicks(ticks);
      await client.swap({ from: address ?? "", tokenIn, tokenOut, amountIn: toUnits(amountNum), minOut: (quote.amountOut * 995n) / 1000n });
      setClassic((c) => (c ? classicApply(c, i, j, amountNum) : c));
      setAmount(""); setQuote(null); setQuotedAmount(null);
    } catch (e) { setError(e instanceof PoolError ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    await client.reset?.();
    setPrevTicks(undefined); setAmount(""); setClassic(null); setQuote(null); setQuotedAmount(null);
  };
  const flip = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); };
  const pickIn = (c: string) => { if (c === tokenOut) setTokenOut(tokenIn); setTokenIn(c); };
  const pickOut = (c: string) => { if (c === tokenIn) setTokenIn(tokenOut); setTokenOut(c); };

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
      <section className="border border-line p-4">
        <h2 className="mb-2 flex justify-between font-mono text-xs text-muted"><span>// SECTION A · TICK PLANES</span>{previewTicks && <span data-testid="preview-badge" className="text-accent">PREVIEW</span>}</h2>
        {shown.length > 0 && <TickPlanes ticks={shown} prev={ghost} />}
      </section>
      <section className="border border-line p-4">
        <h2 className="mb-2 font-mono text-xs text-muted">// SECTION B · {tokenIn}/{tokenOut} PLANE</h2>
        {shown.length > 0 && (
          <TwoTokenCurve ticks={shown} i={i} j={j} prev={ghost} classic={classic ?? reserves} classicPreview={classicPreview} />
        )}
      </section>
      <section className="flex flex-col gap-6 border border-line p-4">
        <h2 className="font-mono text-xs text-muted">// SECTION C · SWAP</h2>
        <SwapForm tokenIn={tokenIn} tokenOut={tokenOut} amount={amount} maxAmount={maxIn}
          quoteOut={quote && quotedAmount === amountNum ? fromUnits(quote.amountOut) : null} price={quote?.priceAfter ?? null} error={error} busy={busy}
          classic={classicQuote ? { amountOut: classicQuote.amountOut, price: classicQuote.priceAfter } : null}
          onTokenIn={pickIn} onTokenOut={pickOut} onAmount={setAmount} onFlip={flip} onCommit={commit} onReset={reset} />
        <ReservesTable reserves={reserves} prices={prices} tvl={tvl} />
        <TicksTable ticks={tickRows} />
      </section>
    </div>
  );
}
