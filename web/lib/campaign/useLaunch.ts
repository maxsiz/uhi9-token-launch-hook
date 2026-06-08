"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, maxUint256, parseEventLogs, type Address, type Hex } from "viem";

import { CampaignWrapperAbi, Erc20Abi, Permit2Abi, TokenFactoryAbi } from "@/lib/config/abi";
import { CONTRACTS } from "@/lib/config/contracts.generated";
import { PERMIT2 } from "@/lib/config/uniswap";
import { type SupportedChainId } from "@/lib/config/chains";
import { decodeContractError } from "@/lib/tx/revert";
import { prepareLaunch, type LaunchFormInput, type ModuleConfigInput } from "./launch";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const MAX_UINT160 = (1n << 160n) - 1n;
const PERMIT2_EXPIRATION_SECS = 60 * 60 * 24 * 30;

export interface WizardForm {
  tokenMode: "new" | "existing";
  name: string;
  symbol: string;
  totalSupply: bigint;
  existingToken: Address;
  existingTokenDecimals: number;
  pairMode: "native" | "erc20";
  pairAddress: Address;
  pairDecimals: number;
  seedToken: string;
  seedPair: string;
  durationDays: number;
  enabled: { antiSnipe: boolean; tax: boolean; lock: boolean; whitelist: boolean };
  modules: ModuleConfigInput;
  whitelistWindowMinutes: number;
}

