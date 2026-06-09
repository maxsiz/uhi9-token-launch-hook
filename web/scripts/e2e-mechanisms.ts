/**
 * E2E Harness C — exercise EVERY launch mechanism end-to-end on live Unichain Sepolia (1301).
 *
 * For each campaign it: launches a fresh token (all modules ON, with the SHORTEST legal windows so the
 * test can wait them out), then drives real swaps + governance to trigger each mechanism and asserts the
 * on-chain behaviour:
 *   • Whitelist  — non-whitelisted buy reverts (NotWhitelisted), whitelisted buy passes, post-window all pass.
 *   • Anti-snipe — oversized buy reverts (BuyTooLarge) in-window, passes after the window.
 *   • Tax        — real buy/sell emit TaxApplied with asymmetric fees that decay toward baseTax.
 *   • Lock       — AND(time,volume) stays locked; OR(time|low-volume) flips unlocked once volume accrues;
 *                  cumulativeVolume is tracked across swaps.
 *
 * Hard floor: launchDuration MIN is 1 day, and the gov-NFT is burn-protected until launchEndTime — so a
 * *successful* gov-LP withdrawal can't be shown in a short run; we assert the lock STATE instead.
 *
 * Run: `npm run e2e:mechanisms` (esbuild-bundle + node; sources web/.env.local). MECH_CAMPAIGNS overrides count.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  parseUnits,
  formatUnits,
  maxUint256,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";

import { CONTRACTS } from "@/lib/config/contracts.generated";
import { UNISWAP, PERMIT2 } from "@/lib/config/uniswap";
import {
  CampaignWrapperAbi,
  CampaignWrapperAutoAbi,
  CampaignLensAbi,
  TokenLaunchHookAbi,
  Erc20Abi,
  Permit2Abi,
  TokenFactoryAbi,
  UniversalRouterAbi,
} from "@/lib/config/abi";
import { prepareAutoLaunch, type LaunchFormInput } from "@/lib/campaign/launch";
import { buildPermitData } from "@/lib/campaign/permit2";
import { buildUniversalRouterSwap } from "@/lib/swap/buildSwap";
import { quoteExactInputSingle, type PoolKeyStruct } from "@/lib/swap/quote";
import { UnlockLogic } from "@/lib/campaign/types";

const RPC = "https://unichain-sepolia.drpc.org"; // single consistent backend (not the load-balancer)
const EXPLORER = "https://sepolia.uniscan.xyz";
const CHAIN_ID = unichainSepolia.id;
const MAX_UINT160 = (1n << 160n) - 1n;
const WINDOW_S = 75; // whitelist + anti-snipe + tax-decay window (short, but > a few blocks)

const SEL = {
  NotWhitelisted: toFunctionSelector("NotWhitelisted()"),
  BuyTooLarge: toFunctionSelector("BuyTooLarge()"),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (n: number) => Math.round(n * 10_000); // 1% -> 10000 fee units (matches percentToTaxUnits)

/** Flatten a viem error chain into one searchable string (message + nested .data/.details). */
function errText(e: unknown): string {
  const parts: string[] = [];
  let cur: { message?: string; data?: unknown; details?: string; cause?: unknown } | undefined = e as never;
  for (let d = 0; cur && d < 10; d++) {
    if (cur.message) parts.push(cur.message);
    if (cur.details) parts.push(cur.details);
    if (cur.data) parts.push(typeof cur.data === "string" ? cur.data : JSON.stringify(cur.data));
    cur = cur.cause as typeof cur;
  }
  return parts.join(" | ");
}
const hasSelector = (e: unknown, sel: Hex) => errText(e).toLowerCase().includes(sel.slice(2).toLowerCase());

