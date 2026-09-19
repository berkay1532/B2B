export interface TokenConfig {
  code: string;
  contractId: string; // Soroban contract id of the SAC; placeholder until deployed
  decimals: 7;
  colorVar: string;   // CSS variable name defined in globals.css
}

export const TOKENS: TokenConfig[] = [
  { code: "USDC", contractId: "C_PLACEHOLDER_USDC", decimals: 7, colorVar: "--token-0" },
  { code: "EURC", contractId: "C_PLACEHOLDER_EURC", decimals: 7, colorVar: "--token-1" },
  { code: "USDX", contractId: "C_PLACEHOLDER_USDX", decimals: 7, colorVar: "--token-2" },
];

export const tokenIndex = (code: string): number => {
  const i = TOKENS.findIndex((t) => t.code === code);
  if (i < 0) throw new Error(`unknown token ${code}`);
  return i;
};
