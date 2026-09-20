# Observatory Visual Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the working demo to the approved "Observatory / Layout A" design without changing any math or adapter code.

**Architecture:** Only `src/app/globals.css`, `src/app/layout.tsx`, `src/components/**` and page files change. `lib/orbital`, `lib/pool`, `lib/classic`, `lib/attack` and hooks stay as they are, except one new pure helper `tickLandingAmounts` added to `lib/orbital/swap.ts` for the slider markers. All colours and fonts stay routed through Tailwind theme tokens.

**Tech Stack:** Next.js 16, Tailwind v4 (`@theme inline`), `next/font/google` (Instrument Sans, JetBrains Mono), inline SVG with filters.

**Spec:** `docs/superpowers/specs/2026-09-19-orbital-stellar-frontend-design.md` §5.4 and the mockup `docs/design/observatory-stage-mockup.html` (the mockup is the visual source of truth: copy its colours, spacing, radii, glow filters and copy).

## Global Constraints

- Theme tokens (`globals.css`): `--bg #05070d`, `--bg-2 #0d1630`, `--fg #e6ebf7`, `--muted #6e7a94`, `--muted-2 #8a96b3`, `--line rgba(120,150,255,0.14)`, `--accent #37f0d0`, `--boundary #ffb454`, `--ghost #3b4661`, `--token-0/1/2` may stay. Fonts: `--font-sans` = Instrument Sans, `--font-mono` = JetBrains Mono, both via `next/font/google` with system fallbacks. No hex in components; SVG `stroke`/`fill` use `currentColor` + Tailwind text colour classes or `var(--accent)` via the theme utilities.
- Existing tests must keep passing: keep every `aria-label`, `data-testid` (`amount in`, `amount slider`, `quote-out`, `classic-out`, `preview-badge`, `orbital-dot`, `classic-dot`, `ob-price`, `orb-price`, `orb-capped`, `attack budget`), the `COMMIT SWAP` / `RESET` button texts, `BOUNDARY`/`INTERIOR` texts, `$30.00M` TVL text. Where a component is restructured, move the attribute to the equivalent element.
- Gates before every commit: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Do not start/stop dev servers (the user's runs on port 3000).
- Commit trailers: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_017DxvTSvPnc5jtsChixebLg`.

---

### Task 1: Theme, fonts, background and header

**Files:** `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout/Header.tsx`, new `src/components/layout/Backdrop.tsx`, `src/components/wallet/ConnectButton.tsx`.

- [ ] `globals.css`: replace the palette with the tokens above; map `--color-*` for each; add `--color-ghost`, `--color-bg-2`; body background `var(--bg)`, colour `var(--fg)`, `font-family: var(--font-sans)`. Add utility-free keyframes `@keyframes orbital-pulse` (ring stroke-opacity 1 → 0.5 → 1 over 900ms) and `@keyframes orbital-fade` (opacity 0.6 → 0 over 700ms) for later tasks.
- [ ] `layout.tsx`: load `Instrument_Sans` (weights 500/600/700) and `JetBrains_Mono` (400/500) from `next/font/google` as CSS variables `--font-instrument` and `--font-jetbrains`; in `@theme inline` set `--font-sans: var(--font-instrument), ui-sans-serif, system-ui, sans-serif` and `--font-mono: var(--font-jetbrains), ui-monospace, SFMono-Regular, Menlo, monospace`. Metadata title `Orbital on Stellar`.
- [ ] `Backdrop.tsx` (server component): the fixed full-page SVG from the mockup (radial vignette `bg` → `bg-2`, three faint orbit ellipses rotated -12°/-14°, six star points), `aria-hidden`, `pointer-events-none`, rendered once in `layout.tsx` behind `<main>`. Colours via `className="fill-…/stroke-…"` or `style={{ stroke: "var(--accent)" }}`; no hex.
- [ ] `Header.tsx`: 60px tall, no bottom border on the pool page (keep a hairline on `/attack`): left wordmark = orbit glyph SVG (accent core, two ellipses) + `ORBITAL` (sans 700, tracking 0.12em) + mono caption `on Stellar · testnet`; centre nav `POOL` / `ATTACK` in mono 12px tracking 0.14em, active link underlined by a 1px accent line; right slot.
- [ ] `ConnectButton.tsx`: pill (34px, radius 999px, 1px accent border, `bg-accent/5`, accent mono text `CONNECT`); connected state shows the short address in the same pill with muted text; error caption unchanged.
- [ ] Gates, commit `style: Observatory theme, fonts, backdrop and header`.

### Task 2: Pool page Layout A

**Files:** `src/components/pool/PoolView.tsx`, `TickPlanes.tsx`, `TwoTokenCurve.tsx` (rename to `ClassicCurve.tsx`), `SwapForm.tsx` (rename to `ControlBar.tsx`), `ReservesTable.tsx`, `TicksTable.tsx`, new `src/components/pool/Hud.tsx`, `src/lib/orbital/swap.ts` (+ test), `src/app/page.tsx`.

- [ ] `lib/orbital/swap.ts`: add `tickLandingAmounts(ticks: Tick[], tokenIn: number, tokenOut: number): { depegBps: number; amountIn: number }[]` = for each tick that is interior, the input amount at which it lands on its plane, found by bisection on `quote(...).ticks[k].state` (40 rounds, upper bound `maxFillable`). Test: on the seed pool 0→1 the amounts are increasing with depegBps and the smallest is between 2.0M and 2.5M (the 10 bps tick lands near 2.2M), and `quote(seed,0,1,amount+1)` marks that tick boundary while `amount-1` leaves it interior.
- [ ] `PoolView.tsx` structure (see mockup): `<section aria-label="Stage" class="grid grid-cols-[620px_1fr_300px] gap-7 px-9 pt-2">` with (a) tick planes column (label `TICK PLANES` + `PREVIEW` chip with `data-testid="preview-badge"`), (b) curve column (label `{tokenIn} / {tokenOut} CURVE`), (c) `<Hud>` bottom-right; below it `<ControlBar>` in a rounded 18px panel with the hairline border and `bg-bg-2/80`. Remove the three `// SECTION` cards. Keep every piece of state and all handlers; only the render tree changes. Pass `landingAmounts={tickLandingAmounts(ticks, i, j)}` (memoised) and `maxAmount` to the control bar.
- [ ] `TickPlanes.tsx`: viewBox 560×560 rendered at 600px; ring radii evenly spaced (54/108/164/220 for four ticks) using the existing `schematicRadius` mapping; interior rings `stroke-muted-2` dashed `2 7`, boundary rings `stroke-boundary` solid with an SVG `feGaussianBlur` glow filter and the `orbital-pulse` animation applied via a class when a ring's state changes from interior to boundary (track previous states with a ref); corner labels 12px mono; the reserve dot r=7 accent with a glow filter; a trail of 3 fading dots at 25/50/75% of the segment from the ghost (or PEG) to the current dot, `fill-accent` with opacity 0.25/0.4/0.6, only while a preview is active; ghost dot `fill-ghost` r=5.5. Keep `projectState`/`schematicRadius` logic untouched.
- [ ] `ClassicCurve.tsx` (was `TwoTokenCurve`): draws ONLY the classic `x·y=k` hyperbola for the pair on real-reserve axes with a faint 4×3 grid, the classic dot (accent, r=7, glow, `data-testid="classic-dot"`), the classic ghost (`fill-ghost`) when a preview is active, dashed accent guide lines from the dot to both axes, and a mono coordinate label `(16.0M, 6.25M)` next to the dot using `formatUsd`-style short numbers without the `$`. Remove the Orbital polyline, its dot and the legend. Keep a hidden `<circle data-testid="orbital-dot" cx cy>` placed at the classic dot? No: update `PoolView.test.tsx` and `TwoTokenCurve.test.tsx` instead: the on-chart test now checks `classic-dot` only, and the "curves do not move during preview" test asserts the hyperbola `d` is identical across previews while `classic-dot` `cx` changes. Axis range: hyperbola sampled from `0.55×classic[i]` to `2.2×classic[i]` (curved, asymptote clipped) and expanded to include both dots with an 8% margin.
- [ ] `Hud.tsx`: the small mono panel from the mockup: `RESERVES · PRICE` grid (token, amount, price coloured accent when ≠ 1.0000) and `TICKS` grid (depeg, cap eff, state with `text-boundary` glow for BOUNDARY). Absorb `ReservesTable`/`TicksTable` into it and delete those files (update imports and tests: keep the `$30.00M` and `BOUNDARY` texts).
- [ ] `ControlBar.tsx` (was `SwapForm`): 4-column grid `200px 1fr 260px 200px`: (1) PAY / RECEIVE rows with token pills (active = accent fill, dark text); (2) `AMOUNT` label + borderless 34px sans input (`aria-label="amount in"`) + token caption + right-aligned mono `max {maxAmount} · liquidity edge`; the full-width range (`aria-label="amount slider"`) styled with an accent track (use `accent-color` plus a custom `::-webkit-slider-thumb` in globals.css: 18px dark disc, 2px accent border, glow) and amber 1px markers positioned at `landingAmounts[k]/maxAmount` with a `ticks cross here ▲` caption; (3) quote box (accent hairline, `bg-accent/5`, 28px number + `EURC`, accent price line, muted `x·y=k would give …` line with `data-testid="classic-out"` + `data-value`); `data-testid="quote-out"` + `data-value` on the big number; (4) `COMMIT SWAP` (46px, accent fill, dark text, glow) over `RESET` (34px outline). Keep `busy`/disabled logic and the flip button (place it as a small icon button between the PAY and RECEIVE rows).
- [ ] `page.tsx`: `<Header right={<ConnectButton />} />` then `<PoolView />`; the stage + bar must fit 1440×900 without page scroll and degrade to a single column below 1200px (`lg:` prefix on the grid).
- [ ] Gates; update snapshots/tests touched; commit `style(pool): Layout A stage + control bar, classic curve panel, glow rings`.

### Task 3: Attack page and final polish

**Files:** `src/components/attack/AttackView.tsx`, `OrderbookPanel.tsx`, `OrbitalPanel.tsx`, `src/app/attack/page.tsx`, `README.md`.

- [ ] Attack page in the same language: title line in sans 22px, two stage panels side by side (each with the mono label, 44px sans number, muted caption, boundary-coloured notice), and the budget slider in a full-width control bar below with the same slider styling; the `LAST-TRADE ORACLE` panel number turns `text-boundary` once the book is exhausted, the Orbital number stays `text-accent`. Keep all test ids.
- [ ] README: replace the "visual direction pending" wording with one sentence pointing at `docs/design/observatory-stage-mockup.html`.
- [ ] Gates; commit `style(attack): Observatory language for the attack page`.
