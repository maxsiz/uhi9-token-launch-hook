"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { formatUnits, maxUint256, parseEventLogs, type Address, type Hex } from "viem";

import { CampaignWrapperAbi, CampaignWrapperAutoAbi, Erc20Abi } from "@/lib/config/abi";
import { CONTRACTS } from "@/lib/config/contracts.generated";
import { PERMIT2 } from "@/lib/config/uniswap";
import { type SupportedChainId } from "@/lib/config/chains";
import { decodeContractError } from "@/lib/tx/revert";
import { buildPermitData } from "./permit2";
import { prepareAutoLaunch, prepareLaunch, type LaunchFormInput, type ModuleConfigInput } from "./launch";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

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
  const { signTypedDataAsync } = useSignTypedData();
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

  type Pull = { token: Address; amount: bigint };

  /** Fail fast (before any approval) if the deployer lacks the seed amounts — clear message vs an
   *  undecodable launchCampaign simulate revert from the Permit2.transferFrom pull. */
  async function preflightBalances(pulls: Pull[], value: bigint) {
    setStage("Checking balances");
    for (const t of pulls) {
      const bal = (await client!.readContract({ address: t.token, abi: Erc20Abi, functionName: "balanceOf", args: [address as Address] })) as bigint;
      if (bal < t.amount) {
        const dec = (await client!.readContract({ address: t.token, abi: Erc20Abi, functionName: "decimals" }).catch(() => 18)) as number;
        const sym = (await client!.readContract({ address: t.token, abi: Erc20Abi, functionName: "symbol" }).catch(() => t.token.slice(0, 8))) as string;
        throw new Error(`Insufficient ${sym}: need ${formatUnits(t.amount, dec)}, have ${formatUnits(bal, dec)}`);
      }
    }
    if (value > 0n) {
      const ethBal = await client!.getBalance({ address: address as Address });
      if (ethBal < value) throw new Error(`Insufficient ETH: need ${formatUnits(value, 18)} (plus gas), have ${formatUnits(ethBal, 18)}`);
    }
  }

  /** token → Permit2 (on-chain approve, once per token), then a single gasless Permit2 batch signature
   *  (Permit2 → wrapper) folded into the launch tx. "0x" when nothing is pulled. */
  async function signPermit(pulls: Pull[], wrapper: Address): Promise<Hex> {
    for (const t of pulls) await approvePermit2IfNeeded(t.token, t.amount);
    if (pulls.length === 0) return "0x";
    setStage("Sign the Permit2 approval");
    return buildPermitData({ owner: address as Address, spender: wrapper, chainId, permit2: PERMIT2, tokens: pulls, publicClient: client!, signTypedData: signTypedDataAsync });
  }

  /** simulate → write → wait → parse the CampaignLaunched event. */
  async function submitLaunch(wrapper: Address, abi: unknown, args: readonly unknown[], value: bigint): Promise<{ pid: Hex; hash: Hex }> {
    setStage("Simulating launch");
    const { request } = await client!.simulateContract({ account: address as Address, address: wrapper, abi, functionName: "launchCampaign", args, value } as never);
    setStage("Launching campaign");
    const hash = await writeContractAsync(request);
    setPendingHash(hash);
    const receipt = await client!.waitForTransactionReceipt({ hash });
    setPendingHash(undefined);
    if (receipt.status !== "success") throw new Error("launch reverted");
    const events = parseEventLogs({ abi: CampaignWrapperAbi, logs: receipt.logs, eventName: "CampaignLaunched" });
    const pid = (events[0]?.args as { pid: Hex } | undefined)?.pid;
    if (!pid) throw new Error("CampaignLaunched not found in receipt");
    setStage(undefined);
    return { pid, hash };
  }

  async function launch(form: WizardForm): Promise<{ pid: Hex; hash: Hex }> {
    if (!client || !address) throw new Error("Wallet not connected");
    setError(undefined);
    setResult(undefined);
    const { wrapper } = CONTRACTS[chainId];

    const base = {
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

    let out: { pid: Hex; hash: Hex };

    if (form.tokenMode === "new" && form.pairMode === "erc20") {
      // Fresh token + ERC-20 pair → auto-priced overload: the wrapper deploys the token in the same tx
      // and computes the price/ticks/liquidity on-chain (no pre-deploy, only the pair is pulled).
      const input: LaunchFormInput = {
        ...base,
        newToken: { name: form.name, symbol: form.symbol, totalSupply: form.totalSupply },
        tokenDecimals: 18,
        pair: { address: form.pairAddress, decimals: form.pairDecimals },
      };
      const { autoParams, permitTokens } = prepareAutoLaunch(input, Math.floor(Date.now() / 1000));
      await preflightBalances(permitTokens, 0n);
      const permitData = await signPermit(permitTokens, wrapper);
      out = await submitLaunch(wrapper, CampaignWrapperAutoAbi, [autoParams, permitData], 0n);
    } else {
      // Existing token, or fresh token + native ETH → fully pre-computed CampaignParams overload.
      const existingToken = form.tokenMode === "existing" ? form.existingToken : undefined;
      const input: LaunchFormInput = {
        ...base,
        newToken: form.tokenMode === "new" ? { name: form.name, symbol: form.symbol, totalSupply: form.totalSupply } : undefined,
        existingToken,
        tokenAddress: existingToken,
        tokenDecimals: form.tokenMode === "existing" ? form.existingTokenDecimals : 18,
        pair: form.pairMode === "native" ? { native: true } : { address: form.pairAddress, decimals: form.pairDecimals },
      };
      const prepared = prepareLaunch(input, Math.floor(Date.now() / 1000));
      await preflightBalances(prepared.permitTokens, prepared.value);
      const permitData = await signPermit(prepared.permitTokens, wrapper);
      out = await submitLaunch(wrapper, CampaignWrapperAbi, [prepared.params, permitData], prepared.value);
    }

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
