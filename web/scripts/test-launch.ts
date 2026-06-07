/**
 * Headless end-to-end launch test: runs the launch wizard's own libs (prepareLaunch → priceMath →
 * buildParams) and submits CampaignWrapper.launchCampaign signed by the default Foundry account,
 * against a local anvil fork of Unichain Sepolia. Proves the wizard's parameter generation produces a
 * launch the real contracts accept — no browser wallet / user signature needed.
 *
 *   anvil --fork-url <unichain-sepolia> --port 8545 &
 *   npx tsx scripts/test-launch.ts
 */
import { createPublicClient, createWalletClient, http, parseEventLogs, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";

import { prepareLaunch } from "../lib/campaign/launch";
import { CampaignWrapperAbi, CampaignLensAbi } from "../lib/config/abi";
import { CONTRACTS } from "../lib/config/contracts.generated";

const RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
// Foundry/anvil default account #0 (anvil funds it with 10000 ETH even on a fork).
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  const account = privateKeyToAccount(PK);
  const transport = http(RPC);
  const pub = createPublicClient({ chain: unichainSepolia, transport });
  const wallet = createWalletClient({ account, chain: unichainSepolia, transport });
  const { wrapper, lens } = CONTRACTS[unichainSepolia.id];

  // Top up ETH — an OP-stack fork charges a large simulated L1 fee per tx, so fund generously.
  await pub.request({ method: "anvil_setBalance" as never, params: [account.address, "0xd3c21bcecceda1000000"] as never }); // 1e24 wei
  console.log("deployer (foundry #0):", account.address);
  console.log("ETH balance:", (await pub.getBalance({ address: account.address })).toString());

  // Wizard inputs: brand-new factory token paired with native ETH, no mechanisms (simplest path).
  const prepared = prepareLaunch(
    {
      newToken: { name: "Wizard Test", symbol: "WIZ", totalSupply: 1_000_000n * 10n ** 18n },
      tokenDecimals: 18,
      pair: { native: true },
      seedTokenHuman: "100000",
      seedPairHuman: "0.05",
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

  console.log("sqrtPriceInit:", prepared.params.sqrtPriceInit.toString());
  console.log("ticks:", prepared.params.tickLower, prepared.params.tickUpper);
  console.log("liquidity:", prepared.params.liquidity.toString());
  console.log("value (ETH):", prepared.value.toString());

  // simulate → write → wait
  const { request } = await pub.simulateContract({
    account,
    address: wrapper,
    abi: CampaignWrapperAbi,
    functionName: "launchCampaign",
    args: [prepared.params, "0x"],
    value: prepared.value,
  });
  const hash = await wallet.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log("launch tx:", hash, "status:", receipt.status);

  const events = parseEventLogs({ abi: CampaignWrapperAbi, logs: receipt.logs, eventName: "CampaignLaunched" });
  const pid = (events[0]?.args as { pid: `0x${string}` }).pid;
  const govId = (events[0]?.args as { governanceTokenId: bigint }).governanceTokenId;
  console.log("CampaignLaunched pid:", pid, "govTokenId:", govId.toString());

  const campaign = (await pub.readContract({
    address: lens as Address,
    abi: CampaignLensAbi,
    functionName: "getCampaign",
    args: [pid],
  })) as { initialized: boolean; phase: number; poolKey: { currency0: Address; currency1: Address } };

  console.log("lens.getCampaign → initialized:", campaign.initialized, "phase:", campaign.phase);
  console.log("  currency0:", campaign.poolKey.currency0, "currency1:", campaign.poolKey.currency1);

  if (receipt.status !== "success" || !campaign.initialized) {
    throw new Error("launch test FAILED");
  }
  console.log("\n✅ launch test PASSED");
}

main().catch((e) => {
  console.error("❌", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
