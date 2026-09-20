// The attack page builds its own standalone comparison pool and deliberately
// stays on v1 (`quote`/`maxFillable`, not the `Auto` helpers): it is a fixed
// illustration whose published numbers should not move with
// `NEXT_PUBLIC_ORBITAL_MODE`, and it has no `PoolClient` to take a mode from.
import { createTick, maxFillable, quote, OrbitalError, type Tick } from "@/lib/orbital";

export interface Ask { price: number; size: number }
export interface SweepResult { filled: number; spent: number; lastPrice: number; exhausted: boolean; levelsHit: number }

/** A near-dead market: under $10K of asks, then nothing. Last level mirrors USTRY's $107 print. */
export const THIN_BOOK: Ask[] = [
  { price: 1.0, size: 800 }, { price: 1.02, size: 400 }, { price: 1.1, size: 250 }, { price: 1.5, size: 120 },
  { price: 3, size: 60 }, { price: 10, size: 30 }, { price: 40, size: 15 }, { price: 107, size: 10 },
];

export function sweep(book: Ask[], budgetUsd: number): SweepResult {
  let budget = budgetUsd, filled = 0, spent = 0, lastPrice = book[0]?.price ?? 0, levelsHit = 0;
  for (const ask of book) {
    if (budget <= 0) break;
    const cost = ask.price * ask.size;
    levelsHit++;
    lastPrice = ask.price;
    if (budget >= cost) { budget -= cost; spent += cost; filled += ask.size; }
    else { const qty = budget / ask.price; filled += qty; spent += budget; budget = 0; }
  }
  return { filled, spent, lastPrice, exhausted: budget > 0, levelsHit };
}

export function attackPool(): Tick[] {
  return [100, 500, 1000].map((bps) => createTick(`a${bps}`, bps, 500_000, 3));
}

const IN = 0, OUT = 1;

export interface OrbitalOutcome { price: number; capped: boolean; spent: number; received: number; maxSpend: number }

export function orbitalOutcome(budget: number): OrbitalOutcome {
  const pool = attackPool();
  const maxSpend = maxFillable(pool, IN, OUT);
  if (!(budget > 0)) return { price: 1, capped: false, spent: 0, received: 0, maxSpend };
  try {
    const q = quote(pool, IN, OUT, budget);
    return { price: q.priceAfter, capped: false, spent: budget, received: q.amountOut, maxSpend };
  } catch (e) {
    if (!(e instanceof OrbitalError) || e.code !== "InsufficientLiquidity") throw e;
    const q = quote(pool, IN, OUT, maxSpend);
    return { price: q.priceAfter, capped: true, spent: maxSpend, received: q.amountOut, maxSpend };
  }
}
