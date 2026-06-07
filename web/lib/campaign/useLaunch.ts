"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { maxUint256, parseEventLogs, type Address, type Hex } from "viem";

import { CampaignWrapperAbi, Erc20Abi, Permit2Abi, TokenFactoryAbi } from "@/lib/config/abi";
import { CONTRACTS } from "@/lib/config/contracts.generated";
import { PERMIT2 } from "@/lib/config/uniswap";
import { type SupportedChainId } from "@/lib/config/chains";
import { prepareLaunch, type LaunchFormInput } from "./launch";

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
}

export function useLaunch(chainId: SupportedChainId) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
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

    // DEBUG: log the tx cost plan (value + L2 gas) vs balance — reveals "insufficient funds".
    try {
      const [gas, gasPrice, bal] = await Promise.all([
        client.estimateContractGas({ account: address, address: wrapper, abi: CampaignWrapperAbi, functionName: "launchCampaign", args: [prepared.params, "0x"], value: prepared.value }),
        client.getGasPrice(),
        client.getBalance({ address }),
      ]);
      const l2Fee = gas * gasPrice;
      console.log(
        "[Launch] cost plan\n" +
          JSON.stringify(
            {
              pair: form.pairMode,
              valueWei: prepared.value.toString(),
              amount0Max: prepared.params.amount0Max.toString(),
              amount1Max: prepared.params.amount1Max.toString(),
              gas: gas.toString(),
              gasPrice: gasPrice.toString(),
              l2FeeWei: l2Fee.toString(),
              valuePlusL2FeeWei: (prepared.value + l2Fee).toString(),
              balanceWei: bal.toString(),
              enoughForValuePlusL2: bal >= prepared.value + l2Fee,
            },
            null,
            2
          )
      );
    } catch (e) {
      console.warn("[Launch] estimateContractGas threw (the tx would revert / insufficient funds):", (e as Error)?.message);
    }

    // 2) Permit2 allowance for each ERC-20 side: token → Permit2, then Permit2 → wrapper (direct, no
    //    signature). The wrapper pulls via Permit2.transferFrom, so permitData stays "0x".
    const expiration = Math.floor(Date.now() / 1000) + PERMIT2_EXPIRATION_SECS;
    for (const t of prepared.permitTokens) {
      await approvePermit2IfNeeded(t.token, t.amount);
      setStage(`Enabling ${t.token.slice(0, 8)}… on the launcher`);
      const gh = await writeContractAsync({ chainId, address: PERMIT2, abi: Permit2Abi, functionName: "approve", args: [t.token, wrapper, MAX_UINT160, expiration] });
      await client.waitForTransactionReceipt({ hash: gh });
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
      console.error("[Launch] full error", e); // DEBUG: see the complete cause/metaMessages
      const msg = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message.split("\n")[0] : "Launch failed";
      setError(msg);
      setStage(undefined);
      return undefined;
    }
  }

  return { run, stage, error, result, ZERO };
}
