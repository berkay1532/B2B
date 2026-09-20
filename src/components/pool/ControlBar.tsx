"use client";
import { TOKENS, txExplorerUrl } from "@/config/tokens";
import { formatAmount, formatUsd, shortHash, type SwapReceipt, type SwapStatus } from "@/lib/pool";

export interface ControlBarProps {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  /** slider's actual cap — the pool's liquidity edge, or the connected wallet's on-chain
   *  balance for `tokenIn` if that's lower (see `walletCapped`). */
  maxAmount: number;
  /** connected wallet's on-chain `tokenIn` balance, display units. `null` when there's no
   *  wallet to cap against (mock client, disconnected, or the balance hasn't loaded yet) —
   *  in that case `maxAmount` is purely the pool's liquidity edge. */
  walletMax: number | null;
  /** true when `maxAmount` came from `walletMax` rather than the pool's own liquidity edge. */
  walletCapped: boolean;
  /** input amounts at which a tick lands on its plane — the amber slider markers */
  landingAmounts: { depegBps: number; amountIn: number }[];
  quoteOut: number | null;
  price: number | null;
  error: string | null;
  busy: boolean;
  /** Phase of the swap the user last committed; drives the button label and the status line. */
  swapStatus: SwapStatus;
  /** Receipt of the last committed swap, shown next to `confirmed`. */
  lastTx: SwapReceipt | null;
  classic: { amountOut: number; price: number } | null;
  onTokenIn(code: string): void;
  onTokenOut(code: string): void;
  onAmount(v: string): void;
  onFlip(): void;
  onCommit(): void;
  onReset(): void;
}

/** keep only digits and a single decimal point, so the grouped display round-trips */
function sanitize(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const [head, ...rest] = cleaned.split(".");
  return rest.length ? `${head}.${rest.join("")}` : head;
}

function grouped(v: string): string {
  if (v === "") return "";
  const [head, frac] = v.split(".");
  const withSeps = head.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? withSeps : `${withSeps}.${frac}`;
}

const short = (n: number) => formatUsd(n).slice(1);

const PILL = "h-[26px] rounded-full px-2.5 font-mono text-[11px] transition-colors";

function TokenPills({
  label,
  value,
  disabled,
  onChange,
}: { label: string; value: string; disabled: boolean; onChange(v: string): void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[54px] font-mono text-[9px] tracking-[0.14em] text-muted">{label}</span>
      {TOKENS.map((t) => (
        <button
          key={t.code}
          type="button"
          disabled={disabled}
          onClick={() => onChange(t.code)}
          aria-pressed={value === t.code}
          className={`${PILL} disabled:opacity-40 ${
            value === t.code
              ? "border border-accent bg-accent font-medium text-bg"
              : "border border-line text-muted-2 hover:text-fg"
          }`}
        >
          {t.code}
        </button>
      ))}
    </div>
  );
}

/** Label shown on the commit button while a swap is in flight. */
const BUSY_LABEL: Partial<Record<SwapStatus, string>> = { submitting: "SUBMITTING…" };

