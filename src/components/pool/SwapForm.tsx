"use client";
import { TOKENS } from "@/config/tokens";
import { formatUsd } from "@/lib/pool";

export interface SwapFormProps {
  tokenIn: string; tokenOut: string; amount: string;
  maxAmount: number;
  quoteOut: number | null; price: number | null; error: string | null; busy: boolean;
  classic: { amountOut: number; price: number } | null;
  onTokenIn(code: string): void; onTokenOut(code: string): void; onAmount(v: string): void;
  onFlip(): void; onCommit(): void; onReset(): void;
}

export function SwapForm(p: SwapFormProps) {
  const Sel = ({ value, onChange }: { value: string; onChange(v: string): void }) => (
    <div className="flex gap-1">
      {TOKENS.map((t) => (
        <button key={t.code} type="button" onClick={() => onChange(t.code)}
          className={`rounded px-2 py-1 font-mono text-xs ${value === t.code ? "bg-accent text-bg" : "border border-line text-muted"}`}>{t.code}</button>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 font-mono text-sm">
      <div className="flex items-center justify-between"><span className="text-muted">PAY</span><Sel value={p.tokenIn} onChange={p.onTokenIn} /></div>
      <input aria-label="amount in" inputMode="decimal" value={p.amount} onChange={(e) => p.onAmount(e.target.value)}
        placeholder="0.00" className="w-full rounded border border-line bg-transparent px-3 py-2 text-lg" />
      <input aria-label="amount slider" type="range" min={0} max={p.maxAmount} step={p.maxAmount / 1000} value={Number(p.amount) || 0}
        onChange={(e) => p.onAmount(e.target.value)} className="w-full" />
      <button type="button" onClick={p.onFlip} className="self-center text-muted">⇅</button>
      <div className="flex items-center justify-between"><span className="text-muted">RECEIVE</span><Sel value={p.tokenOut} onChange={p.onTokenOut} /></div>
      <div className="rounded border border-line px-3 py-2">
        <div data-testid="quote-out" data-value={p.quoteOut ?? ""} className="text-lg">{p.quoteOut === null ? "—" : formatUsd(p.quoteOut)}</div>
        <div className="text-xs text-muted">{p.price === null ? "" : `1 ${p.tokenIn} ≈ ${(1 / p.price).toFixed(5)} ${p.tokenOut}`}</div>
      </div>
      <div className="flex items-center justify-between rounded border border-dashed border-line px-3 py-2 text-xs text-muted">
        <span>CLASSIC x·y=k</span>
        <span data-testid="classic-out" data-value={p.classic?.amountOut ?? ""}>{p.classic ? `${formatUsd(p.classic.amountOut)} · 1 ${p.tokenIn} ≈ ${(1 / p.classic.price).toFixed(5)} ${p.tokenOut}` : "—"}</span>
      </div>
      {p.error && <div className="text-xs text-boundary">{p.error}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={p.busy || p.quoteOut === null} onClick={p.onCommit}
          className="flex-1 rounded bg-accent px-3 py-2 text-bg disabled:opacity-40">COMMIT SWAP</button>
        <button type="button" onClick={p.onReset} className="rounded border border-line px-3 py-2 text-muted">RESET</button>
      </div>
    </div>
  );
}
