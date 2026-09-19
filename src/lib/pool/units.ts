export const SCALE = 10_000_000n;

export const toUnits = (n: number): bigint => BigInt(Math.round(n * 1e7));
export const fromUnits = (b: bigint): number => Number(b) / 1e7;

export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
