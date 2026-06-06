"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { maxUint256, parseEventLogs, type Address, type Hex } from "viem";

import { CampaignWrapperAbi, Erc20Abi, TokenFactoryAbi } from "@/lib/config/abi";
import { CONTRACTS } from "@/lib/config/contracts.generated";
import { PERMIT2 } from "@/lib/config/uniswap";
import { type SupportedChainId } from "@/lib/config/chains";
import { prepareLaunch, type LaunchFormInput } from "./launch";
import { buildPermitData } from "./permit2";

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
}

export function useLaunch(chainId: SupportedChainId) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const [stage, setStage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<{ pid: Hex; hash: Hex } | undefined>();

  async function approvePermit2IfNeeded(token: Address, amount: bigint) {
    const allowance = (await client!.readContract({
      address: token,
      abi: Erc20Abi,
      functionName: "allowance",
      args: [address as Address, PERMIT2],
    })) as bigint;
    if (allowance >= amount) return;
    setStage(`Approving ${token.slice(0, 8)}… for Permit2`);
    const hash = await writeContractAsync({ chainId, address: token, abi: Erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] });
    await client!.waitForTransactionReceipt({ hash });
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
      const dh = await writeContractAsync(sim.request);
      await client.waitForTransactionReceipt({ hash: dh });
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
      whitelistWindowMinutes: 30,
    };

    const prepared = prepareLaunch(input, Math.floor(Date.now() / 1000));

    // 2) Permit2: approve each ERC-20 side, then sign a batch granting the wrapper its pull allowance.
    let permitData: Hex = "0x";
    if (prepared.permitTokens.length > 0) {
      for (const t of prepared.permitTokens) await approvePermit2IfNeeded(t.token, t.amount);
      setStage("Signing Permit2 batch");
      permitData = await buildPermitData({
        owner: address,
        spender: wrapper,
        chainId,
        permit2: PERMIT2,
        tokens: prepared.permitTokens,
        publicClient: client,
        signTypedData: signTypedDataAsync as never,
      });
    }

    // 3) simulate → write → wait
    setStage("Simulating launch");
    const { request } = await client.simulateContract({
      account: address,
      address: wrapper,
      abi: CampaignWrapperAbi,
      functionName: "launchCampaign",
      args: [prepared.params, permitData],
      value: prepared.value,
    });
    setStage("Launching campaign");
    const hash = await writeContractAsync(request);
    const receipt = await client.waitForTransactionReceipt({ hash });
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
      const msg = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message.split("\n")[0] : "Launch failed";
      setError(msg);
      setStage(undefined);
      return undefined;
    }
  }

  return { run, stage, error, result, ZERO };
}
