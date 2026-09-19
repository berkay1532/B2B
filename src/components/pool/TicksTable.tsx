export interface TickRow { depegBps: number; capEff: number; state: "interior" | "boundary" }

export function TicksTable({ ticks }: { ticks: TickRow[] }) {
  return (
    <table className="w-full font-mono text-sm">
      <thead><tr className="text-muted"><th className="text-left">DEPEG</th><th className="text-left">CAP. EFF.</th><th className="text-right">STATE</th></tr></thead>
      <tbody>
        {ticks.map((t) => (
          <tr key={t.depegBps}><td>{t.depegBps / 100}%</td><td>{t.capEff.toFixed(1)}×</td>
            <td className={`text-right ${t.state === "boundary" ? "text-boundary" : "text-muted"}`}>{t.state.toUpperCase()}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
