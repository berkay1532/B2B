export const SCALE = 10_000_000n;

// `n * 1e7` loses low-order digits once it exceeds Number.MAX_SAFE_INTEGER (2^53,
// ~9.0e15 stroops, i.e. n above ~9.0e8 tokens). That's safe for every amount and
// reserve in this demo (the $30M seed pool, its swaps and deposits), but the 10 bps
// tick's TickInfo.radius (~6.5e9 tokens -> ~6.5e16 stroops) is above that threshold
// and is imprecise in its last digits — display-only, never fed back into a swap.
export const toUnits = (n: number): bigint => BigInt(Math.round(n * 1e7));
export const fromUnits = (b: bigint): number => Number(b) / 1e7;

export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