export function ControlBar(p: ControlBarProps) {
  const amountNum = Number(p.amount) || 0;
  const fill = Math.max(0, Math.min(1, amountNum / (p.maxAmount || 1)));
  const markers = p.landingAmounts
    .map((l) => ({ depegBps: l.depegBps, at: l.amountIn / (p.maxAmount || 1) }))
    .filter((m) => m.at > 0 && m.at <= 1);
  const busyLabel = BUSY_LABEL[p.swapStatus] ?? "SIGNING…";
  // The typed amount isn't clamped by the slider (only dragging is), so it can still exceed
  // the wallet's actual balance — that's exactly the case that used to reach the chain and
  // fail at signing with "balance is not sufficient to spend". Block it here instead.
  const insufficientBalance = p.walletMax != null && amountNum > p.walletMax;
  const commitDisabled = p.busy || p.quoteOut === null || insufficientBalance;

  return (
    <section
      aria-label="Swap controls"
      className="relative grid grid-cols-1 items-center gap-6 rounded-[18px] border border-line bg-bg-2/80 px-[22px] pt-[18px] pb-5 lg:grid-cols-[200px_1fr_260px_200px]"
    >
      {/* 1 · pair */}
      <div className="flex flex-col gap-2.5">
        <TokenPills label="PAY" value={p.tokenIn} disabled={p.busy} onChange={p.onTokenIn} />
        <button
          type="button"
          disabled={p.busy}
          onClick={p.onFlip}
          aria-label="flip tokens"
          className="flex h-[20px] w-[20px] items-center justify-center self-start rounded-full border border-line font-mono text-[10px] leading-none text-muted-2 hover:border-accent hover:text-accent disabled:opacity-40"
        >
          ⇅
        </button>
        <TokenPills label="RECEIVE" value={p.tokenOut} disabled={p.busy} onChange={p.onTokenOut} />
      </div>

      {/* 2 · amount + slider */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <label className="flex min-w-0 items-baseline gap-2.5">
            <span className="font-mono text-[9px] tracking-[0.14em] text-muted">AMOUNT</span>
            <input
              aria-label="amount in"
              inputMode="decimal"
              value={grouped(p.amount)}
              disabled={p.busy}
              onChange={(e) => p.onAmount(sanitize(e.target.value))}
              placeholder="0"
              className="h-10 w-[240px] min-w-0 border-0 bg-transparent p-0 text-[34px] font-semibold tracking-[-0.01em] text-fg placeholder:text-ghost focus:outline-none"
            />
            <span className="font-mono text-[11px] text-muted-2">{p.tokenIn}</span>
          </label>
          <span className="shrink-0 font-mono text-[10px] text-muted">
            max {grouped(String(p.maxAmount))} · {p.walletCapped ? "wallet balance" : "liquidity edge"}
          </span>
        </div>

        <div className="relative flex h-6 items-center">
          <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
          <div
            className="absolute left-0 h-[3px] rounded-full bg-accent shadow-[0_0_10px_var(--accent)]"
            style={{ width: `${fill * 100}%` }}
          />
          {markers.map((m) => (
            <div
              key={m.depegBps}
              aria-hidden="true"
              title={`${m.depegBps / 100}% tick lands here`}
              className="absolute top-0 h-6 w-px bg-boundary opacity-70"
              style={{ left: `${m.at * 100}%` }}
            />
          ))}
          <input
            aria-label="amount slider"
            type="range"
            min={0}
            max={p.maxAmount}
            step={p.maxAmount / 1000}
            disabled={p.busy}
            value={Math.min(amountNum, p.maxAmount)}
            // whole tokens only: the step is maxAmount/1000, and a big number with three
            // stray decimals reads like a glitch on a 34px display face
            onChange={(e) => p.onAmount(String(Math.round(Number(e.target.value))))}
            className="orbital-slider absolute inset-x-0"
          />
        </div>

        <div className="flex justify-between font-mono text-[9px] tracking-[0.1em] text-muted">
          <span>0</span>
          {markers.length > 0 && <span className="text-boundary">ticks cross here ▲</span>}
          <span>{short(p.maxAmount)}</span>
        </div>
      </div>

      {/* 3 · quote */}
      <div className="flex flex-col gap-1 rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-3">
        <div className="flex items-baseline gap-2">
          <span
            data-testid="quote-out"
            data-value={p.quoteOut ?? ""}
            className={`text-[28px] font-semibold tracking-[-0.01em] ${p.quoteOut === null ? "text-ghost" : ""}`}
          >
            {p.quoteOut === null ? "0.00" : formatUsd(p.quoteOut)}
          </span>
          <span className="font-mono text-[11px] text-muted-2">{p.tokenOut}</span>
        </div>
        <div className="font-mono text-[10px] text-accent">
          {p.price === null ? " " : `1 ${p.tokenIn} ≈ ${(1 / p.price).toFixed(5)} ${p.tokenOut}`}
        </div>
        <div data-testid="classic-out" data-value={p.classic?.amountOut ?? ""} className="font-mono text-[10px] text-muted">
          {p.classic ? `x·y=k would give ${formatUsd(p.classic.amountOut)}` : "x·y=k comparison"}
        </div>
        <div className="font-mono text-[9px] text-muted-2">x·y=k pool seeded at the same TVL, balanced</div>
      </div>

      {/* 4 · actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={commitDisabled}
          onClick={p.onCommit}
          className="h-[46px] rounded-xl bg-accent font-mono text-xs font-medium tracking-[0.16em] text-bg shadow-[0_0_24px_color-mix(in_srgb,var(--accent)_35%,transparent)] disabled:opacity-40 disabled:shadow-none"
        >
          {p.busy ? (
            <span className="flex items-center justify-center gap-2">
              <span aria-hidden="true" className="orbital-spinner" />
              {busyLabel}
            </span>
          ) : (
            "COMMIT SWAP"
          )}
        </button>
        <button
          type="button"
          disabled={p.busy}
          onClick={p.onReset}
          className="h-[34px] rounded-xl border border-line font-mono text-[11px] tracking-[0.12em] text-muted-2 hover:text-fg disabled:opacity-40"
        >
          RESET
        </button>
        {/* One line of aftermath, kept until the next action (see `PoolView.onAmount`) and
            de-emphasised by a pure-CSS fade at ~6s — no timer, so tests stay deterministic.
            The slot is always present so the bar doesn't jump when the line appears. */}
        <div className="min-h-[14px]">
          {insufficientBalance ? (
            <div data-testid="insufficient-balance" className="truncate font-mono text-[10px] text-boundary">
              insufficient {p.tokenIn} balance ({formatAmount(p.walletMax as number)})
            </div>
          ) : p.swapStatus === "confirmed" && (
            <div
              data-testid="swap-status"
              className="orbital-fade-late truncate font-mono text-[10px] text-accent"
            >
              {p.lastTx?.hash ? (
                <>
                  confirmed ·{" "}
                  <a
                    href={txExplorerUrl(p.lastTx.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {shortHash(p.lastTx.hash)} ↗
                  </a>
                </>
              ) : (
                "confirmed · local"
              )}
            </div>
          )}
        </div>
      </div>

      {p.error && (
        <div className="font-mono text-[10px] text-boundary lg:col-span-4">{p.error}</div>
      )}
    </section>
  );
}
