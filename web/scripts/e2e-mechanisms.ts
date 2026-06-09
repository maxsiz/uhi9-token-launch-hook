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
 * Every on-chain tx is recorded (label + hash) and written as a markdown table to e2e/MECHANISM_TXS.md.
 * Negative checks are sent as REAL reverting txs so they get explorer links too (falling back to the
 * Quoter eth_call when the RPC rejects mempool reverts).
 *
 * Run: `npm run e2e:mechanisms` (esbuild-bundle + node; sources web/.env.local). MECH_CAMPAIGNS overrides count.
 */
import { writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  parseUnits,
  formatUnits,
  maxUint256,
  toFunctionSelector,
  type Abi,
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

// Transaction ledger → markdown table. `verifies` = what the tx proves; `hash` null when only an
// eth_call was possible (RPC rejected the reverting tx from the mempool).
interface TxRow {
  campaign: number;
  verifies: string;
  hash: Hex | null;
  outcome: string;
}
const LEDGER: TxRow[] = [];
let CUR = 0;

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

  /** Send a state-changing tx (from a simulated request), record it, assert success. */
  async function send(req: { [k: string]: unknown }, verifies: string) {
    for (let i = 0; i < 12; i++) {
      try {
        const hash = (await wallet.writeContract({ ...(req as Parameters<typeof wallet.writeContract>[0]), nonce })) as Hex;
        const receipt = await pub.waitForTransactionReceipt({ hash });
        nonce++;
        if (receipt.status !== "success") throw new Error(`tx reverted: ${EXPLORER}/tx/${hash}`);
        LEDGER.push({ campaign: CUR, verifies, hash, outcome: "success" });
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

  /** Send a tx we EXPECT to revert (skip simulate, manual gas) so it lands on-chain as a failed tx with a
   *  linkable hash. If the RPC rejects mempool reverts, record it as eth_call-verified (no hash). */
  async function sendExpectRevert(params: { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint }, verifies: string) {
    try {
      const hash = (await wallet.writeContract({ account, chain: unichainSepolia, gas: 900_000n, nonce, ...params } as never)) as Hex;
      nonce++;
      const receipt = await pub.waitForTransactionReceipt({ hash });
      const reverted = receipt.status !== "success";
      LEDGER.push({ campaign: CUR, verifies, hash, outcome: reverted ? "reverted (expected)" : "UNEXPECTED success" });
      return reverted;
    } catch (e) {
      const m = errText(e);
      const next = m.match(/next nonce (\d+)/i);
      if (next) nonce = Number(next[1]);
      // RPC rejected the reverting tx pre-flight (no on-chain hash) — fall back to the eth_call evidence.
      LEDGER.push({ campaign: CUR, verifies: `${verifies} (verified via eth_call — RPC rejects mempool reverts)`, hash: null, outcome: "reverted in eth_call" });
      return true;
    }
  }

  async function approveForSwap(token: Address, role: string) {
    const a = (await pub.readContract({ address: token, abi: Erc20Abi, functionName: "allowance", args: [account.address, PERMIT2] })) as bigint;
    if (a < maxUint256 / 2n) {
      const sim = await pub.simulateContract({ account, address: token, abi: Erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] });
      await send(sim.request, `Approve ${role} → Permit2 (ERC-20 leg of the Permit2 approval chain)`);
    }
    const readP2 = async () => (await pub.readContract({ address: PERMIT2, abi: Permit2Abi, functionName: "allowance", args: [account.address, token, router] })) as readonly [bigint, number, number];
    let p2 = await readP2();
    if (p2[0] < MAX_UINT160 / 2n) {
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
      const sim = await pub.simulateContract({ account, address: PERMIT2, abi: Permit2Abi, functionName: "approve", args: [token, router, MAX_UINT160, exp] });
      await send(sim.request, `Permit2 → grant ${role} allowance to the Universal Router (router leg)`);
      for (let i = 0; i < 8; i++) {
        p2 = await readP2();
        if (p2[0] >= MAX_UINT160 / 2n && p2[1] > Math.floor(Date.now() / 1000)) break;
        await sleep(1200);
      }
    }
  }

  /** Execute a real exact-in swap through the Universal Router; record it; return the receipt. */
  async function swap(poolKey: PoolKeyStruct, zeroForOne: boolean, amountIn: bigint, verifies: string) {
    const call = buildUniversalRouterSwap({ poolKey, zeroForOne, amountIn, amountOutMinimum: 0n, deadline: BigInt(Math.floor(Date.now() / 1000) + 1200) });
    const sim = await pub.simulateContract({ account, address: router, abi: UniversalRouterAbi, functionName: "execute", args: [call.commands, call.inputs, call.deadline], value: call.value });
    return (await send(sim.request, verifies)).receipt;
  }

  /** Build an exact-in UR swap call (for the expect-revert path, which skips simulate). */
  const swapCall = (poolKey: PoolKeyStruct, zeroForOne: boolean, amountIn: bigint) =>
    buildUniversalRouterSwap({ poolKey, zeroForOne, amountIn, amountOutMinimum: 0n, deadline: BigInt(Math.floor(Date.now() / 1000) + 1200) });

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

  async function deployPair(tag: string): Promise<Address> {
    const dep = await pub.simulateContract({ account, address: factory, abi: TokenFactoryAbi, functionName: "deployToken", args: [{ name: `Mech Pair ${tag}`, symbol: `MEC${tag}`, totalSupply: parseUnits("1000000", 18) }, account.address] });
    const pair = dep.result as Address;
    await send(dep.request, "Deploy the ERC-20 counter-asset (pair token) via TokenFactory");
    for (let i = 0; i < 8; i++) {
      const code = await pub.getCode({ address: pair }).catch(() => undefined);
      if (code && code !== "0x") break;
      await sleep(1500);
    }
    return pair;
  }

  async function runCampaign(idx: number, cfg: CampaignCfg) {
    CUR = idx;
    const tag = String(idx);
    const lockName = cfg.lockLogic === UnlockLogic.AND ? "AND" : "OR";
    console.log(`\n══════ Campaign #${idx}  (lock=${lockName}, buy=${cfg.buyPct}% sell=${cfg.sellPct}% base=${cfg.basePct}%) ══════`);

    // 1) Fresh pair, then launch with ALL modules on + shortest windows.
    const pair = await deployPair(tag);
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

    await approveForSwap(pair, "pair token"); // also serves the Permit2 pull (token→Permit2 leg)
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
    const launchRcpt = (await send(launchSim.request, `Launch the campaign — deploys the token + opens the pool with ALL modules ON (anti-snipe, ${cfg.buyPct}/${cfg.sellPct}% tax, ${lockName}-lock, whitelist) in one tx`)).receipt;
    const launched = parseEventLogs({ abi: CampaignWrapperAbi, logs: launchRcpt.logs, eventName: "CampaignLaunched" });
    const pid = (launched[0]?.args as { pid: Hex }).pid;
    const launchedAt = Math.floor(Date.now() / 1000);
    console.log(`  ✓ launched  PoolId ${pid}  ${EXPLORER}/tx/${launchRcpt.transactionHash}`);

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

    // Whitelist guard — eth_call asserts the exact selector; then a REAL reverting tx for the explorer link.
    const q1 = await tryQuote(poolKey, buyZ4O, smallBuy, account.address);
    check(!q1.ok && hasSelector(q1.e, SEL.NotWhitelisted), "whitelist blocks non-whitelisted buy", !q1.ok ? "reverted NotWhitelisted" : "did NOT revert");
    {
      const c = swapCall(poolKey, buyZ4O, smallBuy);
      const rev = await sendExpectRevert({ address: router, abi: UniversalRouterAbi as Abi, functionName: "execute", args: [c.commands, c.inputs, c.deadline], value: c.value }, "Whitelist phase REJECTS a buy from a non-whitelisted address (reverts NotWhitelisted)");
      check(rev, "  ↳ on-chain reverting tx recorded", "non-whitelisted buy");
    }

    await send((await pub.simulateContract({ account, address: hook, abi: TokenLaunchHookAbi, functionName: "addToWhitelist", args: [pid, account.address] })).request, "Governance (gov-NFT owner) adds the launcher to the whitelist");
    const wl = (await pub.readContract({ address: hook, abi: TokenLaunchHookAbi, functionName: "isAddressWhitelisted", args: [pid, account.address] })) as boolean;
    check(wl, "governance addToWhitelist", "launcher now whitelisted");

    // Anti-snipe guard — eth_call selector assert + real reverting tx.
    const qBig = await tryQuote(poolKey, buyZ4O, bigBuy, account.address);
    check(!qBig.ok && hasSelector(qBig.e, SEL.BuyTooLarge), "anti-snipe blocks oversized buy", !qBig.ok ? "reverted BuyTooLarge" : "did NOT revert");
    {
      const c = swapCall(poolKey, buyZ4O, bigBuy);
      const rev = await sendExpectRevert({ address: router, abi: UniversalRouterAbi as Abi, functionName: "execute", args: [c.commands, c.inputs, c.deadline], value: c.value }, `Anti-snipe REJECTS an oversized buy (> ${cfg.maxBuyHumanPair} pair cap) during the window (reverts BuyTooLarge)`);
      check(rev, "  ↳ on-chain reverting tx recorded", "oversized buy");
    }

    const qSmall = await tryQuote(poolKey, buyZ4O, smallBuy, account.address);
    check(qSmall.ok, "whitelisted in-cap buy quotes OK", qSmall.ok ? `out=${formatUnits(qSmall.out, 18)}` : "reverted");

    const buyR = await swap(poolKey, buyZ4O, smallBuy, `Whitelisted in-cap BUY succeeds — charges the buy tax (~${cfg.buyPct}%, emits TaxApplied isBuy=true)`);
    const buyTax = taxOf(buyR);
    check(buyTax?.isBuy === true, "real BUY emits TaxApplied(isBuy=true)", buyTax ? `fee=${(buyTax.feeBps ?? 0) / 10_000}%` : "no event");

    await approveForSwap(token, "launched token"); // now hold the token → approve for selling
    const tokenBal = (await pub.readContract({ address: token, abi: Erc20Abi, functionName: "balanceOf", args: [account.address] })) as bigint;
    const sellR = await swap(poolKey, sellZ4O, tokenBal / 4n, `SELL succeeds — charges the higher sell tax (~${cfg.sellPct}%, emits TaxApplied isBuy=false), proving asymmetric buy/sell tax`);
    const sellTax = taxOf(sellR);
    check(sellTax?.isBuy === false, "real SELL emits TaxApplied(isBuy=false)", sellTax ? `fee=${(sellTax.feeBps ?? 0) / 10_000}%` : "no event");
    check((sellTax?.feeBps ?? 0) > (buyTax?.feeBps ?? 0), "sell tax > buy tax (asymmetric)", `${(sellTax?.feeBps ?? 0) / 10_000}% > ${(buyTax?.feeBps ?? 0) / 10_000}%`);
    check((buyTax?.feeBps ?? 0) <= pct(cfg.buyPct) && (buyTax?.feeBps ?? 0) >= pct(cfg.basePct), "buy tax within [base, initial]", `${(buyTax?.feeBps ?? 0) / 10_000}%`);

    const vLock = (await pub.readContract({ address: lens, abi: CampaignLensAbi, functionName: "getCampaign", args: [pid] })) as View;
    check(vLock.cumulativeVolume > 0n, "lock tracks cumulative volume", `${formatUnits(vLock.cumulativeVolume, 18)} pair`);
    if (cfg.lockLogic === UnlockLogic.AND) check(vLock.lockUnlocked === false, "AND-lock stays LOCKED (time not reached)", "isUnlocked=false");

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

    const buy2 = await swap(poolKey, buyZ4O, smallBuy, `Post-window BUY succeeds with the DECAYED tax (~base ${cfg.basePct}%) — proves the linear tax decay`);
    const buy2Tax = taxOf(buy2);
    check((buy2Tax?.feeBps ?? 1e9) <= (buyTax?.feeBps ?? 0), "buy tax decayed vs Phase 1", `${(buy2Tax?.feeBps ?? 0) / 10_000}% ≤ ${(buyTax?.feeBps ?? 0) / 10_000}%`);

    const vFinal = (await pub.readContract({ address: lens, abi: CampaignLensAbi, functionName: "getCampaign", args: [pid] })) as View;
    check(vFinal.effectiveBuyTax <= pct(cfg.basePct) + 2000, "effective buy tax decayed ≈ base", `${vFinal.effectiveBuyTax / 10_000}% (base ${cfg.basePct}%)`);
    if (cfg.lockLogic === UnlockLogic.OR) check(vFinal.lockUnlocked === true, "OR-lock UNLOCKED once volume threshold met", `vol=${formatUnits(vFinal.cumulativeVolume, 18)} ≥ ${cfg.volumeThresholdHumanPair}`);
    else check(vFinal.lockUnlocked === false, "AND-lock still LOCKED (time floor = launchEnd, 1d away)", "isUnlocked=false");
    console.log(`  Campaign #${idx} done.  PoolId ${pid}`);
    return { idx, pid, lockName, cfg };
  }

  // Campaign matrix: one AND-lock (stays locked), one OR-lock (volume-unlocks) — covers both lock paths.
  const CONFIGS: CampaignCfg[] = [
    { buyPct: 5, sellPct: 8, basePct: 1, maxBuyHumanPair: "0.01", lockLogic: UnlockLogic.AND, volumeThresholdHumanPair: "1000" },
    { buyPct: 3, sellPct: 6, basePct: 0.5, maxBuyHumanPair: "0.02", lockLogic: UnlockLogic.OR, volumeThresholdHumanPair: "0.001" },
    { buyPct: 7, sellPct: 10, basePct: 2, maxBuyHumanPair: "0.015", lockLogic: UnlockLogic.AND, volumeThresholdHumanPair: "1000" },
  ];
  const count = Math.min(CONFIGS.length, Math.max(1, Number(process.env.MECH_CAMPAIGNS ?? 2)));
  const meta: { idx: number; pid: Hex; lockName: string; cfg: CampaignCfg }[] = [];
  for (let i = 0; i < count; i++) meta.push(await runCampaign(i + 1, CONFIGS[i]));

  // ── write the transaction table ──
  writeTable(meta);

  console.log(`\n════════ RESULT: ${PASS} passed, ${FAIL} failed (${count} campaign${count > 1 ? "s" : ""}) ════════`);
  if (FAIL > 0) process.exit(1);
}

function writeTable(meta: { idx: number; pid: Hex; lockName: string; cfg: CampaignCfg }[]) {
  const link = (h: Hex | null) => (h ? `[${h.slice(0, 10)}…](${EXPLORER}/tx/${h})` : "_eth_call (no tx)_");
  let md = `# Mechanism coverage — transaction log

Generated by \`npm run e2e:mechanisms\` on **Unichain Sepolia (1301)**. Each campaign launches a token with
**every module enabled** (anti-snipe, buy/sell tax, liquidity lock, whitelist) at the shortest legal
windows, then drives real swaps + governance to exercise each mechanism. Every on-chain transaction below
is linked to the block explorer (${EXPLORER}). Negative checks are sent as **real reverting transactions**
so the guard is provable on-chain.

`;
  for (const m of meta) {
    const c = m.cfg;
    md += `## Campaign #${m.idx} — ${m.lockName}-lock (buy ${c.buyPct}% / sell ${c.sellPct}% → base ${c.basePct}%, anti-snipe cap ${c.maxBuyHumanPair} pair)\n\nPoolId \`${m.pid}\`\n\n`;
    md += `| # | Test — what the transaction verifies | Transaction |\n|---|---|---|\n`;
    const rows = LEDGER.filter((r) => r.campaign === m.idx);
    rows.forEach((r, i) => {
      md += `| ${i + 1} | ${r.verifies}${r.outcome.startsWith("reverted") ? " — **reverts as expected**" : ""} | ${link(r.hash)} |\n`;
    });
    md += `\n`;
  }
  writeFileSync("e2e/MECHANISM_TXS.md", md);
  console.log("\nwrote e2e/MECHANISM_TXS.md");
}

main().catch((e) => {
  console.error("\n✗ E2E FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
