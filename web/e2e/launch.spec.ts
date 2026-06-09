/**
 * Harness B — drive the REAL Launch Wizard UI in a headless browser, end-to-end, against the live
 * Unichain Sepolia (1301) contracts. A viem-backed EIP-1193 shim (e2e/shim.ts) stands in for
 * MetaMask/Rabby, so the app connects, signs Permit2, and sends txs exactly as a user would — no
 * extension, no manual clicks. Proves the full frontend wiring, not just the launch libs (that's A).
 *
 * Requires TEST_PK_1 (throwaway, 1301-only) in web/.env.local and a funded address. Run: `npm run e2e:ui`.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";
import { SHIM_BUNDLE } from "./global-setup";

// Single consistent backend (not the official load-balancer) — avoids cross-node nonce disagreement and
// the approve→simulate propagation lag that intermittently reverts the launch.
const RPC = "https://unichain-sepolia.drpc.org"; // node-side (beforeAll) — no browser CORS there
// The browser shim must NOT hit the public RPC directly (it 403s cross-origin requests). Route it through
// the app's same-origin proxy, which forwards server-side (needs RPC_URL_1301 set; see .env.local).
const SHIM_RPC = "http://localhost:3000/api/rpc?chainId=1301";
const CHAIN_ID = 1301;
const FACTORY: Address = "0x41cb3079a635bc11183c188281b8db14e4c57f9a"; // TokenFactory on 1301

const FACTORY_ABI = [
  {
    type: "function",
    name: "deployToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "config", type: "tuple", components: [
        { name: "name", type: "string" },
        { name: "symbol", type: "string" },
        { name: "totalSupply", type: "uint256" },
      ] },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
] as const;

const pk = (process.env.TEST_PK_1 ?? "") as Hex;
const haveKey = /^0x[0-9a-fA-F]{64}$/.test(pk);

test.describe("Launch Wizard (headless, real wallet shim)", () => {
  test.skip(!haveKey, "TEST_PK_1 missing — set a throwaway 1301 key in web/.env.local");

  const account = haveKey ? privateKeyToAccount(pk) : undefined;
  let pair: Address;

  test.beforeAll(async () => {
    const acct = account!;
    const pub = createPublicClient({ chain: unichainSepolia, transport: http(RPC) });
    const wallet = createWalletClient({ account: acct, chain: unichainSepolia, transport: http(RPC) });
    const bal = await pub.getBalance({ address: acct.address });
    if (bal === 0n) throw new Error(`fund ${acct.address} with Unichain Sepolia ETH first`);

    // Deploy a fresh ERC-20 pair the wizard can reference (minted to the test account).
    const cfg = { name: "E2E UI Pair", symbol: "E2EU", totalSupply: parseUnits("1000000", 18) };
    const { result, request } = await pub.simulateContract({ account: acct, address: FACTORY, abi: FACTORY_ABI, functionName: "deployToken", args: [cfg, acct.address] });
    pair = result as Address;
    // Pin the nonce explicitly + retry. The public RPC is load-balanced and nodes disagree on the nonce
    // (one reports 8, another 0), so trust the authoritative "next nonce N" the node returns on rejection.
    let nonce = Number(await pub.getTransactionCount({ address: acct.address, blockTag: "latest" }));
    let hash: Hex | undefined;
    for (let i = 0; i < 12 && !hash; i++) {
      try {
        hash = await wallet.writeContract({ ...request, nonce });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const next = msg.match(/next nonce (\d+)/i);
        if (next) nonce = Number(next[1]);
        else if (/nonce too low|already known/i.test(msg)) nonce++;
        else throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!hash) throw new Error("pair deploy: nonce retries exhausted");
    await pub.waitForTransactionReceipt({ hash });
    // ride out RPC head-lag before the UI reads the new token
    for (let i = 0; i < 8; i++) {
      const code = await pub.getCode({ address: pair }).catch(() => undefined);
      if (code && code !== "0x") break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.log(`[beforeAll] launcher ${acct.address}  pair ${pair}`);
  });

  test("fresh-ERC20 + ERC-20 pair auto-launch via the UI", async ({ context, page }) => {
    // Inject the wallet shim before any app code runs, then install it with the test key.
    await context.addInitScript({ content: readFileSync(SHIM_BUNDLE, "utf8") });
    await context.addInitScript(
      ([key, rpc, chainId]) => window.__installE2EWallet?.({ key: key as `0x${string}`, rpc, chainId: Number(chainId) }),
      [pk, SHIM_RPC, String(CHAIN_ID)] as const,
    );

    page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message.slice(0, 200)}`));

    await page.goto("/launch");

    // wagmi auto-connects the injected shim; if a Connect button is shown instead, drive it.
    const connectBtn = page.getByRole("button", { name: /Connect wallet/ });
    if (await connectBtn.first().isVisible().catch(() => false)) {
      await connectBtn.first().click();
      await page.locator("div.absolute.z-20").getByRole("button").first().click();
    }
    await expect(page.getByText(/Disconnect/).first()).toBeVisible();
    // EOA gate must pass (TEST_ADDR_1 is a clean EOA) — fail fast if a 7702-delegated key slipped in.
    await expect(page.getByText(/Smart-contract wallet detected/)).toHaveCount(0);

    // Step 1 — Token: keep the "Deploy new" defaults (Demo Token / DEMO / 1,000,000).
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2 — Pool & price: ERC-20 pair, paste the deployed pair, set seeds.
    await page.getByRole("button", { name: "ERC-20" }).click();
    await page.getByPlaceholder("0x pair token (e.g. USDC)").fill(pair);
    await page.getByLabel("Seed token amount").fill("100000");
    await page.getByLabel(/Seed pair amount/).fill("1");
    await page.getByLabel(/Launch duration/).fill("1");
    await page.getByRole("button", { name: "Next" }).click();

    // Step 3 — Mechanisms: leave all off.
    await page.getByRole("button", { name: "Next" }).click();

    // Step 4 — Review: confirm the auto note (orientation-bound values are computed on-chain).
    await expect(page.getByText(/computed on-chain when you launch/)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 5 — Sign & launch: the shim auto-serves the Permit2 approve, signature, and launch tx.
    await page.getByRole("button", { name: /Launch campaign/ }).click();

    // Resolve as soon as either success or a launch error appears (don't burn the full timeout on a revert).
    const ok = page.getByText(/Campaign launched/);
    const err = page.locator("p.text-red-400");
    await expect(ok.or(err).first()).toBeVisible({ timeout: 220_000 });
    if (await err.first().isVisible().catch(() => false)) {
      throw new Error(`launch failed in UI: ${await err.first().innerText()}`);
    }
    const pid = await page.getByText(/^PoolId:/).innerText();
    console.log(`  ✓ UI launch ${pid}`);
    expect(pid).toMatch(/0x[0-9a-fA-F]{64}/);

    // The success view links to the trade page for this pool.
    await expect(page.getByRole("link", { name: /Trade/ })).toBeVisible();
  });
});
