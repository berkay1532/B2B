"use client";
import type { ReactNode } from "react";
import { PasskeyWalletProvider, SEMBOL_TESTNET_ARTIFACTS, type SembolTheme } from "@sembol/passkey-react";
import "@sembol/passkey-react/styles.css";

const config = {
  ...SEMBOL_TESTNET_ARTIFACTS,
  appName: "Orbital on Stellar",
};

/**
 * Maps Sembol's theme onto the Observatory palette (see globals.css). `sembolThemeToCss`
 * just interpolates these into `--sembol-*` custom-property declarations (e.g.
 * `--sembol-color-accent: var(--accent);`), so referencing our own CSS variables here works
 * — the theme API accepts any valid CSS <color>, and none of our tokens need to be literal
 * hex. Minimal backstop overrides for anything this doesn't cover live in globals.css.
 */
const theme: SembolTheme = {
  colorScheme: "dark",
  accent: "var(--accent)",
  radius: "lg",
  fonts: {
    body: "var(--font-sans)",
    mono: "var(--font-mono)",
  },
  colors: {
    bg: "var(--bg)",
    surface: "var(--bg-2)",
    surfaceHover: "var(--bg-2)",
    border: "var(--line)",
    borderStrong: "var(--line)",
    fg: "var(--fg)",
    fgMuted: "var(--muted)",
    onAccent: "var(--bg)",
    overlay: "rgb(5 7 13 / 0.78)",
  },
};

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <PasskeyWalletProvider config={config} theme={theme}>
      {children}
    </PasskeyWalletProvider>
  );
}
