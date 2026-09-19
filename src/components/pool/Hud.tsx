import { TOKENS } from "@/config/tokens";
import { formatUsd } from "@/lib/pool";

export interface TickRow {
  depegBps: number;
  capEff: number;
  state: "interior" | "boundary";
}

interface Props {
  reserves: number[];
  prices: number[];
  tvl: number;
  ticks: TickRow[];
}

const GRID = "grid grid-cols-[auto_1fr_auto] gap-x-3.5 gap-y-[7px]";
const LABEL = "font-mono text-[9px] tracking-[0.16em] text-muted";

/** Bottom-right readout on the stage: reserves with their marginal prices, then the tick
 *  table. Mono throughout, so the numbers stay column-aligned as they move. */
export function Hud({ reserves, prices, tvl, ticks }: Props) {
  return (
    <aside
      aria-label="Pool readout"
      className="flex flex-col gap-3.5 self-end rounded-[14px] border border-line bg-bg-2/60 px-[18px] py-4 font-mono text-xs lg:mb-2"
    >
      <div className={LABEL}>RESERVES · PRICE</div>
      <div className={GRID}>
        {TOKENS.map((t, k) => (
          <div key={t.code} className="contents">
            <span>{t.code}</span>
            <span className="text-right">{formatUsd(reserves[k])}</span>
            <span className={`text-right ${Math.abs(prices[k] - 1) > 1e-4 ? "text-accent" : "text-muted"}`}>
              {prices[k].toFixed(4)}
            </span>
          </div>
        ))}
        <span className="text-muted-2">TVL</span>
        <span className="text-right text-muted-2">{formatUsd(tvl)}</span>
        <span />
      </div>

      <div className="h-px bg-line" />

      <div className={LABEL}>TICKS</div>
      <div className={GRID}>
        {ticks.map((t) => (
          <div key={t.depegBps} className="contents">
            <span>{t.depegBps / 100}%</span>
            <span>{t.capEff.toFixed(1)}×</span>
            <span
              className={
                t.state === "boundary"
                  ? "text-right text-boundary [text-shadow:0_0_10px_var(--boundary)]"
                  : "text-right text-muted"
              }
            >
              {t.state.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