export function useLaunch(chainId: SupportedChainId) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const [stage, setStage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<{ pid: Hex; hash: Hex } | undefined>();
  const [pendingHash, setPendingHash] = useState<Hex | undefined>();

  // Send a validated write request and wait for it to mine, tracking the pending hash so the UI can show
  // a "transaction pending" spinner + explorer link during the (sometimes long) mining wait.
  async function sendAndWait(request: Parameters<typeof writeContractAsync>[0]): Promise<Hex> {
    const hash = await writeContractAsync(request);
    setPendingHash(hash);
    await client!.waitForTransactionReceipt({ hash });
    setPendingHash(undefined);
    return hash;
  }

  async function approvePermit2IfNeeded(token: Address, amount: bigint) {
    const allowance = (await client!.readContract({
      address: token,
      abi: Erc20Abi,
      functionName: "allowance",
      args: [address as Address, PERMIT2],
    })) as bigint;
    if (allowance >= amount) return;
    setStage(`Approving ${token.slice(0, 8)}… for Permit2`);
    const { request } = await client!.simulateContract({ account: address as Address, address: token, abi: Erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] });
    await sendAndWait(request);
  }

  async function launch(form: WizardForm): Promise<{ pid: Hex; hash: Hex }> {
    if (!client || !address) throw new Error("Wallet not connected");
    setError(undefined);
    setResult(undefined);
    const { wrapper, factory } = CONTRACTS[chainId];

    // 1) Resolve the launched-token address. A fresh token paired with an ERC-20 must be deployed first
    //    so currency ordering (orientation) is known before pricing.
    let tokenAddress: Address | undefined;
    let existingToken: Address | undefined;
    let tokenDecimals = 18;

    if (form.tokenMode === "existing") {
      existingToken = form.existingToken;
      tokenAddress = form.existingToken;
      tokenDecimals = form.existingTokenDecimals;
    } else if (form.pairMode === "erc20") {
      setStage("Deploying token on the factory");
      const cfg = { name: form.name, symbol: form.symbol, totalSupply: form.totalSupply };
      const sim = await client.simulateContract({ account: address, address: factory, abi: TokenFactoryAbi, functionName: "deployToken", args: [cfg, address] });
      tokenAddress = sim.result as Address;
      await sendAndWait(sim.request);
      existingToken = tokenAddress; // now held by the deployer → pulled via Permit2
    }
    // else: fresh token + native ETH — wrapper deploys it, orientation known (ETH = currency0).

    const input: LaunchFormInput = {
      newToken: form.tokenMode === "new" ? { name: form.name, symbol: form.symbol, totalSupply: form.totalSupply } : undefined,
      existingToken,
      tokenAddress,
      tokenDecimals,
      pair: form.pairMode === "native" ? { native: true } : { address: form.pairAddress, decimals: form.pairDecimals },
      seedTokenHuman: form.seedToken,
      seedPairHuman: form.seedPair,
      launchDurationDays: form.durationDays,
      tickSpacing: 60,
      staticFee: 3000,
      rangeTicks: 6000,
      slippageBps: 50,
      lpRecipient: address,
      enabled: form.enabled,
      modules: form.modules,
      whitelistWindowMinutes: form.whitelistWindowMinutes,
    };

    const prepared = prepareLaunch(input, Math.floor(Date.now() / 1000));

    // 2) Pre-flight: make sure the deployer actually holds the seed amounts BEFORE sending any
    //    approvals, so a doomed launch fails fast with a clear reason instead of an undecodable
    //    launchCampaign simulate revert (the wrapper pulls the token via Permit2.transferFrom).
    setStage("Checking balances");
    for (const t of prepared.permitTokens) {
      const bal = (await client.readContract({ address: t.token, abi: Erc20Abi, functionName: "balanceOf", args: [address] })) as bigint;
      if (bal < t.amount) {
        const dec = (await client.readContract({ address: t.token, abi: Erc20Abi, functionName: "decimals" }).catch(() => 18)) as number;
        const sym = (await client.readContract({ address: t.token, abi: Erc20Abi, functionName: "symbol" }).catch(() => t.token.slice(0, 8))) as string;
        throw new Error(`Insufficient ${sym}: need ${formatUnits(t.amount, dec)}, have ${formatUnits(bal, dec)}`);
      }
    }
    if (prepared.value > 0n) {
      const ethBal = await client.getBalance({ address });
      if (ethBal < prepared.value) {
        throw new Error(`Insufficient ETH: need ${formatUnits(prepared.value, 18)} (plus gas), have ${formatUnits(ethBal, 18)}`);
      }
    }

    // 3) Permit2 allowance for each ERC-20 side: token → Permit2, then Permit2 → wrapper (direct, no
    //    signature). The wrapper pulls via Permit2.transferFrom, so permitData stays "0x".
    const now = Math.floor(Date.now() / 1000);
    const expiration = now + PERMIT2_EXPIRATION_SECS;
    for (const t of prepared.permitTokens) {
      await approvePermit2IfNeeded(t.token, t.amount);
      // Skip the Permit2 → wrapper approve when a sufficient, unexpired allowance already exists.
      const [allowed, exp] = (await client.readContract({ address: PERMIT2, abi: Permit2Abi, functionName: "allowance", args: [address, t.token, wrapper] })) as [bigint, number, number];
      if (allowed >= t.amount && exp > now + 300) continue;
      setStage(`Enabling ${t.token.slice(0, 8)}… on the launcher`);
      const { request } = await client.simulateContract({ account: address, address: PERMIT2, abi: Permit2Abi, functionName: "approve", args: [t.token, wrapper, MAX_UINT160, expiration] });
      await sendAndWait(request);
    }

    // 3) simulate → write → wait
    setStage("Simulating launch");
    const { request } = await client.simulateContract({
      account: address,
      address: wrapper,
      abi: CampaignWrapperAbi,
      functionName: "launchCampaign",
      args: [prepared.params, "0x"],
      value: prepared.value,
    });
    setStage("Launching campaign");
    const hash = await writeContractAsync(request);
    setPendingHash(hash);
    const receipt = await client.waitForTransactionReceipt({ hash });
    setPendingHash(undefined);
    if (receipt.status !== "success") throw new Error("launch reverted");

    const events = parseEventLogs({ abi: CampaignWrapperAbi, logs: receipt.logs, eventName: "CampaignLaunched" });
    const pid = (events[0]?.args as { pid: Hex } | undefined)?.pid;
    if (!pid) throw new Error("CampaignLaunched not found in receipt");
    setStage(undefined);
    const out = { pid, hash };
    setResult(out);
    return out;
  }

  async function run(form: WizardForm) {
    try {
      return await launch(form);
    } catch (e: unknown) {
      setError(decodeContractError(e, "Launch failed"));
      setStage(undefined);
      setPendingHash(undefined);
      return undefined;
    }
  }

  return { run, stage, error, result, pendingHash, ZERO };
}