let PASS = 0;
let FAIL = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`    ${ok ? "✓" : "✗ FAIL"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (ok) PASS++;
  else FAIL++;
}

interface CampaignCfg {
  buyPct: number;
  sellPct: number;
  basePct: number;
  maxBuyHumanPair: string; // anti-snipe cap (pair units)
  lockLogic: UnlockLogic;
  volumeThresholdHumanPair: string; // M3 volume threshold (pair units)
}

async function main() {
  const pk1 = process.env.TEST_PK_1 as Hex;
  const addr2 = (process.env.TEST_ADDR_2 ?? "") as Address; // second actor (whitelist-denied), quote-only
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk1)) throw new Error("TEST_PK_1 missing — source web/.env.local");
  const account = privateKeyToAccount(pk1);
  const pub = createPublicClient({ chain: unichainSepolia, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: unichainSepolia, transport: http(RPC) });
  const { wrapper, factory, lens, hook } = CONTRACTS[CHAIN_ID];
  const uni = UNISWAP[CHAIN_ID];
  const router = uni.universalRouter as Address;
  const quoter = uni.quoter as Address;

  console.log(`launcher ${account.address}`);
  const bal = await pub.getBalance({ address: account.address });
  console.log(`balance  ${formatUnits(bal, 18)} ETH`);
  if (bal === 0n) throw new Error(`fund ${account.address} with Unichain Sepolia ETH first`);

  // Local nonce manager (load-balanced RPC nodes disagree; trust the authoritative "next nonce N").
  let nonce = Number(await pub.getTransactionCount({ address: account.address, blockTag: "latest" }));
  async function send(req: { [k: string]: unknown }) {
    for (let i = 0; i < 12; i++) {
      try {
        const hash = (await wallet.writeContract({ ...(req as Parameters<typeof wallet.writeContract>[0]), nonce })) as Hex;
        const receipt = await pub.waitForTransactionReceipt({ hash });
        nonce++;
        if (receipt.status !== "success") throw new Error(`tx reverted: ${EXPLORER}/tx/${hash}`);
        return { hash, receipt };
      } catch (e) {
        const m = errText(e);
        const next = m.match(/next nonce (\d+)/i);
        if (next) nonce = Number(next[1]);
        else if (/nonce too low|already known|replacement transaction underpriced/i.test(m)) nonce++;
        else throw e;
        await sleep(1000);
      }
    }
    throw new Error("send: nonce retries exhausted");
  }

  async function approveForSwap(token: Address) {
    const a = (await pub.readContract({ address: token, abi: Erc20Abi, functionName: "allowance", args: [account.address, PERMIT2] })) as bigint;
    if (a < maxUint256 / 2n) {
      const sim = await pub.simulateContract({ account, address: token, abi: Erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] });
      await send(sim.request);
    }
    const readP2 = async () => (await pub.readContract({ address: PERMIT2, abi: Permit2Abi, functionName: "allowance", args: [account.address, token, router] })) as readonly [bigint, number, number];
    let p2 = await readP2();
    if (p2[0] < MAX_UINT160 / 2n) {
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
      const sim = await pub.simulateContract({ account, address: PERMIT2, abi: Permit2Abi, functionName: "approve", args: [token, router, MAX_UINT160, exp] });
      await send(sim.request);
      // Confirm read-after-write (drpc can lag a beat) so the next swap-simulate sees a live allowance.
      for (let i = 0; i < 8; i++) {
        p2 = await readP2();
        if (p2[0] >= MAX_UINT160 / 2n && p2[1] > Math.floor(Date.now() / 1000)) break;
        await sleep(1200);
      }
    }
  }

  /** Execute a real exact-in swap through the Universal Router; returns the receipt (for event parsing). */
  async function swap(poolKey: PoolKeyStruct, zeroForOne: boolean, amountIn: bigint) {
    const call = buildUniversalRouterSwap({ poolKey, zeroForOne, amountIn, amountOutMinimum: 0n, deadline: BigInt(Math.floor(Date.now() / 1000) + 1200) });
    const sim = await pub.simulateContract({ account, address: router, abi: UniversalRouterAbi, functionName: "execute", args: [call.commands, call.inputs, call.deadline], value: call.value });
    return (await send(sim.request)).receipt;
  }

  /** Try a quote (eth_call, runs the hook's beforeSwap) as `actor`; returns {ok} or the revert error. */
  async function tryQuote(poolKey: PoolKeyStruct, zeroForOne: boolean, amountIn: bigint, actor: Address) {
    try {
      const out = await quoteExactInputSingle(pub, { quoter, poolKey, zeroForOne, amountIn, account: actor });
      return { ok: true as const, out };
    } catch (e) {
      return { ok: false as const, e };
    }
  }

  const taxOf = (receipt: { logs: readonly unknown[] }) => {
    const ev = parseEventLogs({ abi: TokenLaunchHookAbi, logs: receipt.logs as never, eventName: "TaxApplied" });
    return (ev[0]?.args as { isBuy?: boolean; feeBps?: number } | undefined) ?? undefined;
  };

  async function deployPair(tag: string): Promise<{ pair: Address; balance: bigint }> {
    const sym = "MEC" + tag;
    const dep = await pub.simulateContract({ account, address: factory, abi: TokenFactoryAbi, functionName: "deployToken", args: [{ name: `Mech Pair ${tag}`, symbol: sym, totalSupply: parseUnits("1000000", 18) }, account.address] });
    const pair = dep.result as Address;
    await send(dep.request);
    for (let i = 0; i < 8; i++) {
      const code = await pub.getCode({ address: pair }).catch(() => undefined);
      if (code && code !== "0x") break;
      await sleep(1500);
    }
    const balance = (await pub.readContract({ address: pair, abi: Erc20Abi, functionName: "balanceOf", args: [account.address] })) as bigint;
    return { pair, balance };
  }

  async function runCampaign(idx: number, cfg: CampaignCfg) {
    const tag = String(idx);
    console.log(`\n══════ Campaign #${idx}  (lock=${cfg.lockLogic === UnlockLogic.AND ? "AND" : "OR"}, buy=${cfg.buyPct}% sell=${cfg.sellPct}% base=${cfg.basePct}%) ══════`);

    // 1) Fresh pair, then launch with ALL modules on + shortest windows.
    const { pair } = await deployPair(tag);
    console.log(`  pair ${pair}`);
    const input: LaunchFormInput = {
      newToken: { name: `Mech Token ${tag}`, symbol: `MTK${tag}`, totalSupply: parseUnits("1000000", 18) },
      tokenDecimals: 18,
      pair: { address: pair, decimals: 18 },
      seedTokenHuman: "100000",
      seedPairHuman: "1",
      launchDurationDays: 1, // hard minimum
      tickSpacing: 60,
      staticFee: 3000,
      rangeTicks: 6000,
      slippageBps: 50,
      lpRecipient: account.address,
      enabled: { antiSnipe: true, tax: true, lock: true, whitelist: true },
      modules: {
        antiSnipe: { durationMinutes: WINDOW_S / 60, maxBuyHuman: cfg.maxBuyHumanPair },
        tax: { initialBuyPct: cfg.buyPct, initialSellPct: cfg.sellPct, basePct: cfg.basePct, decayDays: WINDOW_S / 86_400 },
        lock: { logic: cfg.lockLogic, timeEnabled: true, unlockDelayDays: 1 / 24, volumeEnabled: true, volumeThresholdHuman: cfg.volumeThresholdHumanPair },
      },
      whitelistWindowMinutes: WINDOW_S / 60,
    };
    const { autoParams, permitTokens } = prepareAutoLaunch(input, Math.floor(Date.now() / 1000));

    await approveForSwap(pair); // also serves the Permit2 pull (token→Permit2 leg)
    const permitData = await buildPermitData({
      owner: account.address,
      spender: wrapper,
      chainId: CHAIN_ID,
      permit2: PERMIT2,
      tokens: permitTokens,
      publicClient: pub,
      signTypedData: (args) => wallet.signTypedData(args as Parameters<typeof wallet.signTypedData>[0]),
    });
    const launchSim = await pub.simulateContract({ account, address: wrapper, abi: CampaignWrapperAutoAbi, functionName: "launchCampaign", args: [autoParams, permitData] });
    const launchRcpt = (await send(launchSim.request)).receipt;
    const launched = parseEventLogs({ abi: CampaignWrapperAbi, logs: launchRcpt.logs, eventName: "CampaignLaunched" });
    const pid = (launched[0]?.args as { pid: Hex }).pid;
    const launchedAt = Math.floor(Date.now() / 1000);
    console.log(`  ✓ launched  PoolId ${pid}  ${EXPLORER}/tx/${launchRcpt.transactionHash}`);

    // Read the on-chain campaign view (poolKey w/ dynamic fee, orientation).
    type View = { poolKey: PoolKeyStruct; tokenIsCurrency0: boolean; effectiveBuyTax: number; effectiveSellTax: number; cumulativeVolume: bigint; lockUnlocked: boolean };
    const v = (await pub.readContract({ address: lens, abi: CampaignLensAbi, functionName: "getCampaign", args: [pid] })) as View;
    const poolKey = v.poolKey;
    const token = (v.tokenIsCurrency0 ? poolKey.currency0 : poolKey.currency1) as Address;
    const buyZ4O = !v.tokenIsCurrency0; // buy = pair→token
    const sellZ4O = v.tokenIsCurrency0; // sell = token→pair
    const smallBuy = parseUnits("0.004", 18); // < anti-snipe cap
    const bigBuy = parseUnits("0.5", 18); // > anti-snipe cap

    // ───────────── PHASE 1: windows ACTIVE ─────────────
    console.log("  ── Phase 1 (whitelist + anti-snipe + full tax active) ──");

    const q1 = await tryQuote(poolKey, buyZ4O, smallBuy, account.address);
    check(!q1.ok && hasSelector(q1.e, SEL.NotWhitelisted), "whitelist blocks non-whitelisted buy", !q1.ok ? "reverted NotWhitelisted" : "did NOT revert");

    await send((await pub.simulateContract({ account, address: hook, abi: TokenLaunchHookAbi, functionName: "addToWhitelist", args: [pid, account.address] })).request);
    const wl = (await pub.readContract({ address: hook, abi: TokenLaunchHookAbi, functionName: "isAddressWhitelisted", args: [pid, account.address] })) as boolean;
    check(wl, "governance addToWhitelist", "launcher now whitelisted");

    const qBig = await tryQuote(poolKey, buyZ4O, bigBuy, account.address);
    check(!qBig.ok && hasSelector(qBig.e, SEL.BuyTooLarge), "anti-snipe blocks oversized buy", !qBig.ok ? "reverted BuyTooLarge" : "did NOT revert");

    const qSmall = await tryQuote(poolKey, buyZ4O, smallBuy, account.address);
    check(qSmall.ok, "whitelisted in-cap buy quotes OK", qSmall.ok ? `out=${formatUnits(qSmall.out, 18)}` : "reverted");

    const buyR = await swap(poolKey, buyZ4O, smallBuy);
    const buyTax = taxOf(buyR);
    check(buyTax?.isBuy === true, "real BUY emits TaxApplied(isBuy=true)", buyTax ? `fee=${(buyTax.feeBps ?? 0) / 10_000}%` : "no event");

    await approveForSwap(token); // now hold the token → approve for selling
    const tokenBal = (await pub.readContract({ address: token, abi: Erc20Abi, functionName: "balanceOf", args: [account.address] })) as bigint;
    const sellAmt = tokenBal / 4n;
    const sellR = await swap(poolKey, sellZ4O, sellAmt);
    const sellTax = taxOf(sellR);
    check(sellTax?.isBuy === false, "real SELL emits TaxApplied(isBuy=false)", sellTax ? `fee=${(sellTax.feeBps ?? 0) / 10_000}%` : "no event");
    check((sellTax?.feeBps ?? 0) > (buyTax?.feeBps ?? 0), "sell tax > buy tax (asymmetric)", `${(sellTax?.feeBps ?? 0) / 10_000}% > ${(buyTax?.feeBps ?? 0) / 10_000}%`);
    check((buyTax?.feeBps ?? 0) <= pct(cfg.buyPct) && (buyTax?.feeBps ?? 0) >= pct(cfg.basePct), "buy tax within [base, initial]", `${(buyTax?.feeBps ?? 0) / 10_000}%`);

    const vLock = (await pub.readContract({ address: lens, abi: CampaignLensAbi, functionName: "getCampaign", args: [pid] })) as View;
    check(vLock.cumulativeVolume > 0n, "lock tracks cumulative volume", `${formatUnits(vLock.cumulativeVolume, 18)} pair`);
    if (cfg.lockLogic === UnlockLogic.AND) {
      check(vLock.lockUnlocked === false, "AND-lock stays LOCKED (time not reached)", "isUnlocked=false");
    }

    // ───────────── wait out the windows ─────────────
    const waitMs = Math.max(0, (launchedAt + WINDOW_S + 5 - Math.floor(Date.now() / 1000)) * 1000);
    console.log(`  ── waiting ${Math.round(waitMs / 1000)}s for whitelist/anti-snipe/decay to expire ──`);
    await sleep(waitMs);

    // ───────────── PHASE 2: windows EXPIRED ─────────────
    console.log("  ── Phase 2 (windows expired) ──");
    const qOpen = addr2 ? await tryQuote(poolKey, buyZ4O, smallBuy, addr2) : { ok: true as const, out: 0n };
    check(qOpen.ok, "post-window: non-whitelisted actor can buy", addr2 ? "TEST_ADDR_2 quote OK" : "(no TEST_ADDR_2; skipped)");

    const qBigOpen = await tryQuote(poolKey, buyZ4O, bigBuy, account.address);
    check(qBigOpen.ok, "post-window: oversized buy allowed (anti-snipe expired)", qBigOpen.ok ? `out=${formatUnits(qBigOpen.out, 18)}` : "reverted");

    const buy2 = await swap(poolKey, buyZ4O, smallBuy);
    const buy2Tax = taxOf(buy2);
    check((buy2Tax?.feeBps ?? 1e9) <= (buyTax?.feeBps ?? 0), "buy tax decayed vs Phase 1", `${(buy2Tax?.feeBps ?? 0) / 10_000}% ≤ ${(buyTax?.feeBps ?? 0) / 10_000}%`);

    const vFinal = (await pub.readContract({ address: lens, abi: CampaignLensAbi, functionName: "getCampaign", args: [pid] })) as View;
    check(vFinal.effectiveBuyTax <= pct(cfg.basePct) + 2000, "effective buy tax decayed ≈ base", `${vFinal.effectiveBuyTax / 10_000}% (base ${cfg.basePct}%)`);
    if (cfg.lockLogic === UnlockLogic.OR) {
      check(vFinal.lockUnlocked === true, "OR-lock UNLOCKED once volume threshold met", `vol=${formatUnits(vFinal.cumulativeVolume, 18)} ≥ ${cfg.volumeThresholdHumanPair}`);
    } else {
      check(vFinal.lockUnlocked === false, "AND-lock still LOCKED (time floor = launchEnd, 1d away)", "isUnlocked=false");
    }
    console.log(`  Campaign #${idx} done.`);
  }

  // Campaign matrix: one AND-lock (stays locked), one OR-lock (volume-unlocks) — covers both lock paths.
  const CONFIGS: CampaignCfg[] = [
    { buyPct: 5, sellPct: 8, basePct: 1, maxBuyHumanPair: "0.01", lockLogic: UnlockLogic.AND, volumeThresholdHumanPair: "1000" },
    { buyPct: 3, sellPct: 6, basePct: 0.5, maxBuyHumanPair: "0.02", lockLogic: UnlockLogic.OR, volumeThresholdHumanPair: "0.001" },
    { buyPct: 7, sellPct: 10, basePct: 2, maxBuyHumanPair: "0.015", lockLogic: UnlockLogic.AND, volumeThresholdHumanPair: "1000" },
  ];
  const count = Math.min(CONFIGS.length, Math.max(1, Number(process.env.MECH_CAMPAIGNS ?? 2)));
  for (let i = 0; i < count; i++) await runCampaign(i + 1, CONFIGS[i]);

  console.log(`\n════════ RESULT: ${PASS} passed, ${FAIL} failed (${count} campaign${count > 1 ? "s" : ""}) ════════`);
  if (FAIL > 0) process.exit(1);
}

main().catch((e) => {
  console.error("\n✗ E2E FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
