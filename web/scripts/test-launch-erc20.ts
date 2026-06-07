/**
 * Headless E2E for the ERC-20-pair launch path (the Permit2 + factory-first flow the wizard runs for a
 * fresh token paired with USDC). Signed by the default Foundry account on an anvil fork of Unichain
 * Sepolia; USDC is funded by impersonating an on-chain holder. Mirrors useLaunch's steps with viem.
 *
 *   anvil --fork-url <unichain-sepolia> --port 8545 --auto-impersonate &
 *   npx tsx scripts/test-launch-erc20.ts
 */
import { createPublicClient, createWalletClient, http, parseEventLogs, maxUint256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";

import { prepareLaunch } from "../lib/campaign/launch";
import { CampaignWrapperAbi, CampaignLensAbi, Erc20Abi, Permit2Abi, TokenFactoryAbi } from "../lib/config/abi";
import { CONTRACTS } from "../lib/config/contracts.generated";
import { PERMIT2 } from "../lib/config/uniswap";

const RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // foundry #0
const USDC = "0x31d0220469e10c4E71834a79b1f276d740d3768F" as Address;
const USDC_WHALE = "0x97ba7778dD9CE27bD4953c136F3B3b7b087E14c1" as Address; // holds USDC on the fork

async function main() {
  const account = privateKeyToAccount(PK);
  const transport = http(RPC);
  const pub = createPublicClient({ chain: unichainSepolia, transport });
  const wallet = createWalletClient({ account, chain: unichainSepolia, transport });
  const { wrapper, factory, lens } = CONTRACTS[unichainSepolia.id];

  // Top up ETH (OP-stack fork charges a large simulated L1 fee per tx).
  await pub.request({ method: "anvil_setBalance" as never, params: [account.address, "0xd3c21bcecceda1000000"] as never }); // 1e24 wei

  // Fund the Foundry account with USDC by impersonating a holder (anvil --auto-impersonate).
  const whale = createWalletClient({ account: USDC_WHALE, chain: unichainSepolia, transport });
  await whale.writeContract({ address: USDC, abi: Erc20Abi, functionName: "transfer", args: [account.address, 5_000_000n] });
  console.log("USDC funded:", (await pub.readContract({ address: USDC, abi: Erc20Abi, functionName: "balanceOf", args: [account.address] })) as bigint);

  // 1) Factory-first deploy so currency ordering vs USDC is known.
  const cfg = { name: "Wizard ERC20", symbol: "WIZ20", totalSupply: 1_000_000n * 10n ** 18n };
  const sim = await pub.simulateContract({ account, address: factory, abi: TokenFactoryAbi, functionName: "deployToken", args: [cfg, account.address] });
  const tokenAddress = sim.result as Address;
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(sim.request) });
  console.log("token deployed:", tokenAddress);

  const prepared = prepareLaunch(
    {
      existingToken: tokenAddress,
      tokenAddress,
      tokenDecimals: 18,
      pair: { address: USDC, decimals: 6 },
      seedTokenHuman: "100000",
      seedPairHuman: "1",
      launchDurationDays: 1,
      tickSpacing: 60,
      staticFee: 3000,
      rangeTicks: 6000,
      slippageBps: 50,
      lpRecipient: account.address,
      enabled: { antiSnipe: false, tax: false, lock: false, whitelist: false },
    },
    Math.floor(Date.now() / 1000)
  );

  // 2) Permit2 allowances.
  for (const t of prepared.permitTokens) {
    await pub.waitForTransactionReceipt({
      hash: await wallet.writeContract({ address: t.token, abi: Erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] }),
    });
  }

  // Direct Permit2 allowance to the wrapper (no signature) — the path useLaunch uses.
  const permitData: Hex = "0x";
  const exp = Math.floor(Date.now() / 1000) + 86400;
  for (const t of prepared.permitTokens) {
    await pub.waitForTransactionReceipt({
      hash: await wallet.writeContract({ address: PERMIT2, abi: Permit2Abi, functionName: "approve", args: [t.token, wrapper, (1n << 160n) - 1n, exp] }),
    });
  }
  console.log("granted direct Permit2 allowance to wrapper");

  // 3) launch
  const { request } = await pub.simulateContract({ account, address: wrapper, abi: CampaignWrapperAbi, functionName: "launchCampaign", args: [prepared.params, permitData], value: prepared.value });
  const hash = await wallet.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log("launch tx:", hash, "status:", receipt.status);

  const events = parseEventLogs({ abi: CampaignWrapperAbi, logs: receipt.logs, eventName: "CampaignLaunched" });
  const pid = (events[0]?.args as { pid: Hex }).pid;
  const campaign = (await pub.readContract({ address: lens as Address, abi: CampaignLensAbi, functionName: "getCampaign", args: [pid] })) as {
    initialized: boolean;
    phase: number;
    poolKey: { currency0: Address; currency1: Address };
  };
  console.log("pid:", pid, "→ initialized:", campaign.initialized, "phase:", campaign.phase);
  console.log("  currency0:", campaign.poolKey.currency0, "currency1:", campaign.poolKey.currency1);

  if (receipt.status !== "success" || !campaign.initialized) throw new Error("ERC-20 launch test FAILED");
  console.log("\n✅ ERC-20 launch test PASSED");
}

main().catch((e) => {
  console.error("❌", e?.shortMessage ?? e?.message ?? e);
  if (e?.metaMessages) console.error(e.metaMessages.join("\n"));
  if (e?.cause?.reason) console.error("reason:", e.cause.reason);
  if (e?.cause?.data?.errorName) console.error("error:", e.cause.data.errorName, e.cause.data.args);
  if (e?.cause?.cause?.reason) console.error("inner reason:", e.cause.cause.reason);
  process.exit(1);
});
