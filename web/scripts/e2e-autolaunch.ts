/**
 * E2E Harness A — drive the REAL frontend launch logic (prepareAutoLaunch + buildPermitData) end-to-end
 * against the live Unichain Sepolia (1301) contracts, with a throwaway test key. No browser.
 *
 * Run: `npm run e2e:autolaunch` (sources web/.env.local for TEST_PK_1, esbuild-bundles + runs on node —
 * raw tsx chokes on @uniswap/v4-sdk's CJS named exports that launch.ts pulls in transitively).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  parseUnits,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";

import { CONTRACTS } from "@/lib/config/contracts.generated";
import { PERMIT2 } from "@/lib/config/uniswap";
import { CampaignWrapperAbi, CampaignWrapperAutoAbi, Erc20Abi, TokenFactoryAbi } from "@/lib/config/abi";
import { prepareAutoLaunch, type LaunchFormInput } from "@/lib/campaign/launch";
import { buildPermitData } from "@/lib/campaign/permit2";

const RPC = "https://sepolia.unichain.org";
const EXPLORER = "https://sepolia.uniscan.xyz";
const CHAIN_ID = unichainSepolia.id; // 1301

async function main() {
  const pk = (process.env.TEST_PK_1 ?? "") as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("TEST_PK_1 missing/invalid — source web/.env.local");
  const account = privateKeyToAccount(pk);
  const pub = createPublicClient({ chain: unichainSepolia, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: unichainSepolia, transport: http(RPC) });
  const { wrapper, factory } = CONTRACTS[CHAIN_ID];

  console.log(`deployer ${account.address}`);
  const bal = await pub.getBalance({ address: account.address });
  console.log(`balance  ${bal} wei`);
  if (bal === 0n) throw new Error(`fund ${account.address} with Unichain Sepolia ETH first`);
  console.log(`wrapper  ${wrapper}`);

  // 1) Deploy a throwaway ERC-20 pair via the live factory, minted to the deployer.
  console.log("\n[1] deploying pair token via factory…");
  const pairCfg = { name: "E2E Pair", symbol: "E2EP", totalSupply: parseUnits("1000000", 18) };
  const dep = await pub.simulateContract({ account, address: factory, abi: TokenFactoryAbi, functionName: "deployToken", args: [pairCfg, account.address] });
  const pair = dep.result as Address;
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(dep.request) });
  console.log(`    pair ${pair}  ${EXPLORER}/address/${pair}`);

  // 2) Build the auto-priced launch via the real frontend lib (no priceMath; only the pair is pulled).
  const input: LaunchFormInput = {
    newToken: { name: "E2E Launch", symbol: "E2EL", totalSupply: parseUnits("1000000", 18) },
    tokenDecimals: 18,
    pair: { address: pair, decimals: 18 },
    seedTokenHuman: "100000",
    seedPairHuman: "1",
    launchDurationDays: 1,
    tickSpacing: 60,
    staticFee: 3000,
    rangeTicks: 6000,
    slippageBps: 50,
    lpRecipient: account.address,
    enabled: { antiSnipe: false, tax: false, lock: false, whitelist: false },
    modules: {},
    whitelistWindowMinutes: 30,
  };
  const { autoParams, permitTokens } = prepareAutoLaunch(input, Math.floor(Date.now() / 1000));

  // 3) Pair → Permit2 (on-chain ERC-20 approve, once).
  const allowance = (await pub.readContract({ address: pair, abi: Erc20Abi, functionName: "allowance", args: [account.address, PERMIT2] })) as bigint;
  if (allowance < permitTokens[0].amount) {
    console.log("[2] approving pair → Permit2…");
    const a = await pub.simulateContract({ account, address: pair, abi: Erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] });
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(a.request) });
  }

  // 4) Sign the Permit2 batch (gasless EIP-712) for the pair.
  console.log("[3] signing Permit2 batch…");
  const permitData = await buildPermitData({
    owner: account.address,
    spender: wrapper,
    chainId: CHAIN_ID,
    permit2: PERMIT2,
    tokens: permitTokens,
    publicClient: pub,
    signTypedData: (args) => wallet.signTypedData(args as Parameters<typeof wallet.signTypedData>[0]),
  });

  // 5) Simulate + send the auto-priced launch (one tx; token deployed + priced on-chain in the call).
  console.log("[4] simulating launchCampaign(auto)…");
  const { request } = await pub.simulateContract({ account, address: wrapper, abi: CampaignWrapperAutoAbi, functionName: "launchCampaign", args: [autoParams, permitData] });
  const hash = await wallet.writeContract(request);
  console.log(`    launch tx ${EXPLORER}/tx/${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("launch reverted");

  const events = parseEventLogs({ abi: CampaignWrapperAbi, logs: receipt.logs, eventName: "CampaignLaunched" });
  const pid = (events[0]?.args as { pid?: Hex } | undefined)?.pid;
  if (!pid) throw new Error("CampaignLaunched not found in receipt");
  console.log(`\n✓ LAUNCHED  PoolId ${pid}`);
  console.log(`  manage: /governance · trade: /swap/${CHAIN_ID}/${pid}`);
}

main().catch((e) => {
  console.error("\n✗ E2E FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
