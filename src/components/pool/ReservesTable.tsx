import { TOKENS } from "@/config/tokens";
import { formatUsd } from "@/lib/pool";

export function ReservesTable({ reserves, prices, tvl }: { reserves: number[]; prices: number[]; tvl: number }) {
  return (
    <table className="w-full font-mono text-sm">
      <thead><tr className="text-muted"><th className="text-left">RESERVE</th><th className="text-right">AMOUNT</th><th className="text-right">PRICE</th></tr></thead>
      <tbody>
        {TOKENS.map((t, i) => (
          <tr key={t.code}><td>{t.code}</td><td className="text-right">{formatUsd(reserves[i])}</td>
            <td className={`text-right ${Math.abs(prices[i] - 1) > 1e-4 ? "text-accent" : "text-muted"}`}>{prices[i].toFixed(4)}</td></tr>
        ))}
        <tr className="border-t border-line"><td>TVL</td><td className="text-right">{formatUsd(tvl)}</td><td /></tr>
      </tbody>
    </table>
  );
}
