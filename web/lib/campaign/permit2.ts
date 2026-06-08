/**
 * Permit2 batch signing for ERC-20 launches (existing token and/or ERC-20 pair). Returns `0x` when no
 * pull is needed (fresh token + native ETH). The encoded `(PermitBatch, signature)` tuple matches
 * `abi.decode(permitData, (IAllowanceTransfer.PermitBatch, bytes))` in CampaignWrapper.launchCampaign.
 *
 * The EIP-712 domain + types come from @uniswap/permit2-sdk (`AllowanceTransfer.getPermitData`), the
 * source of truth for the Permit2 schema. We build the message and the ABI encoding ourselves (one
 * object for both signing and encoding) with viem bigints, so there's no ethers BigNumber in the
 * signing path and the signed bytes always match the encoded bytes.
 */
import { AllowanceTransfer } from "@uniswap/permit2-sdk";
import { encodeAbiParameters, type Address, type Hex, type PublicClient } from "viem";
import { Permit2Abi } from "@/lib/config/abi";

export const EMPTY_PERMIT: Hex = "0x";

const MAX_UINT160 = (1n << 160n) - 1n; // Permit2 MaxAllowanceTransferAmount
const SIG_DEADLINE_SECS = 60 * 30; // 30 min to submit the launch tx
const PERMIT_EXPIRATION_SECS = 60 * 60 * 24 * 30; // 30 days of allowance

const PERMIT_BATCH_TUPLE = {
  type: "tuple",
  components: [
    {
      name: "details",
      type: "tuple[]",
      components: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint160" },
        { name: "expiration", type: "uint48" },
        { name: "nonce", type: "uint48" },
      ],
    },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
} as const;

interface PermitDetail {
  token: Address;
  amount: bigint;
  expiration: number;
  nonce: number;
}
interface PermitBatch {
  details: PermitDetail[];
  spender: Address;
  sigDeadline: bigint;
}

/** Minimal typed-data signer shape (wagmi `signTypedDataAsync` is compatible). */
type SignTypedData = (args: {
  domain: { name: string; chainId: number; verifyingContract: Address };
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: "PermitBatch";
  message: Record<string, unknown>;
}) => Promise<Hex>;

export interface Permit2Input {
  owner: Address;
  spender: Address; // CampaignWrapper
  chainId: number;
  permit2: Address;
  tokens: { token: Address; amount: bigint }[];
  publicClient: PublicClient;
  signTypedData: SignTypedData;
}

/** Current Permit2 nonce for (owner, token, spender) — required by AllowanceTransfer.permit. */
async function readNonce(i: Permit2Input, token: Address): Promise<number> {
  const res = (await i.publicClient.readContract({
    address: i.permit2,
    abi: Permit2Abi,
    functionName: "allowance",
    args: [i.owner, token, i.spender],
  })) as readonly [bigint, number, number];
  return res[2];
}

export async function buildPermitData(i: Permit2Input): Promise<Hex> {
  if (i.tokens.length === 0) return EMPTY_PERMIT;

  const now = Math.floor(Date.now() / 1000);
  const expiration = now + PERMIT_EXPIRATION_SECS;
  const sigDeadline = BigInt(now + SIG_DEADLINE_SECS);

  const details: PermitDetail[] = await Promise.all(
    i.tokens.map(async (t) => ({
      token: t.token,
      amount: MAX_UINT160, // approve max; the wrapper pulls only amountMax per side
      expiration,
      nonce: await readNonce(i, t.token),
    }))
  );

  const batch: PermitBatch = { details, spender: i.spender, sigDeadline };

  // SDK is the source of truth for the EIP-712 domain + types (de-risks the typed-data schema).
  const { domain, types } = AllowanceTransfer.getPermitData(batch, i.permit2, i.chainId) as {
    domain: { name: string; chainId: number; verifyingContract: Address };
    types: Record<string, readonly { name: string; type: string }[]>;
  };

  const signature = await i.signTypedData({ domain, types, primaryType: "PermitBatch", message: batch as unknown as Record<string, unknown> });

  return encodeAbiParameters([PERMIT_BATCH_TUPLE, { type: "bytes" }], [batch, signature]);
}
