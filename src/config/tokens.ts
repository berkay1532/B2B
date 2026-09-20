export interface TokenConfig {
  code: string;
  contractId: string; // Soroban contract id of the Stellar Asset Contract (SAC) on testnet
  decimals: 7;
  colorVar: string;   // CSS variable name defined in globals.css
  issuer: string;     // classic asset issuer public key behind the SAC
}

// Testnet issuer for all three pool tokens (CLI identity `orbital-issuer`
// holds the secret locally; see docs/contract-interface.md for the mint
// command). Tokens are USDC, USDT, USDX — all USD-pegged, matching
// Orbital's requirement that pool tokens hold parity with each other.
const ISSUER = "GBF7D4OLVZUPVMXZEXHCKRN7B6HFZSY4AHOUGOGGG2GIIIIOYYSI2FSE";

export const TOKENS: TokenConfig[] = [
  { code: "USDC", contractId: "CBRFIFQ7O2VVQ63FMO5F3B5F4YWKQJ4534U37CJF54CK324BRNV4XW5D", decimals: 7, colorVar: "--token-0", issuer: ISSUER },
  { code: "USDT", contractId: "CARZAUBVAK236YBY3VQCDBOX4M47YXJZX7ISSLU7WOQABMCE2O7EX3CR", decimals: 7, colorVar: "--token-1", issuer: ISSUER },
  { code: "USDX", contractId: "CBDADMCSOYPDB3ADEEZUBEKHQ2VTEM34SKOQ2DXI2VKLCYBKD37PFQJJ", decimals: 7, colorVar: "--token-2", issuer: ISSUER },
];

export const tokenIndex = (code: string): number => {
  const i = TOKENS.findIndex((t) => t.code === code);
  if (i < 0) throw new Error(`unknown token ${code}`);
  return i;
};

export const NETWORK = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  explorerBase: "https://stellar.expert/explorer/testnet",
};

/** stellar.expert link for a submitted transaction hash. Same host the wallet panel uses. */
export const txExplorerUrl = (hash: string): string => `${NETWORK.explorerBase}/tx/${hash}`;
