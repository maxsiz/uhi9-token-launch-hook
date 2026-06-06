/**
 * prebuild step: read deployed addresses from Foundry broadcast JSON and rewrite
 * lib/config/contracts.generated.ts. Safe to run with no broadcast files — chains without a
 * deployment keep the zero address (UI treats them as "not yet available").
 *
 * Run: npm run gen:contracts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const OUT = join(__dirname, "..", "lib", "config", "contracts.generated.ts");

const CHAINS: { id: number; key: string }[] = [
  { id: 1, key: "mainnet" },
  { id: 8453, key: "base" },
  { id: 42161, key: "arbitrum" },
  { id: 130, key: "unichain" },
  { id: 1301, key: "unichainSepolia" },
];

const WANT = ["TokenLaunchHook", "CampaignWrapper", "TokenFactory", "CampaignLens"] as const;
const ZERO = "0x0000000000000000000000000000000000000000";

function readBroadcast(chainId: number): Record<string, string> {
  const file = join(REPO_ROOT, "broadcast", "DeployStack.s.sol", String(chainId), "run-latest.json");
  const found: Record<string, string> = {};
  if (!existsSync(file)) return found;
  const json = JSON.parse(readFileSync(file, "utf8"));
  // Only treat an artifact as a real deployment if it actually mined (has receipts). A 0-receipt
  // run-latest.json is a simulation/dry-run and its addresses are not live — keep the chain at ZERO.
  if (!Array.isArray(json.receipts) || json.receipts.length === 0) return found;
  for (const tx of json.transactions ?? []) {
    if (tx.contractName && WANT.includes(tx.contractName) && tx.contractAddress) {
      found[tx.contractName] = tx.contractAddress;
    }
  }
  return found;
}

const rows = CHAINS.map(({ id, key }) => {
  const a = readBroadcast(id);
  const hook = a.TokenLaunchHook ?? ZERO;
  const wrapper = a.CampaignWrapper ?? ZERO;
  const factory = a.TokenFactory ?? ZERO;
  const lens = a.CampaignLens ?? ZERO;
  const status = wrapper === ZERO ? "  (not deployed)" : "";
  console.log(`chain ${id} (${key}): wrapper=${wrapper}${status}`);
  return `  [${key}.id]: { hook: "${hook}", wrapper: "${wrapper}", factory: "${factory}", lens: "${lens}" },`;
}).join("\n");

const content = `// GENERATED FILE — do not hand-edit. Source: broadcast/DeployStack.s.sol/{chainId}/run-latest.json
import type { Address } from "viem";
import { mainnet, base, arbitrum, unichain, unichainSepolia } from "wagmi/chains";
import type { SupportedChainId } from "./chains";

export interface StackAddresses {
  hook: Address;
  wrapper: Address;
  factory: Address;
  lens: Address;
}

const ZERO = "${ZERO}" as const;

export const CONTRACTS: Record<SupportedChainId, StackAddresses> = {
${rows}
};

export function isDeployed(chainId: SupportedChainId): boolean {
  return CONTRACTS[chainId].wrapper !== ZERO;
}
`;

writeFileSync(OUT, content);
console.log(`wrote ${OUT}`);
