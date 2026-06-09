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

// Single consistent backend (not the official load-balancer) — avoids cross-node nonce disagreement
// and post-write propagation lag that intermittently break sequential txs.
const RPC = "https://unichain-sepolia.drpc.org";
const EXPLORER = "https://sepolia.uniscan.xyz";
const CHAIN_ID = unichainSepolia.id; // 1301

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The public RPC is load-balanced across nodes with uneven head lag: a tx receipt can come back from
 * one node while a follow-up eth_call lands on another that hasn't applied the block yet — surfacing as
 * "returned no data (0x)" / missing code. Retry reads a few times to ride out the propagation gap.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 6): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(1500);
    }
  }
  throw new Error(`${label} failed after ${tries} tries: ${last instanceof Error ? last.message : last}`);
}

/** Poll until the address actually has code on the node we hit — guards against post-create state lag. */
async function waitForCode(pub: ReturnType<typeof createPublicClient>, address: Address) {
  await withRetry(`code@${address}`, async () => {
    const code = await pub.getCode({ address });
    if (!code || code === "0x") throw new Error("no code yet");
    return code;
  });
}

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

  // The public RPC is load-balanced with uneven head lag, so per-tx getTransactionCount races (a node
  // that missed the last block reports a stale nonce → "nonce too low"). Track the nonce locally instead:
  // seed once, pin it on every write, bump on success, and resync from the chain only if a node rejects us.
  let nonce = Number(await withRetry("seed nonce", () => pub.getTransactionCount({ address: account.address, blockTag: "latest" })));
  async function send(req: { [k: string]: unknown }): Promise<{ hash: Hex; receipt: Awaited<ReturnType<typeof pub.waitForTransactionReceipt>> }> {
    for (let i = 0; i < 12; i++) {
      try {
        const hash = (await wallet.writeContract({ ...(req as Parameters<typeof wallet.writeContract>[0]), nonce })) as Hex;
        const receipt = await pub.waitForTransactionReceipt({ hash });
        nonce++;
        return { hash, receipt };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const next = msg.match(/next nonce (\d+)/i);
        if (next) nonce = Number(next[1]);
        else if (/nonce too low|already known|replacement transaction underpriced/i.test(msg)) nonce++;
        else throw e;
        await sleep(1500);
      }
    }
    throw new Error("send: exhausted nonce retries");
  }

  // 1) Deploy a throwaway ERC-20 pair via the live factory, minted to the deployer.
  console.log("\n[1] deploying pair token via factory…");
  const pairCfg = { name: "E2E Pair", symbol: "E2EP", totalSupply: parseUnits("1000000", 18) };
  const dep = await pub.simulateContract({ account, address: factory, abi: TokenFactoryAbi, functionName: "deployToken", args: [pairCfg, account.address] });
  const pair = dep.result as Address;
  await send(dep.request);
  await waitForCode(pub, pair); // ride out RPC head-lag before reading the fresh contract
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
  const allowance = await withRetry(
    "allowance",
    () => pub.readContract({ address: pair, abi: Erc20Abi, functionName: "allowance", args: [account.address, PERMIT2] }) as Promise<bigint>,
  );
  if (allowance < permitTokens[0].amount) {
    console.log("[2] approving pair → Permit2…");
    const a = await pub.simulateContract({ account, address: pair, abi: Erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] });
    await send(a.request);
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
  const { request } = await withRetry("simulate launch", () =>
    pub.simulateContract({ account, address: wrapper, abi: CampaignWrapperAutoAbi, functionName: "launchCampaign", args: [autoParams, permitData] }),
  );
  const { hash, receipt } = await send(request);
  console.log(`    launch tx ${EXPLORER}/tx/${hash}`);
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
