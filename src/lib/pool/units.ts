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

/**
 * Full-precision grouped amount, e.g. `9,999,000.00`. `formatUsd`'s `$10.00M` is right for
 * a headline but hides everything a demo swap actually moves, so the HUD's reserve rows use
 * this instead and rely on `tabular-nums` to keep the columns from jittering.
 */
export function formatAmount(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `a1b2c3d4…9f0e` — enough of a 64-char tx hash to recognise, short enough for one line. */
export function shortHash(hash: string): string {
  return hash.length <= 12 ? hash : `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}
